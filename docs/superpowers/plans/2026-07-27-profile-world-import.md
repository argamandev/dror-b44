# Patient Profile + World Design Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the patient profile and patient's world screens to the current Claude Design mock, back their new content with real data (topic tags, treatment-start month), delete recordings once their summary is saved, and remove the white block at the bottom of the app.

**Architecture:** The two screens are rewritten in place against the mock's exact values; both keep the repo's inline-`CSSProperties` idiom and the safe-area tokens. New branchy logic lives in pure, unit-tested helpers in `src/api/format.ts` (`topicTags`, `formatSince`, `profileSubtitle`, `hebrewMonth`). Two entity fields (`Entry.tags`, `Patient.treatment_since`) and one prompt/schema change in `summarize` supply the data. The recording lifecycle is threaded from `RecordOverlay` → `useAppState.flowRecordingId` → `Draft.recordingId` → `saveDraft`, which deletes it after the summary write.

**Tech Stack:** Vite + React 19 SPA (TypeScript, no CSS classes — inline style consts), vitest for pure logic, Base44 entities (`.jsonc` with embedded RLS) and Deno backend functions.

## Global Constraints

- Hebrew RTL throughout; calm, restrained voice; no emoji.
- Copy strings exactly as written in this plan (they are the mock's, verbatim).
- No new dependencies. Styles inline, matching each file's existing idiom.
- `src/api/` remains the only boundary touching the Base44 SDK.
- Entities without an `rls` block are world-readable — never add one; existing blocks stay byte-identical.
- Safe areas come only from the tokens (`--top-inset`, `--bottom-inset`, `--chatbar-bottom`); no new `env()` reader.
- Gates before deploy: `npx vitest run`, `npx tsc --noEmit`, `npm run build`, all clean.
- Spec: `docs/superpowers/specs/2026-07-27-profile-world-import-design.md`.

---

### Task 1: The white block

**Files:**
- Modify: `src/components/AppFrame.tsx` (frameStyle)
- Modify: `src/styles/base.css` (html/body background rule)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Frame fills its parent instead of measuring the viewport**

In `frameStyle`, replace `minHeight: '100dvh'` with:

```ts
  height: '100%',
  minHeight: '100%',
```

Update the surrounding comment to say the frame fills the pinned document
(`html`/`body` are `position:fixed; inset:0`, `#root` is `height:100%`), so no
viewport unit is involved and no strip can be left uncovered at the bottom.

- [ ] **Step 2: body stops painting an opaque colour**

In `base.css`, the rule that currently reads
`html,body{position:fixed;inset:0;overflow:hidden;width:100%;height:100%;overscroll-behavior:none;background:var(--bg-warm)}`
keeps everything except the background, which moves to `html` alone:

```css
html{background:var(--bg-warm)}
```

Add a comment: `chromeColor.ts` writes the per-screen colour to
`document.documentElement`, so any residual sliver takes the current screen's
tone (dark under an overlay) instead of a flat near-white.

- [ ] **Step 3: Gates**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppFrame.tsx src/styles/base.css
git commit -m "Frame fills the pinned document; body no longer paints over the chrome colour"
```

---

### Task 2: Pure helpers for the new screen content

**Files:**
- Modify: `src/api/format.ts`
- Test: `src/api/format.test.ts`

**Interfaces:**
- Produces:
  - `hebrewMonth(month: number): string` — 1-12 → `'ינואר'`…`'דצמבר'`, `''` otherwise.
  - `formatSince(value: string | undefined): string` — `'2026-07'` → `'בטיפול מאז יולי 2026'`; empty/malformed → `''`.
  - `profileSubtitle(since: string | undefined, sessions: number): string` — `'בטיפול מאז יולי 2026 · 3 פגישות'`, or `'3 פגישות'` when `formatSince` is empty.
  - `topicTags(entry: { tags?: string[]; body?: string; title: string }): string[]` — up to 3 strings, never empty.

- [ ] **Step 1: Write the failing tests**

```ts
describe('formatSince', () => {
  it('formats a YYYY-MM value as a Hebrew month and year', () => {
    expect(formatSince('2026-07')).toBe('בטיפול מאז יולי 2026');
  });
  it('returns empty for an unset value', () => {
    expect(formatSince('')).toBe('');
    expect(formatSince(undefined)).toBe('');
  });
  it('returns empty for a malformed value rather than inventing a month', () => {
    expect(formatSince('2026')).toBe('');
    expect(formatSince('2026-13')).toBe('');
    expect(formatSince('nonsense')).toBe('');
  });
});

describe('profileSubtitle', () => {
  it('joins the start month and the session count', () => {
    expect(profileSubtitle('2026-07', 3)).toBe('בטיפול מאז יולי 2026 · 3 פגישות');
  });
  it('falls back to the session count alone when no start month is set', () => {
    expect(profileSubtitle('', 3)).toBe('3 פגישות');
  });
});

describe('topicTags', () => {
  it('prefers the stored tags', () => {
    expect(topicTags({ tags: ['לחץ בעבודה', 'שינה'], body: '', title: 'סיכום' })).toEqual([
      'לחץ בעבודה',
      'שינה',
    ]);
  });
  it('caps stored tags at three', () => {
    expect(topicTags({ tags: ['א', 'ב', 'ג', 'ד'], title: 'ת' })).toEqual(['א', 'ב', 'ג']);
  });
  it('parses the topics section out of a summary body when there are no tags', () => {
    const body =
      'רשומה רפואית\nפגישה שלישית.\n\nרשומה אישית\nתוכן הפגישה:\nדיברנו על העבודה.\n\nתסמינים ונושאים:\nלחץ בעבודה, שינה, גבולות\n\nהמשך טיפול:\nלהמשיך.';
    expect(topicTags({ body, title: 'סיכום פגישה 3' })).toEqual(['לחץ בעבודה', 'שינה', 'גבולות']);
  });
  it('falls back to the title when there is nothing to parse', () => {
    expect(topicTags({ body: 'טקסט חופשי', title: 'מכתב לצבא — אבנר' })).toEqual([
      'מכתב לצבא — אבנר',
    ]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/api/format.test.ts`
Expected: FAIL — the helpers are not exported.

- [ ] **Step 3: Implement**

```ts
const HEB_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

export function hebrewMonth(month: number): string {
  return HEB_MONTHS[month - 1] ?? '';
}

// 'YYYY-MM' (what the month input in the patient-context overlay stores).
export function formatSince(value: string | undefined): string {
  const m = /^(\d{4})-(\d{2})$/.exec((value ?? '').trim());
  if (!m) return '';
  const name = hebrewMonth(Number(m[2]));
  return name ? `בטיפול מאז ${name} ${m[1]}` : '';
}

export function profileSubtitle(since: string | undefined, sessions: number): string {
  const head = formatSince(since);
  const tail = `${sessions} פגישות`;
  return head ? `${head} · ${tail}` : tail;
}

// The world screen's row headline. Stored tags win; older entries fall back to
// the summary's own topics section, and anything else to the title — a row is
// never blank.
const TOPICS_HEADING = 'תסמינים ונושאים';

export function topicTags(entry: { tags?: string[]; body?: string; title: string }): string[] {
  const stored = (entry.tags ?? []).map((t) => t.trim()).filter(Boolean);
  if (stored.length) return stored.slice(0, 3);
  const parsed = parseTopics(entry.body ?? '');
  if (parsed.length) return parsed;
  return [entry.title];
}

function parseTopics(body: string): string[] {
  const idx = body.indexOf(TOPICS_HEADING);
  if (idx === -1) return [];
  const after = body.slice(idx + TOPICS_HEADING.length).replace(/^\s*:?/, '');
  const block = after.split(/\n\s*\n/)[0] ?? '';
  return block
    .split(/[,\n·]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/api/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/format.ts src/api/format.test.ts
git commit -m "Add topicTags, formatSince and profileSubtitle helpers"
```

---

### Task 3: Entity fields, types, and the data layer

**Files:**
- Modify: `base44/entities/entry.jsonc` (add `tags`)
- Modify: `base44/entities/patient.jsonc` (add `treatment_since`)
- Modify: `src/api/data.ts` (types, `updatePatientContext`, `deleteEntry`)
- Modify: `base44/.types/types.d.ts` (regenerated)

**Interfaces:**
- Produces:
  - `Entry.tags: string[]`, `Patient.treatment_since: string`
  - `deleteEntry(id: string): Promise<void>`
  - `updatePatientContext(id: string, notes: string, treatmentSince: string): Promise<void>` — replaces `updatePatientNotes`.

- [ ] **Step 1: Add the entity properties**

In `entry.jsonc`, inside `properties`, after `transcript`:

```jsonc
    "tags":             { "type": "array", "items": { "type": "string" }, "default": [] }
```

In `patient.jsonc`, after `context_notes`:

```jsonc
    "treatment_since": { "type": "string", "default": "" }
```

Leave both `rls` blocks untouched.

- [ ] **Step 2: Update the frontend types and calls**

In `src/api/data.ts`: add `tags: string[]` to `Entry`, `treatment_since: string` to
`Patient`, and:

```ts
export const updatePatientContext = (
  id: string,
  notes: string,
  treatmentSince: string
): Promise<void> =>
  base44.entities.Patient.update(id, { context_notes: notes, treatment_since: treatmentSince });

export const deleteEntry = (id: string): Promise<void> => base44.entities.Entry.delete(id);
```

Remove `updatePatientNotes` and fix its one caller in Task 6.

- [ ] **Step 3: Push the entities and regenerate types**

Run: `npx base44 entities push --yes && npx base44 types generate`
Expected: `Entry` and `Patient` reported as updated; `base44/.types/types.d.ts`
gains `tags?: string[]` and `treatment_since?: string`.

- [ ] **Step 4: Commit**

```bash
git add base44/entities src/api/data.ts base44/.types/types.d.ts
git commit -m "Add Entry.tags and Patient.treatment_since"
```

---

### Task 4: summarize returns tags

**Files:**
- Modify: `base44/functions/summarize/entry.ts`
- Modify: `src/api/ai.ts`

**Interfaces:**
- Consumes: `Entry.tags` from Task 3.
- Produces: `summarizeSession(...)` resolves to `{ title: string; body: string; tags: string[] }`.

- [ ] **Step 1: Extend the function's schema and prompt**

Add `tags` to `response_json_schema.properties`:

```ts
          tags: { type: "array", items: { type: "string" } },
```

and to `required`. Append to the prompt, after the `שדה title` line:

```
שדה tags: מערך של עד שלושה נושאים קצרים בעברית (מילה או שתיים כל אחד) — בדיוק אותם נושאים שכתבת בסעיף "תסמינים ונושאים", בלי מילות קישור ובלי משפטים שלמים.
```

Return `tags` from the handler, defaulting to `[]` when the model omits it (an
empty array must not be an error — only `title`/`body` gate the 502).

- [ ] **Step 2: Thread it through the API wrapper**

In `src/api/ai.ts`, widen `summarizeSession`'s return type to include
`tags: string[]`, defaulting to `[]` when absent.

- [ ] **Step 3: Gates**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add base44/functions/summarize/entry.ts src/api/ai.ts
git commit -m "summarize returns the summary's topic tags"
```

---

### Task 5: Recording lifecycle — saved on assign, deleted with the summary

**Files:**
- Modify: `src/overlays/RecordOverlay.tsx`
- Modify: `src/state/useAppState.ts` (`Draft`, `flowRecordingId`, `openFlow`, `saveDraft`)
- Modify: `src/overlays/FlowOverlay.tsx` (`onDraftReady` payload)
- Modify: `src/App.tsx` (wiring)

**Interfaces:**
- Consumes: `deleteEntry` (Task 3), `summarizeSession` returning `tags` (Task 4).
- Produces:
  - `Draft` gains `tags?: string[]` and `recordingId?: string | null`.
  - `openFlow(type, source?: string | null, recordingId?: string | null)`
  - `startSummaryFlow(source: string, recordingId: string | null)` (RecordOverlay prop)
  - `onDraftReady({ title, body, tags })` (FlowOverlay prop)

- [ ] **Step 1: RecordOverlay files the recording again**

Restore the `createEntry` call in `finishAssign`, before opening the flow, and
pass the created id on:

```tsx
    let recordingId: string | null = null;
    try {
      const rec = await createEntry({
        patient_id: patient.id,
        type: 'rec',
        title: 'הקלטת פגישה',
        entry_date: new Date().toISOString(),
        body: 'הקלטה באורך ' + fmtTimer(seconds),
        is_draft: false,
        duration_seconds: seconds,
        transcript: saved.transcript,
        tags: [],
      });
      recordingId = rec.id;
    } catch {
      // The recording is a safety net, not the deliverable — if filing it
      // fails, the summary flow still opens with the transcript in hand.
    }
    await openPatient(patient.id);
    if (closedRef.current) return;
    startSummaryFlow(saved.transcript, recordingId);
```

`saved` goes back to holding `{ seconds, transcript }` (both are needed again),
set from `recorder.stop()`'s result in `handleFinish`.

- [ ] **Step 2: State carries the recording through the flow**

In `useAppState.ts`: add `recordingId?: string | null` and `tags?: string[]` to
`Draft`; add `const [flowRecordingId, setFlowRecordingId] = useState<string | null>(null);`
export it; widen `openFlow`:

```ts
  const openFlow = useCallback(
    (type: Draft['type'], source: string | null = null, recordingId: string | null = null) => {
      setFlowType(type);
      setFlowSource(source);
      setFlowRecordingId(recordingId);
      setOverlay('flow');
    },
    []
  );
```

In `saveDraft`, after the create/update succeeds, pass `tags: draft.tags ?? []`
to `createEntry`, then delete the recording:

```ts
      if (draft.recordingId) {
        // Maximum-security rule: the raw recording never outlives the summary
        // written from it. A failed delete is swallowed — the summary is saved
        // either way, and the recording is not reachable from the UI.
        await deleteEntry(draft.recordingId).catch(() => {});
      }
```

- [ ] **Step 3: FlowOverlay hands the tags up**

`onDraftReady` becomes `(result: { title: string; body: string; tags?: string[] }) => void`;
`handleCreateDraft` passes the `summarizeSession` result straight through.
`handleCreateDocDraft` passes `{ ...result, tags: [] }`.

- [ ] **Step 4: App wires both ends**

`RecordOverlay`'s prop becomes
`startSummaryFlow={(source, recordingId) => state.openFlow('summary', source, recordingId)}`.
`FlowOverlay`'s `onDraftReady` sets `tags` and
`recordingId: state.flowRecordingId` on the draft it creates.

- [ ] **Step 5: Gates**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/overlays/RecordOverlay.tsx src/overlays/FlowOverlay.tsx src/state/useAppState.ts src/App.tsx
git commit -m "Recording is filed on assign and deleted when its summary is saved"
```

---

### Task 6: Treatment-start month in the patient context overlay

**Files:**
- Modify: `src/overlays/PatientContextOverlay.tsx`

**Interfaces:**
- Consumes: `updatePatientContext` (Task 3), `Patient.treatment_since`.

- [ ] **Step 1: Add the field**

Above the existing notes textarea, add a labelled month input bound to local
state seeded from `patient.treatment_since`:

- label: `תחילת הטיפול` (13px, `#9a9ca1`, `marginBottom: 8`)
- `<input type="month" dir="ltr" value={since} onChange={…} />`, styled like the
  overlay's other fields, `fontSize: 16` (never smaller — iOS zooms on focus).

Save through `updatePatientContext(patient.id, text, since)`.

- [ ] **Step 2: Gates**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/overlays/PatientContextOverlay.tsx
git commit -m "Patient context overlay sets the treatment-start month"
```

---

### Task 7: Patient profile — the mock's layout

**Files:**
- Rewrite: `src/screens/Profile.tsx`
- Modify: `src/App.tsx` (props), `src/ui/chromeColor.ts` (profile spec), `src/ui/chromeColor.test.ts` if it asserts the profile colour

**Interfaces:**
- Consumes: `profileSubtitle` (Task 2).
- Produces: `ProfileProps { patient, sessionCount, docCount, onOpenContext, onGoHome, onOpenFlow, onGoWorld }` — the old `onOpenSettings` is renamed `onOpenContext`.

- [ ] **Step 1: Rewrite the screen**

Exact values (mock lines 76-122):
- hero: `position:absolute; inset:0; zIndex:0; opacity:0.35;` background
  `radial-gradient(108% 48% at 50% -4%, rgba(107,113,246,0.95) 0%, rgba(169,185,249,0.85) 30%, rgba(240,228,232,0.75) 55%, rgba(246,217,196,0.5) 70%, rgba(246,217,196,0) 82%), #faf8fa`
- back chevron row: `top: calc(var(--top-inset) + 66px); left:24; right:24; zIndex:5;`
  `dir="ltr"`, `justify-content:space-between` with an empty leading div; the
  button is 44×44 and draws `M9 6l6 6-6 6` stroke `#17171b` width 2 → `onGoHome`.
- header block at `top: calc(var(--top-inset) + 116px)`, column, centred:
  - name: `'Frank Ruhl Libre',serif`, 29px, 500, `#17171b`
  - subtitle: 13px, `#8f8b85`, `marginTop:2`, `letterSpacing:'0.01em'` — `profileSubtitle(patient.treatment_since, sessionCount)`
  - chip: `marginTop:14`, flex, gap 7, `background:'rgba(255,255,255,0.72)'`,
    `borderRadius:999`, `padding:'7px 14px 7px 12px'`,
    `boxShadow:'0 0 0 1px rgba(23,23,27,0.05)'`, `backdropFilter:'blur(6px)'` +
    `WebkitBackdropFilter`; 14px document glyph (`M6 3.5h12a1.5 1.5 0 011.5 1.5v14a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 19V5A1.5 1.5 0 016 3.5z` and `M8.5 9h7M8.5 12.5h7M8.5 16h4`, stroke `#7d7f85` width 1.8); label 12.5px/600 `#3a3a3f`,
    reading `patient.context_notes.trim() ? 'הקשר על המטופל · מוגדר' : 'הוספת הקשר על המטופל'`
    → `onOpenContext`
- rows region: `top: calc(var(--top-inset) + 248px); bottom: calc(var(--chatbar-bottom) + 126px); left:20; right:20; zIndex:4; overflowY:'auto'; padding:'2px 2px 16px'`, `className="scroll-touch"`
- each row: `className="pressable"`, `padding:'15px 22px 17px 10px'`,
  `marginBottom:16`, `borderRadius:'0 16px 16px 0'`; inner flex row
  `justify-content:space-between; gap:12`; text block `minWidth:0` with label
  11.5px `#a9a49d` `letterSpacing:'0.01em'` and title 15.5px/600 `#2b2b30`
  `marginTop:7`; trailing chevron `M15 6l-6 6 6 6` stroke `#c3beb7` width 2, 15px.
- rows, in order: (`הקלטה או נקודות מהפגישה` / `יצירת סיכום פגישה` → `onOpenFlow('summary')`),
  (`אישור, חוות דעת או מכתב` / `יצירת מסמך רשמי` → `onOpenFlow('doc')`),
  (`${sessionCount} סיכומים · ${docCount} מסמכים` / `העולם של ${name}` → `onGoWorld`)
- bottom glow: unchanged from today's `bottomGlowStyle`, `zIndex:3`.

- [ ] **Step 2: Wire App**

`onOpenSettings` → `onOpenContext` (same `state.open('settings')` handler), and
pass `docCount={state.entries.filter((e) => e.type === 'doc').length}`.

- [ ] **Step 3: Re-derive the profile chrome colour**

In `chromeColor.ts`, `profile` becomes the world's spec — `{ fg: { r: 107, g: 113, b: 246, a: 0.35 }, bg: '#faf8fa' }` — with its comment updated to point at
Profile's new full-bleed gradient. Update any test asserting the old value.

- [ ] **Step 4: Gates**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Profile.tsx src/App.tsx src/ui/chromeColor.ts src/ui/chromeColor.test.ts
git commit -m "Patient profile: import the mock's current layout"
```

---

### Task 8: Patient's world — two tabs and the timeline

**Files:**
- Rewrite: `src/screens/World.tsx`
- Modify: `src/App.tsx` if the entry-open payload needs the new fields

**Interfaces:**
- Consumes: `topicTags` (Task 2), `chipLabel`/`fmtDate` (existing).
- Produces: `WorldProps { patient, sessionCount, entries, onGoProfile, onOpenEntry }` (unchanged shape).

- [ ] **Step 1: Rewrite the screen**

Exact values (mock lines 127-180):
- hero: identical to Profile's (same gradient, `opacity:0.35`).
- back chevron row at `top: calc(var(--top-inset) + 66px)` → `onGoProfile`.
- title block at `top: calc(var(--top-inset) + 118px)`: name 29px serif `#17171b`;
  `${sessionCount} פגישות` 13px `#a2a4a9` `marginTop:2`.
- tabs at `top: calc(var(--top-inset) + 188px)`, centred, `gap:6`, two only:
  `פגישות` (`sessions`) and `מסמכים` (`docs`), reusing the existing `pillStyle`.
- list region at `top: calc(var(--top-inset) + 238px); bottom: calc(var(--chatbar-bottom) + 126px); left:20; right:20; overflowY:'auto'; padding:'2px 2px 16px'`, `className="scroll-touch"`.
- row: `position:'relative'`, `padding:'14px 20px 16px 6px'`,
  `borderRight:'1.5px solid #e3ddd6'`, `borderRadius:'0 14px 14px 0'`,
  `className="pressable"`; dot child `position:'absolute'; top:20; right:-4.5;
  width:7.5; height:7.5; borderRadius:'50%'; background:'#cdc3b8'`.
- sessions row content: meta 11.5px `#a9a49d` — `פגישה ${n} · ${fmtDate(e.entry_date)}`,
  where `n` is the row's chronological position among non-draft summaries
  (oldest = 1), matching the numbering `summarize` and the doc flow already use;
  then `topicTags(e)` rendered as spans, 13.5px/600 `#2b2b30`, flex-wrap, `gap:6`,
  `marginTop:8`.
- docs row content: meta `${chipLabel(e.type)} · ${fmtDate(e.entry_date)}`, then
  the title 13.5px/600 `#2b2b30` `marginTop:8`.
- Filtering: `פגישות` lists `type === 'summary'`; `מסמכים` lists `type === 'doc'`.
  `rec` entries appear under neither.
- Empty states, 13.5px `#a9a49d`, centred, `padding:'44px 0'`:
  `אין עדיין פגישות מסוכמות` / `אין עדיין מסמכים בתיק`.

- [ ] **Step 2: Gates**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git add src/screens/World.tsx src/App.tsx
git commit -m "Patient's world: two tabs and the mock's timeline rows"
```

---

### Task 9: Deploy

- [ ] **Step 1: Full gates**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all clean.

- [ ] **Step 2: Deploy**

Run: `npx base44 deploy --yes`
(If the app-visibility step times out, `npx base44 site deploy --yes` publishes the
site on its own; entities/functions from the earlier steps are already pushed.)

- [ ] **Step 3: Verify the served bundle**

Run: `curl -s https://dror-b44-6f3cb1e4.base44.app/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'`
Expected: the hash matches the freshly built `dist/assets/*.js` — the founder
reviews on a phone that caches aggressively, so the served hash is worth stating
in the report.

---

## Self-Review

- **Spec coverage:** white block → Task 1; profile → Tasks 2, 7; world → Tasks 2, 8; `Entry.tags` → Tasks 3, 4, 8; `Patient.treatment_since` → Tasks 3, 6, 7; recording lifecycle → Task 5; chrome colour → Task 7; gates/deploy → Task 9.
- **Placeholders:** none — every step names exact files, values, and commands.
- **Type consistency:** `topicTags`/`formatSince`/`profileSubtitle` are defined in Task 2 and consumed with those exact names in Tasks 7-8; `deleteEntry` and `updatePatientContext` defined in Task 3, consumed in Tasks 5-6; `openFlow`'s third parameter and `Draft.recordingId`/`Draft.tags` defined in Task 5 and used nowhere earlier.
