# דרור — Dror

**A private therapeutic memory assistant for Israeli psychologists. The backend, rebuilt from zero on Base44.**

Live app: **https://dror-b44-6f3cb1e4.base44.app**

> «החופש להתרכז במטופל» — *the freedom to focus on the patient*

### What you're looking at

A mobile-first Hebrew, right-to-left web app where a psychologist talks to Dror. Dror is not a form
with an AI button bolted on — it is an assistant that holds the therapist's caseload in memory,
answers grounded questions about it ("what did we work on with Itai last month?"), and, when asked,
writes real clinical drafts into the record. Everything a therapist can see belongs to that
therapist and no one else; every document Dror produces arrives as a draft the therapist reviews,
edits and signs off. Open the live URL on a phone — the layout, the type and the voice loop were all
designed for one hand and one thumb.

---

## The honest story

Dror is a real product and a real company ([dror-ai.com](https://dror-ai.com)), founded by **Sagi
Argaman**. It predates this competition. The validation predates it too: 40+ interviews with Israeli
private-practice psychologists, who lose 10–15 hours a month to documentation, and who work under a
hard constraint from the Israeli psychologists' ethics committee — **clinical material may not be
put through open, general-purpose AI models**. That constraint is the reason Dror exists as a
product rather than as a prompt someone pastes into a chatbot, and it is why privacy architecture
here is a feature, not a footnote.

What was built for the **Base44 Dev Build-Off** is the thing this repository contains: the entire
backend — data model, access control, the agent, the AI functions, auth, hosting — rebuilt from
nothing on Base44 during the build week. Git history starts on **2026-07-25**; all 27 commits carry
that date. Nothing was carried over from the existing product's stack. The pitch is *"a founder
rebuilds a validated product on Base44 in a week,"* never *"look what I invented this week."*

---

## What Dror does

A walk in demo order.

1. **Sign in** — Google, or email + password with an OTP verification step
   (`src/screens/Login.tsx`, `base44/auth/config.jsonc`).
2. **A seeded caseload** — four patients from the design, with real record depth behind them:
   איתי (18 sessions), נועה (12), דניאל (7), מיכל (23). Seeded by `scripts/seed.ts`, idempotently.
3. **Ask Dror anything** — the chat bar sits on every screen. Questions are answered from *this
   therapist's* records only; if the record doesn't say it, Dror says it doesn't know.
4. **Ask Dror to act** — «תכין סיכום לפגישה של איתי» ("draft a summary for Itai's session") makes the
   agent find the patient, read their file, and *create a real Entry* — as a draft, waiting in that
   patient's world.
5. **The summary flow** — record the session with live Hebrew transcription, or type notes; add your
   own emphases; Dror returns a three-part Hebrew summary (נושאים מרכזיים / התרשמות קלינית / המשך טיפול)
   in the editor, numbered by the patient's real session count.
6. **The official-document flow** — pick a document type (אישור טיפול, מכתב לקופת חולים, …), state its
   purpose, choose which past sessions it may draw on, and get a formal Hebrew letter with the
   addressee line deliberately left blank for the therapist to fill.
7. **Record from anywhere** — a global recorder that doesn't need a patient chosen first. Stop it,
   assign it to an existing or brand-new patient, and it saves the recording *and* immediately drafts
   a summary from the transcript.
8. **Talk to Dror** — the orb opens a speech-to-speech conversation: Hebrew speech recognition →
   the real agent → spoken reply → listens again, hands-free, between sessions.

---

## Backend depth on Base44

This is the part that was built this week, and it is where the interesting decisions are.

### Three entities, per-therapist RLS from the first push

`base44/entities/patient.jsonc`, `entry.jsonc`, `chat.jsonc`. Base44's rule is unforgiving and
worth stating plainly: **an entity with no `rls` block is readable and writable by everyone,
including anonymous visitors.** For a clinical product that is not a default to discover later. All
three entities shipped with the same block from their very first push:

```jsonc
"rls": {
  "create": true,
  "read":   { "created_by": "{{user.email}}" },
  "update": { "created_by": "{{user.email}}" },
  "delete": { "created_by": "{{user.email}}" }
}
```

Scoping is therefore enforced by the platform on every read and write, including reads made by the
agent and by backend functions, not by application code that could forget. `Patient` holds identity
and standing context; `Entry` is the single record type for summaries, documents and recordings
(`type` + `is_draft`); `Chat` persists conversation history alongside the resumable agent
`conversation_id`.

### The `dror` agent — and why it can only write drafts

`base44/agents/dror.jsonc` is a managed conversational agent: Base44 runs the tool-calling loop.
Its tools are entity tools, deliberately asymmetric:

```jsonc
"tool_configs": [
  { "entity_name": "Patient", "allowed_operations": ["read"] },
  { "entity_name": "Entry",   "allowed_operations": ["read", "create"] },
  { "entity_name": "Chat",    "allowed_operations": ["read"] }
]
```

Read broadly, create narrowly, **never update, never delete**. An assistant that can rewrite or
remove clinical history is not an assistant a therapist can be asked to trust, and the platform's
`allowed_operations` make that a configuration fact rather than a promise. On top of it, the agent's
Hebrew instructions bind every Entry it creates to `is_draft = true` — nothing Dror writes enters the
record as finished work; it lands in the patient's world for the therapist to open, edit and sign.
That is the governance principle of the whole product expressed in a config file: *Dror drafts, the
therapist decides.* (Where the draft-only rule is instruction-enforced rather than platform-enforced,
see [Privacy posture](#privacy-posture) — we say so rather than round it up.)

Memory is scoped to the individual therapist and forbidden from bleeding across conversations
(`"scope": "user"`, `"include_other_conversation_context": false`) — a meaningful setting when the
content is patient material.

**Transport** (`src/api/ai.ts`): agents are conversational, not request/response, so the app uses
`agents.createConversation` → `agents.addMessage` → `agents.subscribeToConversation`, with a
`getConversation` poll as a backstop because the realtime channel is a WebSocket and can miss a
terminal update. There is no token streaming on the platform, so the UI shows a "דרור חושב…" state
and then the whole reply. A reply is only accepted as final once no tool call is still running and a
short settle window has passed — otherwise the app would answer the therapist with the agent's
mid-loop thinking. Patient-scoped conversations open with a context envelope carrying the patient id
and today's date, and the agent resolves records from there through its own tools.

### Three Deno backend functions

| Function | File | What it does |
|---|---|---|
| `summarize` | `base44/functions/summarize/entry.ts` | Hebrew session summary from a transcript or typed notes |
| `document` | `base44/functions/document/entry.ts` | Formal Hebrew clinical letter from selected sessions |
| `tts` | `base44/functions/tts/entry.ts` | Dror's spoken voice for the conversation overlay |

Each runs on Deno and starts the same way: `createClientFromRequest(req)`, which inherits the
*caller's* auth. That single line is what makes context assembly safe — when `summarize` loads the
patient and their recent entries, it is reading through the caller's own RLS scope, so a
patient id belonging to another therapist resolves to nothing at all. Both drafting functions look
the patient up with `filter({ id })` rather than `get(id)` so an out-of-scope id returns an empty
list instead of throwing a distinguishable error.

Both use `InvokeLLM` with a `response_json_schema` (`{ title, body }`), so the app receives a
structured object and never parses prose for a title. `InvokeLLM` takes no `model` parameter on this
platform — model selection lives at the gateway/agent level — and the code says so at the call site
rather than pretending otherwise.

One piece of hygiene worth calling out, because it was a real bug found in review: session numbering.
A patient's session number is the count of their non-draft summaries, and the SDK's `filter()`
defaults to sorting by `-created_date` with a limit of 50. Left implicit, a patient past their 50th
session would be silently truncated and renumbered — quietly wrong on exactly the long-running cases
that matter most. Both functions now pass sort and limit explicitly:

```ts
const priorSummaries = await base44.entities.Entry.filter(
  { patient_id: patientId, type: "summary", is_draft: false },
  "entry_date",
  5000
);
```

`tts` reads its ElevenLabs key from platform secrets (`Deno.env.get("ELEVENLABS_API_KEY")`) so the
key never reaches the browser, and returns a clean `503 no_key` when it isn't configured. The client
(`src/api/tts.ts`) treats that as a signal, not an error, and falls back to the browser's own
`speechSynthesis` Hebrew voice. **As of this deploy the key is not set**, so what you will hear in
the live demo is the browser voice; setting the secret and redeploying switches the path with no code
change.

### Auth and hosting

Email/password with OTP verification (`register` → `verifyOtp` → `loginViaEmailPassword`) and Google
sign-in, both configured in `base44/auth/config.jsonc` and shipped by `base44 deploy` along with
entity schemas, functions, agent config and the built SPA.

---

## Privacy posture

Honest accounting of what is guaranteed by the platform, what is guaranteed by instructions, and
what is still open.

**Platform-enforced.** Per-therapist scoping is RLS, evaluated by Base44 on every operation — the
app, the agent and the backend functions all read through it. Verified for real, not asserted:
`scripts/verify-rls.ts` runs server-side via `base44 exec` against the live app. Its
scoping-relevant results:

- **Visible set** — `Patient.list()` from the seeded account returns exactly the four seeded
  patients and nothing else.
- **Ownership stamping** — records carry the creating user's id, and the seeded patient's
  `created_by_id` matches `auth.me().id`. (Finding: the live API does **not** populate the
  `created_by` email field that the SDK's type declares, so the check compares ids.)

The script's two other checks — a filter on a nonexistent patient id, and a `get()` on a fabricated
id — are reported in the build log as *not-found handling, not access control*: they would behave
identically with RLS switched off entirely, so they prove nothing about scoping and are not counted
as evidence here.

**Still open.** That script runs as one account, so it demonstrates scoped reads and ownership
stamping for that account. It cannot prove cross-account isolation — that a *second* therapist sees
none of this data — because that needs a second live Base44 account. A manual two-account check by
the founder is **pending** and is written up as pending in `docs/context/build-log.md` rather than
quietly omitted.

**Instruction-enforced, not platform-enforced.** The agent's draft-only rule. Base44's `tool_configs`
can grant or deny the *create* operation, but cannot constrain the *values* written inside it — so
`is_draft = true` holds because the agent's instructions say it must, not because the platform
rejects anything else. The residual risk is bounded: any entry the agent creates is still RLS-scoped
to the authenticated therapist, so the worst case is a non-draft entry in that therapist's own world,
not a cross-tenant leak. Server-side coercion of `is_draft` on agent-originated writes is on the
roadmap below.

**Browser speech APIs — disclosed.** Live Hebrew transcription (in the summary flow, the global
recorder, and the voice conversation) uses the **Web Speech API**, which in Chrome routes captured
audio to the *browser vendor's* speech service for recognition. That is a real third-party hop for
session audio and it is named here rather than buried: Base44 has no native transcription or TTS
integration today, so this was the only route to a working live-transcription demo inside the build
week. Moving transcription to a platform-native or self-hosted path is the first item on the roadmap
and would be a gate on any clinical deployment.

**Model use.** Clinical text is sent to a model only to produce the draft the therapist explicitly
asked for — no background analysis, no cross-patient mining, no consumer chat product in the loop.
Dror trains no model on clinical content. What the underlying model vendor does with API traffic is
governed by Base44's platform agreements rather than by anything this repository can assert, and
verifying that contract is a pre-launch gate, not a claim to make here.

---

## Architecture

```
                    Hebrew RTL SPA  (React + Vite, mobile-first)
        screens · overlays · orb · state machine (src/state/useAppState.ts)
                                  │
                                  ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  src/api/  —  the ONLY boundary that touches the Base44 SDK          │
  │                                                                      │
  │  base44Client.ts   createClient({ appId })     (single instance)     │
  │  data.ts           auth + Patient/Entry/Chat CRUD                    │
  │  ai.ts             askDror() · summarizeSession() · draftDocument()  │
  │  tts.ts            speakHebrew()  → function, else browser voice     │
  │  format.ts         pure helpers (dates, names, session counts)       │
  └──────────────────────────────────────────────────────────────────────┘
         │                        │                          │
         ▼                        ▼                          ▼
   ENTITIES                    AGENT                     FUNCTIONS  (Deno)
   Patient                     dror                      summarize ─┐
   Entry                       tools: Patient(r)         document  ─┤─ InvokeLLM
   Chat                               Entry(r,create)               │  (+ json schema)
                                      Chat(r)            tts ───────┘─ ElevenLabs
   RLS: created_by ==          conversation API:                       (secret key)
        {{user.email}}         create → addMessage                       ↓ 503 no_key
        on every op            → subscribe / poll                    browser speech
```

**The single-data-layer pattern.** Exactly one file constructs the SDK client, and exactly one
directory imports it. No screen, overlay or hook ever reaches for `base44` directly — they call
`listPatients()`, `askDror()`, `speakHebrew()`. This is what kept a week-long build honest: the
entity shape, the agent transport quirks (raw axios responses, `.data` payloads, WebSocket
subscriptions that need a poll backstop) and the TTS fallback chain are each solved once, in one
place, with the reasoning written next to the code. When a review found the session-numbering bug,
there were two call sites to fix — not twenty.

---

## Running locally

```bash
npm install
npx base44 login          # authenticate the CLI against your Base44 account
npm run dev               # Vite dev server against the live Base44 backend
```

Other commands:

```bash
npm test                  # vitest — 13 tests (date/name/session-count helpers, chat scope derivation)
npm run build             # production build into ./dist
npx base44 deploy --yes   # entities → functions → agent → auth → site
```

Seed a demo caseload (Deno required; `base44 exec` reads the script from **stdin** and runs it
server-side, pre-authenticated as the logged-in CLI user):

```bash
cat scripts/seed.ts | npx base44 exec         # idempotent: re-running creates nothing
cat scripts/verify-rls.ts | npx base44 exec   # the scripted half of the privacy check
```

---

## Roadmap

- **Platform-native transcription and TTS** — remove the browser-vendor speech hop for session audio,
  and give Dror a consistent voice that doesn't depend on the device.
- **Server-side draft coercion** — force `is_draft = true` on agent-originated writes in a backend
  function, turning the draft-only guarantee from instruction-enforced into platform-enforced.
- **Agent function-tools** — give the agent the `summarize`/`document` functions as tools so a
  conversational request runs the same tuned pipeline the flows do, with deeper multi-step actions.
- **Calendar management** — sessions, reminders, and pre-session memory refreshers that arrive
  before the therapist has to ask.
- **Smart Clinic integration** — the practice-management system Israeli private practices already
  live in, so records and scheduling stop being two separate worlds.

---

## Build log

`docs/context/build-log.md` is the honest day-by-day record: what was built, what broke, what was
verified by running it, and what is still pending. It includes the real seed-script output (both
runs, including the idempotent second one), the RLS verification findings with their caveats stated
as caveats, and the accepted residual risks. `docs/context/base44-facts.md` is the platform
ground-truth sheet the build worked from — extracted from the official Base44 skill docs, with
**NOT DOCUMENTED** written wherever the docs were silent rather than filled in from guesswork.

## Credits

Built by **Sagi Argaman** (founder, Dror — [dror-ai.com](https://dror-ai.com)) with **Claude
(Anthropic)** as pair-programmer. Every commit in this repository is co-authored, and the build log
records the collaboration as it actually happened.
