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
