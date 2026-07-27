# Privacy infrastructure — field encryption, a single data choke point, and the speech path

**Date:** 2026-07-27
**Status:** approved design, not yet implemented
**Scope:** the infrastructure half of Dror's privacy posture. The clinical-record half
(§ד consent, §ו AI-use documentation, §ח disclosure) is explicitly **out of scope** and
belongs in a second spec — see [Out of scope](#out-of-scope).

---

## Why

Dror exists because the Israeli psychologists' ethics committee forbids putting clinical
material through open AI models. The binding text is
`Dror - אתיקה/עקרונות וכללי אתיקה לשימוש בכלי בינה מלאכותית` (ועדת האתיקה, הפ"י,
23.3.26). Three clauses drive this design:

- **§ג (סודיות מקצועית).** Uploading psychological-record material to an inadequately
  secured AI tool is a breach of confidentiality and privilege. Critically, the breach
  exists **"גם ללא אזכור פרטים מזהים מפורשים של המטופל"** — even with no explicit
  identifiers, and even with altered ones — because AI tools may cross-reference other
  data and expose identity. *Any design that leans on pseudonymisation as its defence is
  ruled out by this sentence.* Work on a specific client's material is permitted only in
  dedicated systems secured for the purpose, where confidentiality is **technically**
  assured, and the duty of verification (חובת הבירור) rests on the psychologist.
- **§ב (מקצועיות).** When choosing a tool, the psychologist should examine its
  information-security and privacy policy and whether it suits sensitive client data, and
  should **prefer tools with public, transparent information**. A published posture is a
  product feature, not a compliance chore.
- **§ט (פיתוח והפעלה).** Whoever builds the tool carries responsibility for how user data
  is collected, for users' privacy, and for operating it in a secure environment.

Today Dror stores every clinical field as plaintext and relies entirely on Base44's
platform guarantees. This spec narrows that exposure.

## What this does and does not protect against

Stated first, because the rest of the document is only honest in light of it.

**Protects against:** a leaked or stolen database dump, an exfiltrated backup, and an RLS
rule that is later misconfigured — three common breach classes in which the attacker
obtains rows but not the platform's secret store.

**Does not protect against Base44 itself.** Base44 holds both the ciphertext and the key.
§ג's "is the tool secured to a level ensuring full protection of professional
confidentiality" is answered by the **contract** with Base44 — a DPA covering sensitive
medical data, plus confirmation of Israeli Privacy Protection Law compliance — not by
this code. The DPA remains the load-bearing item and no amount of encryption substitutes
for it.

**Does not protect the model call.** Producing a draft requires sending clinical text to a
model. That is inherent to the product; the relevant control is *which* model, under
*whose* agreement, which is a vendor question.

---

## Architecture

Approach: **choke point first, encryption second.** Move the agent and the frontend onto
backend functions while the data is still plaintext, verify nothing regressed against
readable data, then switch encryption on inside those functions. This separates the two
risky changes — a behavioural refactor of the headline feature, and a one-way data
migration — so they cannot fail simultaneously and leave the cause ambiguous.

```
  React SPA ──► src/api/data.ts ──► base44/functions/data/        ─┐
  (unchanged    (signatures         (RPC: list/save ops)           │
   screens)      unchanged)                                        │
                                                                   ├─► base44/shared/
  dror agent ──► find_patient · get_patient_context               │    crypto.ts
                 search_records · create_draft                    ─┘    records.ts
                                                                          │
                              every function: createClientFromRequest(req)
                              → the caller's own RLS scope, unchanged
```

`base44/shared/` is the only directory outside a function folder that Base44 uploads
(reachable via `../../shared/…`), so the crypto exists in exactly one file rather than
being duplicated per function.

---

## 1. Field classification

### Encrypted

| Entity | Fields |
|---|---|
| `Patient` | `context_notes` |
| `Entry` | `body`, `transcript`, `title`, `tags` |
| `PatientDoc` | `extracted_text` |
| `Chat` | `title`, `messages[].text` |

`Chat.messages` is included deliberately: it is the therapist thinking out loud about
named patients, which is as clinical as a summary. Titles and tags are included because
"סיכום פגישה — התקף חרדה" is clinical on its own, and a chat title is generated from the
therapist's own first message; encrypting them costs nothing once every list already
passes through the choke point, since no query sorts or filters on either — the entry
list sorts on `entry_date` and the chat list on `updated_date`.

### Plaintext, each for a reason

| Field(s) | Reason |
|---|---|
| `id`, `patient_id`, `created_by`, `created_by_id` | RLS evaluation and every join depend on them |
| `Entry.type`, `entry_date`, `is_draft`, `duration_seconds` | Every list sorts and filters on these server-side |
| `Patient.first_name`, `last_name` | The agent's navigation is partial-name lookup; ciphertext cannot be partial-matched |
| `Patient.treatment_since`, `Chat.conversation_id` | Non-clinical metadata |
| `TherapistPref.*` | The therapist's own method and guidelines — professional material, not a patient's |

### Known residual

Patient names remain readable, and the association "person X is a patient of therapist Y"
is itself privileged information. It cannot be removed without removing the product. This
belongs in the published privacy posture as a stated limit rather than being left for
someone to discover.

---

## 2. The envelope

An encrypted field stores a JSON string in the existing field. **No entity schema changes
are required** — every field remains `"type": "string"`.

```json
{"v":1,"iv":"<base64, 12 bytes>","ct":"<base64>"}
```

- **Cipher:** AES-256-GCM via Web Crypto (`crypto.subtle`) in Deno.
- **IV:** freshly generated per encryption, never reused.
- **AAD:** `"<Entity>:<field>"`, binding a ciphertext to the field it belongs to so it
  cannot be relocated into a different field and still decrypt. Array and nested fields
  use the flattened path — `"Entry:tags"`, `"Chat:messages.text"` — the same string for
  every element, since element order carries no security meaning here.
- **Detection:** a value counts as an envelope only if it parses as JSON **and** has
  `v === 1` **and** base64-shaped `iv` and `ct`. Anything else is returned untouched.

That detection rule is what makes migration survivable: encrypted and plaintext records
coexist and both read correctly, so the migration is incremental rather than a flag day.

Its accepted cost: someone who can already **write** to the database could replace an
envelope with plaintext and it would be read back as plaintext. This is accepted because
an attacker with write access to the record store has strictly greater powers than that,
and because the alternative — refusing to read any non-envelope — would make the
incremental migration impossible. It should be revisited if a "all records must be
encrypted by now" assertion is ever wanted; `verify-encryption.ts` is where that check
would live.

**Key management.** 32 random bytes, base64, installed with
`npx base44 secrets set DROR_FIELD_KEY=…` and read via `Deno.env.get("DROR_FIELD_KEY")`.
Never committed, never shipped to the browser.

**Rotation** is designed in, not retrofitted: a second secret `DROR_FIELD_KEY_PREV` is
tried when the current key fails to decrypt. Writes always use the current key, so
records re-encrypt lazily as they are edited. The `v` field reserves room for a future
change of cipher or KDF.

---

## 3. Shared modules

### `base44/shared/crypto.ts`

Pure — no SDK, no entity knowledge, no I/O beyond Web Crypto. Unit-testable under vitest.

```
encrypt(plaintext: string, aad: string): Promise<string>   // → envelope JSON
decrypt(value: string, aad: string): Promise<string>       // envelope → plaintext; passes through non-envelopes
isEnvelope(value: string): boolean
```

`decrypt` passing non-envelopes through unchanged is what lets a half-migrated database
read correctly. It is the single most important behaviour in the module and is tested
directly.

### `base44/shared/records.ts`

The one place that knows which fields are sensitive.

```
CLINICAL_FIELDS: Record<EntityName, string[]>
encryptRecord(entity, record): Promise<record>
decryptRecord(entity, record): Promise<record>
```

Three field shapes must be handled, and the field map declares which is which: plain
strings (`body`, `context_notes`), string arrays (`Entry.tags`), and a nested field inside
an object array (`Chat.messages[].text`). Adding a clinical field later is a one-line
change here rather than an audit of every call site.

---

## 4. The agent

`base44/agents/dror.jsonc` `tool_configs` becomes **four function tools and zero entity
tools**:

| Tool | Purpose |
|---|---|
| `find_patient(query)` | RLS-scoped patient list, partial first/last-name match. No decryption needed — names are plaintext. |
| `get_patient_context(patient_id, limit?)` | The patient, their recent entries, their docs and the therapist's prefs, all decrypted. Replaces what the agent assembles across four tools today. |
| `search_records(query, patient_id?)` | Fetch within RLS scope, decrypt, match. |
| `create_draft(patient_id, type, title, body)` | The agent's only write path. |

**`create_draft` hard-sets `is_draft: true` server-side.** Because the agent no longer
holds any entity write tool, "Dror only ever produces drafts" stops being an instruction
it is asked to follow and becomes structural — there is no other write path it can reach.
This closes the residual risk recorded as accepted in `docs/context/build-log.md`.

The agent's Hebrew instructions must be updated in the same change: the sections that
describe reading Patient/Entry/Chat/PatientDoc and creating an Entry directly now
describe these four tools instead. The draft-only rule stays in the prose as well as in
the function — belt and braces, since the prose is also what makes the agent *tell the
therapist* the draft is waiting.

**Honest cost.** There is no encrypted search. `search_records` must fetch and decrypt
candidates inside the RLS scope to match them — bounded to one patient when `patient_id`
is supplied, and capped otherwise. If a practice grows large enough for this to be slow,
the fix is a separate searchable index, which is a different spec.

---

## 5. The frontend

A single `base44/functions/data/entry.ts`, RPC-style on `{ op, args }`:

`list_patients` · `create_patient` · `save_patient_context` · `list_entries` ·
`save_entry` · `delete_entry` · `list_chats` · `save_chat` · `create_patient_doc`

All run under `createClientFromRequest(req)`, so RLS is entirely unchanged — the
functions read through the caller's own scope exactly as `summarize` and `document`
already do.

**`src/api/data.ts` keeps its exact exported signatures.** `listPatients()`,
`listEntries(patientId)`, `createEntry(e)` and the rest change their bodies from
`base44.entities.X` calls to `base44.functions.invoke('data', …)` calls and nothing else.
No screen changes. That is the reason for the RPC shape: one file moves, not fifteen.

`summarize` and `document` also gain decryption — they read the patient and recent
entries to build their prompts, so they must decrypt what they read and encrypt the
transcript they persist.

`src/api/docs.ts` already uploads to private storage and must additionally route
`extracted_text` through the encrypting create path.

---

## 6. The speech path

Today Chrome uses the Web Speech API, which sends captured audio to the **browser
vendor's** speech service — a vendor with no agreement covering this material. iPhone
already avoids it via the `stt` function to ElevenLabs.

**Rule:** dictation is clinical if the surface is the session recorder or the summary
flow, **or** the active chat has a `patient_id`. Clinical dictation records locally and
posts to `stt`. Non-clinical dictation may use Web Speech.

This is deliberately not "chat bars are non-clinical", which is not reliably true. Binding
it to `Chat.patient_id` means the protection engages automatically the moment a therapist
opens a patient's file and starts talking, without asking them to classify their own
speech.

Implemented as **one exported predicate** consumed by all three surfaces —
three surfaces deciding this independently is how such a rule drifts. Unit-tested.

Cost: no words-as-you-speak on clinical dictation. Accepted. On iPhone nothing changes.

---

## 7. Migration

Ordered so the app is never broken and nothing becomes unrecoverable.

1. **Export plaintext.** `scripts/export-plaintext.ts` via `base44 exec`, written to local
   disk and kept offline. The only recovery path if the key is lost.
2. **Generate the key and keep an independent copy** — a password manager, not only
   Base44's secret store. If that store is lost with no copy, every summary and transcript
   is permanently unreadable. **This is the highest-stakes step in the design.**
3. **Deploy `shared/` and the functions while data is still plaintext.** They read both
   forms, so the therapist sees no change. Verify the app behaves exactly as before.
4. **Migrate** with `scripts/encrypt-existing.ts` — idempotent (skips existing envelopes)
   and resumable, so an interrupted run is safe by construction.
5. **Verify** with `scripts/verify-encryption.ts` (below).

**Rollback:** `scripts/decrypt-existing.ts`, the mirror of step 4, usable for as long as
the key exists.

---

## 8. Failure handling

- **Missing key → fail closed.** A function with no `DROR_FIELD_KEY` returns 500. It never
  writes plaintext into a field meant to be encrypted, and never returns a raw envelope to
  the UI as though it were text.
- **One bad record must not kill a list.** A decrypt failure inside `list_entries` returns
  that row with its clinical fields nulled and a flag set, so the world screen still
  renders and the therapist sees a single unreadable record rather than a blank app. The
  failure is logged.
- **Interrupted migration** is safe by construction — mixed plaintext/ciphertext states
  read correctly by design (§2).

---

## 9. Testing

**vitest (pure logic — where most of the risk lives):**

- `crypto.ts`: round-trip; wrong key fails; **tampered ciphertext fails** (GCM auth tag);
  AAD mismatch fails; IV differs across two encryptions of identical plaintext;
  `isEnvelope` rejects ordinary Hebrew clinical text, JSON that lacks `v`, and JSON with a
  wrong `v`.
- `records.ts`: every field named in §1 is present in `CLINICAL_FIELDS` — so adding a
  field later cannot silently skip encryption; round-trip over realistic records including
  the nested `Chat.messages[].text` case.
- The dictation predicate: clinical for the recorder and summary flow, clinical for a
  patient-bound chat, non-clinical for an unbound chat.

**Server-side (no Deno test runner in this repo — same pattern as `verify-rls.ts`):**

`scripts/verify-encryption.ts`, run via `base44 exec`, asserting that a freshly written
entry's stored `body` **is** an envelope when read raw from the entity, and **is**
plaintext when read back through the `data` function. That is the actual proof that
encryption is in force, rather than an assertion in a document.

---

## Implementation phases

This spec is larger than one implementation plan and decomposes into three, in this
order. Each is independently shippable and independently verifiable.

1. **The choke point, no encryption.** `shared/records.ts` field map (identity transforms
   for now), the `data` function, `src/api/data.ts` rewired, the agent's four function
   tools and updated instructions, `create_draft` enforcing `is_draft`. Verified against
   plaintext data, so any regression in agent behaviour or screen rendering is visible
   immediately. Ships a real win on its own: the draft-only rule becomes structural.
2. **Encryption and migration.** `shared/crypto.ts`, wiring it into `records.ts`, the key,
   `summarize`/`document`/`docs.ts` decryption, then the export → migrate → verify
   sequence of §7.
3. **The speech path.** The dictation predicate and moving clinical dictation onto `stt`.
   Independent of 1 and 2; could be done first if preferred.

## Out of scope

This spec covers infrastructure. The clinical-record obligations are separate work and
should follow immediately in their own spec:

- **§ד — הסכמה מדעת.** Written, per-patient informed consent before any AI use in that
  patient's context, covering purpose, method, limitations, how confidentiality is
  maintained, alternatives, and risks. Dror has no consent record today.
- **§ו — ניהול הרשומה.** The use of an AI tool must itself be documented in the patient's
  record. Dror keeps no audit trail of what was AI-generated.
- **§ח — פסיכולוגיה משפטית.** Official opinions must disclose that AI tools were used.
  Dror drafts letters to ביטוח לאומי and the army with no disclosure line.
- **§ב — documented independent judgment.** Dror does not record what the therapist
  changed versus accepted in a draft.

Also out of scope, and not solvable in code: the **Base44 DPA** covering sensitive medical
data, and confirmation of Israeli Privacy Protection Law and record-management compliance.
Both are gates on any clinical deployment.
