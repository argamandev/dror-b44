# Dror on Base44 — build log

Honest record of the from-zero rebuild for the Base44 Dev Build-Off (window 2026-07-21 → 2026-07-28).
Product/company predate this week (dror-ai.com); this repo and its backend are built from zero starting 2026-07-25.

## 2026-07-25 — Day 1

- `npx base44 create dror-b44 --template backend-and-client` → app id `6a649a6401a472806f3cb1e4`.
  Hit the free-tier 5-app limit twice; Sagi deleted unused apps to free slots.
- Installed official Base44 agent skills; extracted platform ground truth into `docs/context/base44-facts.md`. Key facts that shaped the build:
  - Agents are conversation-driven from the SDK (`agents.createConversation/addMessage/subscribeToConversation`).
  - Agent config (`base44/agents/*.jsonc`): `tool_configs` = entity tools with `allowed_operations` (read/create/update/delete) — the Dror agent can act, not just answer.
  - `InvokeLLM` has no `model` parameter; model ids live at the gateway/agent level.
  - No native transcription or TTS → recordings use browser live-transcription (Web Speech API); Dror's voice uses external TTS for replies only. Both disclosed here and in README.
  - Entities without an `rls` block are open to everyone — every Dror entity ships with RLS from the first push.
  - Functions: Deno `entry.ts`, `createClientFromRequest(req)` inherits caller auth; frontend `functions.invoke()` returns axios response (`.data`).
  - Signup = `register()` + OTP `verifyOtp()` before email/password login works.
- Template observations: JS scaffold (jsx + jsconfig), Tailwind + shadcn-style ui components, example Task entity + task_manager agent (both removed — replaced by Dror's real model).
- **`is_draft` residual risk (accepted):** the Dror agent's draft-only rule for Entry creation ("is_draft = true תמיד. לעולם אל תיצור רשומה שאינה טיוטה" in `base44/agents/dror.jsonc`) is enforced only by the agent's own instructions — Base44's `tool_configs` grant an entity operation (create) but cannot constrain the *values* written within it, so there is no platform-level guarantee the agent always sets `is_draft: true`. The residual risk is bounded: every Entry the agent creates is still scoped by RLS to the currently-authenticated therapist's own account (per the `tool_configs`/RLS model in `docs/context/base44-facts.md`), so the worst case is a non-draft entry landing in the therapist's own world, not a cross-tenant leak or an unreviewable record. Accepted as-is for the competition build; server-side coercion of `is_draft: true` on agent-originated writes (e.g. a Deno function wrapping the create, or a DB-level check) is listed as roadmap hardening rather than blocking this build.

### Demo seed script + privacy verification

- **`scripts/seed.ts`** (run via `cat scripts/seed.ts | npx base44 exec`, pre-authenticated as
  the CLI user `sagi.arg@gmail.com` — the founder's own demo account; Deno required, already
  installed at `C:\Users\Sagi\.deno` from Task 7). Seeds the four demo patients from the design
  mock (`Dror.dc.html` lines 565-589): איתי (18 sessions), נועה (12), דניאל (7), מיכל (23), where
  "sessions" = non-draft `summary` Entry count (`sessionCount()` in `src/api/format.ts`).
  Idempotent and **convergent**: a patient is matched on full name (first+last) exactly, falling
  back to first-name-only ONLY when the seed target itself has no last name AND exactly one
  existing patient shares that first name (otherwise a new patient is created, so the script can
  never silently top up synthetic entries onto an unrelated same-first-name record) — so the
  leftover Task-7 smoke-test patient "איתי לוי" is reused, not duplicated; entries are topped up
  weekly-backwards from the mock's anchor date (2026-07-21) to reach each target count, skipping
  any date already occupied. איתי's three verbatim mock entries (two real summaries + one real
  doc, mock lines 567-569) are inserted by exact title match if missing. Re-running the script
  after targets are met creates 0 new records — verified by running it twice.

  **Real output, first run** (created 16+12+7+23 = 58 non-draft summary entries, + 1 doc entry
  for איתי's verbatim "אישור טיפול" letter = **59 new entries total**, + 3 new patients):
  ```
  Final seed summary (non-draft summary counts = "sessions"):
  Patient         Target  Existing  Created
  איתי לוי        18      2         16
  נועה            12      0         12
  דניאל           7       0         7
  מיכל            23      0         23
  ```
  **Real output, second run** (idempotence check):
  ```
  Final seed summary (non-draft summary counts = "sessions"):
  Patient         Target  Existing  Created
  איתי לוי        18      18        0
  נועה            12      12        0
  דניאל           7       7         0
  מיכל            23      23        0
  ```
  Post-seed spot check confirmed exact in-app `sessionCount` values: 18/12/7/23.

- **`scripts/verify-rls.ts`** (same `exec` invocation) — the scripted half of the privacy pass.
  Of its four checks, **(a) and (d) are the scoping-relevant evidence**; (b) and (c) are included
  for completeness but do not by themselves demonstrate access control:
  (a) `Patient.list()` from this account returns exactly the 4 seeded patients, nothing more — this
  is the one that actually shows reads are limited to this account's own records;
  (b) `Entry.filter({ patient_id: <nonexistent-id> })` returns `[]` — this only tests **not-found
  handling**: a nonexistent id returns nothing regardless of whether RLS is enabled at all, so it
  is not evidence of access control;
  (c) `Patient.get(<fabricated 24-char id>)` **throws** a 404 ("Entity Patient with ID … not
  found") — same caveat as (b): a fabricated/nonexistent id 404s whether or not RLS is enabled, so
  this also tests not-found handling, not access control;
  (d) ownership stamping — **finding**: the live Patient API response does **not** populate a
  `created_by` (email) field at all, only `created_by_id`, despite the SDK docs' `ServerEntityFields`
  type listing `created_by?: string | null` as a server field. The script falls back to comparing
  `created_by_id` against the current user's `id` (`base44.auth.me().id`), which matched
  (`true`) on the seeded מיכל patient.

  **Honest scope note (per controller resolution):** this script proves ownership stamping and
  RLS-scoped reads for the **current account only**. It cannot prove cross-account isolation (that
  a *second* therapist's account sees none of this data) — that requires a second live Base44
  account. **Pending:** the founder (Sagi) will run a manual two-account check from his phone
  (log in as a second account, confirm the patient list is empty and no seeded data is reachable)
  to close out that half of the privacy verification.
