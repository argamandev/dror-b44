# Privacy Phase 1 — The Data Choke Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every clinical read and write — from both the frontend and the `dror` agent — through Base44 backend functions, so that phase 2 can turn encryption on in one place, and so the agent's draft-only rule becomes structurally enforced instead of instruction-only.

**Architecture:** A new `base44/shared/` module holds the pure logic (which fields are clinical, name matching, draft construction, op parsing) and is imported by every function via `../../shared/…` — the only cross-function import Base44 supports. A single `data` function serves the frontend RPC-style; four narrow functions serve the agent. `src/api/data.ts` keeps its exported signatures so no screen changes. **No encryption in this phase** — the record transforms are identity functions with the seams already cut.

**Tech Stack:** Deno (backend functions, `npm:@base44/sdk`), React 18 + Vite 6 + TypeScript (frontend), vitest 4 (tests), Base44 CLI for deploy.

## Global Constraints

- **Source of truth:** `docs/superpowers/specs/2026-07-27-privacy-infrastructure-design.md`. Field classification is §1 of that spec; do not add or remove clinical fields here.
- **No encryption in phase 1.** `transformOut`/`transformIn` are identity. Phase 2 replaces their bodies only.
- **Every function** starts `const base44 = createClientFromRequest(req)` and reads through the caller's own RLS scope. Never `asServiceRole` — it does not bypass RLS anyway and would misrepresent the caller.
- **`tsconfig.json` has `"include": ["src"]`** — nothing under `base44/` is typechecked by `npx tsc --noEmit`. Tests are the only automated guard on shared logic. Write them first.
- **Deno, not Node.** No `require`, no Node builtins, npm imports use the `npm:` prefix, relative imports include the `.ts` extension.
- **Hebrew UI copy is unchanged in this phase.** The only Hebrew edited is the agent's `instructions` in `base44/agents/dror.jsonc`.
- **Gates before every commit:** `npx vitest run`, `npx tsc --noEmit`, `npm run build`. All three must pass.
- **Deploy:** `npx base44 functions deploy` for functions, `npx base44 agents push` for the agent, `npx base44 site deploy --yes` for the SPA. Plain `npx base44 deploy --yes` has timed out on app-visibility PUTs — do not use it.
- **Coordinate before Task 5.** `src/api/data.ts` is currently modified in another working session. Confirm that work is committed before starting Task 5.

---

### Task 1: The shared field map

**Files:**
- Create: `base44/shared/records.ts`
- Test: `base44/shared/records.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type EntityName = 'Patient' | 'Entry' | 'PatientDoc' | 'Chat'`
  - `CLINICAL_FIELDS: Record<EntityName, FieldSpec[]>` where `FieldSpec = { field: string; shape: 'string' | 'stringArray' | 'nestedText' }`
  - `transformRecord<T>(entity: EntityName, record: T, fn: (s: string) => string): T`
  - `decryptRecord<T>(entity: EntityName, record: T): T`
  - `encryptRecord<T>(entity: EntityName, record: T): T`

- [ ] **Step 1: Write the failing test**

Create `base44/shared/records.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CLINICAL_FIELDS, transformRecord, encryptRecord, decryptRecord } from './records.ts';

describe('CLINICAL_FIELDS', () => {
  // Guards the spec's §1 table. Adding a clinical field to the product without
  // adding it here would silently leave it unencrypted in phase 2.
  it('covers exactly the fields the spec classifies as clinical', () => {
    const flat = Object.entries(CLINICAL_FIELDS).flatMap(([entity, specs]) =>
      specs.map((s) => `${entity}.${s.field}`)
    );
    expect(flat.sort()).toEqual(
      [
        'Chat.messages.text',
        'Chat.title',
        'Entry.body',
        'Entry.tags',
        'Entry.title',
        'Entry.transcript',
        'Patient.context_notes',
        'PatientDoc.extracted_text',
      ].sort()
    );
  });

  it('never lists a field the spec keeps plaintext', () => {
    const flat = Object.entries(CLINICAL_FIELDS).flatMap(([entity, specs]) =>
      specs.map((s) => `${entity}.${s.field}`)
    );
    for (const plaintext of [
      'Patient.first_name',
      'Patient.last_name',
      'Patient.treatment_since',
      'Entry.entry_date',
      'Entry.type',
      'Entry.is_draft',
      'Entry.patient_id',
      'Chat.conversation_id',
    ]) {
      expect(flat).not.toContain(plaintext);
    }
  });
});

describe('transformRecord', () => {
  it('transforms a plain string field', () => {
    const out = transformRecord('Patient', { id: '1', context_notes: 'abc' }, (s) => s.toUpperCase());
    expect(out.context_notes).toBe('ABC');
  });

  it('leaves plaintext fields untouched', () => {
    const out = transformRecord(
      'Patient',
      { id: '1', first_name: 'איתי', context_notes: 'abc' },
      (s) => s.toUpperCase()
    );
    expect(out.first_name).toBe('איתי');
    expect(out.id).toBe('1');
  });

  it('transforms every element of a string array', () => {
    const out = transformRecord('Entry', { id: '1', tags: ['a', 'b'] }, (s) => s.toUpperCase());
    expect(out.tags).toEqual(['A', 'B']);
  });

  it('transforms the text of every message in a nested object array', () => {
    const out = transformRecord(
      'Chat',
      { id: '1', title: 't', messages: [{ role: 'user', text: 'a', ts: 'x' }, { role: 'dror', text: 'b', ts: 'y' }] },
      (s) => s.toUpperCase()
    );
    expect(out.title).toBe('T');
    expect(out.messages.map((m: { text: string }) => m.text)).toEqual(['A', 'B']);
    // Non-text keys inside the nested objects survive untouched.
    expect(out.messages[0].role).toBe('user');
    expect(out.messages[0].ts).toBe('x');
  });

  it('tolerates missing, null and wrong-typed fields rather than throwing', () => {
    expect(() => transformRecord('Entry', { id: '1' }, (s) => s)).not.toThrow();
    expect(() => transformRecord('Entry', { id: '1', tags: null }, (s) => s)).not.toThrow();
    expect(() => transformRecord('Chat', { id: '1', messages: 'oops' }, (s) => s)).not.toThrow();
    expect(() => transformRecord('Entry', { id: '1', body: 42 }, (s) => s)).not.toThrow();
  });

  it('does not mutate the input record', () => {
    const input = { id: '1', context_notes: 'abc' };
    transformRecord('Patient', input, (s) => s.toUpperCase());
    expect(input.context_notes).toBe('abc');
  });
});

describe('encryptRecord / decryptRecord (phase 1: identity)', () => {
  it('round-trips a record unchanged', () => {
    const entry = { id: '1', title: 'סיכום', body: 'גוף', tags: ['חרדה'], entry_date: '2026-07-27' };
    expect(decryptRecord('Entry', encryptRecord('Entry', entry))).toEqual(entry);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run base44/shared/records.test.ts`
Expected: FAIL — `Failed to resolve import "./records.ts"`.

- [ ] **Step 3: Write the implementation**

Create `base44/shared/records.ts`:

```ts
// The one place that knows which fields carry clinical material.
//
// Imported by every backend function via `../../shared/records.ts`.
// base44/shared/ is the only directory outside a function folder that Base44
// uploads on deploy, which is why this can exist once rather than per-function.
//
// PHASE 1: the transforms are identity. Phase 2 replaces the bodies of
// `encryptRecord`/`decryptRecord` with real crypto and nothing else changes —
// that is the entire point of routing reads and writes through here first.
//
// Classification comes from docs/superpowers/specs/
// 2026-07-27-privacy-infrastructure-design.md §1. records.test.ts asserts this
// table matches the spec, so adding a clinical field to the product without
// listing it here fails the suite rather than silently shipping it in the clear.

export type EntityName = 'Patient' | 'Entry' | 'PatientDoc' | 'Chat';

/** How a clinical field is laid out in the record.
 *  - 'string'      → the field is the text itself
 *  - 'stringArray' → an array of strings, every element clinical
 *  - 'nestedText'  → an array of objects, each with a clinical `text` key */
export type FieldShape = 'string' | 'stringArray' | 'nestedText';

export interface FieldSpec {
  field: string;
  shape: FieldShape;
}

export const CLINICAL_FIELDS: Record<EntityName, FieldSpec[]> = {
  Patient: [{ field: 'context_notes', shape: 'string' }],
  Entry: [
    { field: 'title', shape: 'string' },
    { field: 'body', shape: 'string' },
    { field: 'transcript', shape: 'string' },
    { field: 'tags', shape: 'stringArray' },
  ],
  PatientDoc: [{ field: 'extracted_text', shape: 'string' }],
  Chat: [
    { field: 'title', shape: 'string' },
    { field: 'messages.text', shape: 'nestedText' },
  ],
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Applies `fn` to every clinical string in `record`, leaving everything else —
 * ids, dates, names, flags — untouched. Returns a new object; never mutates.
 *
 * Missing, null, or wrong-typed fields are skipped rather than throwing: a
 * record that predates a field, or one the model wrote oddly, must still be
 * readable. A record that cannot be transformed is worse than one that is
 * returned as-is.
 */
export function transformRecord<T extends Record<string, unknown>>(
  entity: EntityName,
  record: T,
  fn: (s: string) => string
): T {
  const out: Record<string, unknown> = { ...record };

  for (const { field, shape } of CLINICAL_FIELDS[entity] ?? []) {
    if (shape === 'string') {
      const v = out[field];
      if (isNonEmptyString(v)) out[field] = fn(v);
      continue;
    }

    if (shape === 'stringArray') {
      const v = out[field];
      if (Array.isArray(v)) out[field] = v.map((el) => (isNonEmptyString(el) ? fn(el) : el));
      continue;
    }

    // 'nestedText' — "messages.text" means: array at `messages`, clinical `text`
    // key on each element.
    const [arrayKey, textKey] = field.split('.');
    const v = out[arrayKey];
    if (!Array.isArray(v)) continue;
    out[arrayKey] = v.map((el) => {
      if (typeof el !== 'object' || el === null) return el;
      const item = el as Record<string, unknown>;
      const text = item[textKey];
      return isNonEmptyString(text) ? { ...item, [textKey]: fn(text) } : item;
    });
  }

  return out as T;
}

// Phase 1: identity. The seams exist so phase 2 is a change to these two
// bodies and nowhere else.
const identity = (s: string): string => s;

export function encryptRecord<T extends Record<string, unknown>>(entity: EntityName, record: T): T {
  return transformRecord(entity, record, identity);
}

export function decryptRecord<T extends Record<string, unknown>>(entity: EntityName, record: T): T {
  return transformRecord(entity, record, identity);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run base44/shared/records.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Confirm a test file inside `base44/` does not break deploy**

This is an unknown worth resolving on the smallest possible change, before four functions depend on it. Base44 uploads every `*.ts` under `base44/shared/`, including `records.test.ts`, which imports `vitest` — a bare specifier Deno cannot resolve.

Run: `npx base44 functions deploy`

- **If deploy succeeds:** keep the co-located test (matches the repo's convention — `src/ui/chromeColor.test.ts` and the other twelve).
- **If deploy fails on resolving `vitest`:** move the file to `tests/shared/records.test.ts`, change its import to `../../base44/shared/records.ts`, re-run `npx vitest run` to confirm it still passes, and add a comment at the top of `records.ts` recording why its test is not co-located. Vitest's default `include` is project-wide, so no config change is needed.

- [ ] **Step 6: Run the full gates**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all pass, **+9 tests**. (150 → 159 at the time of writing. Another session is
also adding tests, so check the delta rather than the absolute number.)

- [ ] **Step 7: Commit**

```bash
git add base44/shared/
git commit -m "Phase 1: the shared clinical-field map

One place that knows which fields carry clinical material, with the
transforms still identity. The test asserts the map matches the spec's
classification, so adding a clinical field to the product without listing
it here fails the suite rather than shipping it in the clear."
```

---

### Task 2: Pure agent logic — name matching and draft construction

**Files:**
- Create: `base44/shared/agentLogic.ts`
- Test: `base44/shared/agentLogic.test.ts` (or `tests/shared/` per Task 1 Step 5)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `matchPatients<T extends NamedPatient>(patients: T[], query: string): T[]`
  - `buildDraftEntry(input: DraftInput, today: string): DraftEntry`
  - `DraftInput = { patient_id: unknown; type: unknown; title: unknown; body: unknown; entry_date?: unknown; tags?: unknown }`
  - `DraftEntry = { patient_id: string; type: 'summary' | 'doc'; title: string; body: string; entry_date: string; is_draft: true; tags: string[]; transcript: ''; duration_seconds: 0 }`

This is where the draft-only guarantee actually lives, so it is tested before anything calls it.

- [ ] **Step 1: Write the failing test**

Create `base44/shared/agentLogic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchPatients, buildDraftEntry } from './agentLogic.ts';

const PATIENTS = [
  { id: 'a', first_name: 'איתי', last_name: 'לוי' },
  { id: 'b', first_name: 'נועה', last_name: 'כהן' },
  { id: 'c', first_name: 'דניאל', last_name: 'לוי' },
  { id: 'd', first_name: 'מיכל', last_name: '' },
];

describe('matchPatients', () => {
  it('matches a full name', () => {
    expect(matchPatients(PATIENTS, 'איתי לוי').map((p) => p.id)).toEqual(['a']);
  });

  it('matches a first name alone', () => {
    expect(matchPatients(PATIENTS, 'איתי').map((p) => p.id)).toEqual(['a']);
  });

  it('matches a last name alone, returning every patient who shares it', () => {
    expect(matchPatients(PATIENTS, 'לוי').map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('matches a patient who has no last name', () => {
    expect(matchPatients(PATIENTS, 'מיכל').map((p) => p.id)).toEqual(['d']);
  });

  it('tolerates extra whitespace', () => {
    expect(matchPatients(PATIENTS, '  איתי   לוי  ').map((p) => p.id)).toEqual(['a']);
  });

  it('returns nothing for an empty or whitespace query rather than everything', () => {
    expect(matchPatients(PATIENTS, '')).toEqual([]);
    expect(matchPatients(PATIENTS, '   ')).toEqual([]);
  });

  it('returns nothing when there is no match', () => {
    expect(matchPatients(PATIENTS, 'רון')).toEqual([]);
  });
});

describe('buildDraftEntry', () => {
  const valid = { patient_id: 'p1', type: 'summary', title: 'כותרת', body: 'גוף' };

  it('forces is_draft true', () => {
    expect(buildDraftEntry(valid, '2026-07-27').is_draft).toBe(true);
  });

  // The whole point of the function: the platform cannot constrain the values
  // an agent writes through an entity tool, so the agent gets no entity tool
  // and this is the only write path it can reach.
  it('forces is_draft true even when the caller explicitly asks for false', () => {
    // is_draft is not part of DraftInput at all — this asserts that an agent
    // sending it anyway cannot influence the stored value.
    const hostile: Record<string, unknown> = { ...valid, is_draft: false };
    expect(buildDraftEntry(hostile, '2026-07-27').is_draft).toBe(true);
  });

  it('defaults entry_date to today when absent', () => {
    expect(buildDraftEntry(valid, '2026-07-27').entry_date).toBe('2026-07-27');
  });

  it('accepts a well-formed explicit entry_date', () => {
    expect(buildDraftEntry({ ...valid, entry_date: '2026-01-05' }, '2026-07-27').entry_date).toBe('2026-01-05');
  });

  it('falls back to today for a malformed entry_date', () => {
    expect(buildDraftEntry({ ...valid, entry_date: 'שלשום' }, '2026-07-27').entry_date).toBe('2026-07-27');
  });

  it('rejects the rec type — a recording is never something the agent authors', () => {
    expect(() => buildDraftEntry({ ...valid, type: 'rec' }, '2026-07-27')).toThrow(/type/);
  });

  it('rejects an unknown type', () => {
    expect(() => buildDraftEntry({ ...valid, type: 'letter' }, '2026-07-27')).toThrow(/type/);
  });

  it.each(['patient_id', 'title', 'body'])('rejects a missing %s', (field) => {
    const input = { ...valid, [field]: '' };
    expect(() => buildDraftEntry(input, '2026-07-27')).toThrow(new RegExp(field));
  });

  it('caps tags at three and drops non-strings and blanks', () => {
    const out = buildDraftEntry({ ...valid, tags: ['a', '', 'b', 3, 'c', 'd'] }, '2026-07-27');
    expect(out.tags).toEqual(['a', 'b', 'c']);
  });

  it('defaults tags to an empty array when absent or not an array', () => {
    expect(buildDraftEntry(valid, '2026-07-27').tags).toEqual([]);
    expect(buildDraftEntry({ ...valid, tags: 'חרדה' }, '2026-07-27').tags).toEqual([]);
  });

  it('sets the fields the agent must not author', () => {
    const out = buildDraftEntry(valid, '2026-07-27');
    expect(out.transcript).toBe('');
    expect(out.duration_seconds).toBe(0);
  });

  it('trims the title and body', () => {
    const out = buildDraftEntry({ ...valid, title: '  כותרת  ', body: '  גוף  ' }, '2026-07-27');
    expect(out.title).toBe('כותרת');
    expect(out.body).toBe('גוף');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run base44/shared/agentLogic.test.ts`
Expected: FAIL — cannot resolve `./agentLogic.ts`.

- [ ] **Step 3: Write the implementation**

Create `base44/shared/agentLogic.ts`:

```ts
// Pure logic shared by the agent-facing functions. Kept out of the entry.ts
// files so it can be unit-tested — nothing under base44/ is typechecked
// (tsconfig include is ["src"]) and Deno functions have no test runner here,
// so anything with a branch belongs in this file rather than in a handler.

export interface NamedPatient {
  first_name?: string;
  last_name?: string;
}

function normalize(s: unknown): string {
  return typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Partial-name lookup, matching the behaviour the agent's Hebrew instructions
 * already promise: «איתי» finds «איתי לוי», and a shared surname returns every
 * patient who has it so the agent can ask which one is meant rather than guess.
 *
 * An empty query returns nothing. Returning the whole list would read to the
 * agent as "one match per patient" and invite it to pick arbitrarily.
 */
export function matchPatients<T extends NamedPatient>(patients: T[], query: string): T[] {
  const q = normalize(query);
  if (!q) return [];

  return patients.filter((p) => {
    const first = normalize(p.first_name);
    const last = normalize(p.last_name);
    const full = [first, last].filter(Boolean).join(' ');
    return full.includes(q) || first === q || last === q;
  });
}

export interface DraftInput {
  patient_id?: unknown;
  type?: unknown;
  title?: unknown;
  body?: unknown;
  entry_date?: unknown;
  tags?: unknown;
}

export interface DraftEntry {
  patient_id: string;
  type: 'summary' | 'doc';
  title: string;
  body: string;
  entry_date: string;
  is_draft: true;
  tags: string[];
  transcript: '';
  duration_seconds: 0;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TAGS = 3;

/**
 * Builds the ONLY Entry shape the agent can write.
 *
 * `is_draft` is hard-set true and is not readable from the input at all.
 * Base44's `tool_configs` can grant or deny an operation but cannot constrain
 * the values written inside it — so the agent is given no entity write tool,
 * and this function is the single write path it can reach. That converts the
 * draft-only rule from an instruction the model is asked to follow into a
 * property of the system.
 *
 * `today` is passed in rather than read from the clock so this stays pure and
 * testable; the caller supplies it.
 */
export function buildDraftEntry(input: DraftInput, today: string): DraftEntry {
  const patient_id = normalize(input.patient_id);
  if (!patient_id) throw new Error('patient_id is required');

  const type = normalize(input.type);
  if (type !== 'summary' && type !== 'doc') {
    throw new Error('type must be "summary" or "doc"');
  }

  const title = normalize(input.title);
  if (!title) throw new Error('title is required');

  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!body) throw new Error('body is required');

  const requested = normalize(input.entry_date);
  const entry_date = ISO_DATE.test(requested) ? requested : today;

  const tags = Array.isArray(input.tags)
    ? input.tags
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim())
        .slice(0, MAX_TAGS)
    : [];

  return {
    patient_id,
    type,
    title,
    body,
    entry_date,
    is_draft: true,
    tags,
    transcript: '',
    duration_seconds: 0,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run base44/shared/agentLogic.test.ts`
Expected: PASS, 21 tests (7 for `matchPatients`, 14 for `buildDraftEntry` — the
`it.each` over three required fields counts as three).

- [ ] **Step 5: Run the full gates**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all pass, **+21 tests** since Task 1.

- [ ] **Step 6: Commit**

```bash
git add base44/shared/
git commit -m "Phase 1: pure agent logic — name matching and draft construction

buildDraftEntry hard-sets is_draft and never reads it from the input.
Tested before anything calls it, because this function is where the
draft-only guarantee stops being an instruction and becomes a property
of the system."
```

---

### Task 3: The four agent-facing functions

**Files:**
- Create: `base44/functions/find_patient/entry.ts`
- Create: `base44/functions/get_patient_context/entry.ts`
- Create: `base44/functions/search_records/entry.ts`
- Create: `base44/functions/create_draft/entry.ts`

**Interfaces:**
- Consumes: `matchPatients`, `buildDraftEntry` (Task 2); `decryptRecord`, `encryptRecord` (Task 1).
- Produces: four deployed Base44 functions, referenced by name in Task 4's `tool_configs`.

All four follow the auth/RLS pattern already established in `base44/functions/summarize/entry.ts`.

- [ ] **Step 1: Write `find_patient`**

Create `base44/functions/find_patient/entry.ts`:

```ts
// Agent tool: find a patient by full or partial name, within the caller's own
// RLS scope. Replaces the agent's direct Patient entity tool.
//
// Returns no clinical fields at all — just enough for the agent to pick a
// patient and call get_patient_context with an id.
import { createClientFromRequest } from "npm:@base44/sdk";
import { matchPatients } from "../../shared/agentLogic.ts";

interface Patient {
  id: string;
  first_name: string;
  last_name?: string;
  treatment_since?: string;
}

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const query = typeof body?.query === "string" ? body.query : "";
    if (!query.trim()) {
      return Response.json({ error: "query is required" }, { status: 400 });
    }

    const patients = (await base44.entities.Patient.list()) as Patient[];
    const matches = matchPatients(patients, query).map((p) => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(" "),
      treatment_since: p.treatment_since ?? "",
    }));

    return Response.json({ matches });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
```

- [ ] **Step 2: Write `get_patient_context`**

Create `base44/functions/get_patient_context/entry.ts`:

```ts
// Agent tool: everything the agent needs about one patient, decrypted, in a
// single call. Replaces what it previously assembled across the Patient,
// Entry, PatientDoc and TherapistPref entity tools.
import { createClientFromRequest } from "npm:@base44/sdk";
import { decryptRecord } from "../../shared/records.ts";

const DEFAULT_ENTRIES = 10;
const MAX_ENTRIES = 50;
const EXCERPT_MAX = 1200;
const DOC_MAX = 8;

interface Patient {
  id: string;
  first_name: string;
  last_name?: string;
  context_notes?: string;
  treatment_since?: string;
}

interface Entry {
  id: string;
  type: string;
  title: string;
  entry_date: string;
  body?: string;
  transcript?: string;
  is_draft?: boolean;
  tags?: string[];
}

interface PatientDoc {
  id: string;
  title?: string;
  doc_date?: string;
  extracted_text?: string;
}

interface TherapistPref {
  display_name?: string;
  guidelines?: string;
  summary_style?: string;
}

function excerpt(text: string | undefined, max: number): string {
  const t = (text ?? "").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const patientId = typeof body?.patient_id === "string" ? body.patient_id : "";
    if (!patientId) {
      return Response.json({ error: "patient_id is required" }, { status: 400 });
    }
    const requested = Number(body?.limit);
    const limit = Number.isFinite(requested) && requested > 0
      ? Math.min(Math.floor(requested), MAX_ENTRIES)
      : DEFAULT_ENTRIES;

    // filter() rather than get() so a patient outside this therapist's scope
    // resolves to an empty list instead of a distinguishable error — the same
    // choice summarize/entry.ts makes, and for the same reason.
    const patients = (await base44.entities.Patient.filter({ id: patientId })) as Patient[];
    const raw = patients[0];
    if (!raw) return Response.json({ error: "Patient not found" }, { status: 404 });
    const patient = decryptRecord("Patient", raw as unknown as Record<string, unknown>) as unknown as Patient;

    const rawEntries = (await base44.entities.Entry.filter(
      { patient_id: patientId },
      "-entry_date",
      limit
    )) as Entry[];
    const entries = rawEntries.map(
      (e) => decryptRecord("Entry", e as unknown as Record<string, unknown>) as unknown as Entry
    );

    const rawDocs = (await base44.entities.PatientDoc.filter(
      { patient_id: patientId },
      "-doc_date",
      DOC_MAX
    )) as PatientDoc[];
    const docs = rawDocs.map(
      (d) => decryptRecord("PatientDoc", d as unknown as Record<string, unknown>) as unknown as PatientDoc
    );

    // A missing preferences record is "none set", never an error.
    let prefs: TherapistPref = {};
    try {
      const list = (await base44.entities.TherapistPref.list()) as TherapistPref[];
      prefs = list[0] ?? {};
    } catch {
      prefs = {};
    }

    const sessionCount = (
      await base44.entities.Entry.filter(
        { patient_id: patientId, type: "summary", is_draft: false },
        "entry_date",
        5000
      )
    ).length;

    return Response.json({
      patient: {
        id: patient.id,
        name: [patient.first_name, patient.last_name].filter(Boolean).join(" "),
        context_notes: patient.context_notes ?? "",
        treatment_since: patient.treatment_since ?? "",
        session_count: sessionCount,
      },
      entries: entries.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        entry_date: e.entry_date,
        is_draft: e.is_draft ?? false,
        tags: e.tags ?? [],
        text: excerpt(e.body || e.transcript, EXCERPT_MAX),
      })),
      documents: docs.map((d) => ({
        id: d.id,
        title: d.title ?? "",
        doc_date: d.doc_date ?? "",
        text: excerpt(d.extracted_text, EXCERPT_MAX),
      })),
      therapist: {
        display_name: prefs.display_name ?? "",
        guidelines: prefs.guidelines ?? "",
        summary_style: prefs.summary_style ?? "",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
```

- [ ] **Step 3: Write `search_records`**

Create `base44/functions/search_records/entry.ts`:

```ts
// Agent tool: substring search across the therapist's own records.
//
// There is no encrypted search, so this fetches within the caller's RLS scope,
// decrypts, then matches in memory (spec §4, "Honest cost"). Bounded by
// patient_id when given and hard-capped otherwise.
import { createClientFromRequest } from "npm:@base44/sdk";
import { decryptRecord } from "../../shared/records.ts";

const SCAN_CAP = 500;
const RESULT_CAP = 20;
const EXCERPT_MAX = 600;

interface Entry {
  id: string;
  patient_id: string;
  type: string;
  title: string;
  entry_date: string;
  body?: string;
  transcript?: string;
  tags?: string[];
}

function excerpt(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) return Response.json({ error: "query is required" }, { status: 400 });
    const patientId = typeof body?.patient_id === "string" ? body.patient_id : "";

    const filter = patientId ? { patient_id: patientId } : {};
    const rawEntries = (await base44.entities.Entry.filter(
      filter,
      "-entry_date",
      SCAN_CAP
    )) as Entry[];

    const results: unknown[] = [];
    for (const rawEntry of rawEntries) {
      const e = decryptRecord("Entry", rawEntry as unknown as Record<string, unknown>) as unknown as Entry;
      const haystack = [e.title, e.body ?? "", e.transcript ?? "", ...(e.tags ?? [])].join("\n");
      if (!haystack.includes(query)) continue;
      results.push({
        id: e.id,
        patient_id: e.patient_id,
        type: e.type,
        title: e.title,
        entry_date: e.entry_date,
        text: excerpt((e.body || e.transcript) ?? "", EXCERPT_MAX),
      });
      if (results.length >= RESULT_CAP) break;
    }

    // Reported rather than silently truncated, so the agent can say "there may
    // be more" instead of implying it searched everything.
    return Response.json({
      results,
      truncated: rawEntries.length >= SCAN_CAP,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
```

- [ ] **Step 4: Write `create_draft`**

Create `base44/functions/create_draft/entry.ts`:

```ts
// Agent tool: the ONLY write path the dror agent can reach.
//
// The agent holds no entity write tool at all, so every record it authors
// comes through here, and buildDraftEntry hard-sets is_draft: true. That is
// what makes "Dror only ever produces drafts" a property of the system rather
// than an instruction the model is asked to follow — Base44's tool_configs can
// grant or deny an operation but cannot constrain the values written inside it.
import { createClientFromRequest } from "npm:@base44/sdk";
import { buildDraftEntry } from "../../shared/agentLogic.ts";
import { encryptRecord } from "../../shared/records.ts";

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    // The patient must be inside the caller's own RLS scope. Without this an
    // agent given a fabricated id would create an orphan entry in this
    // therapist's world.
    const patientId = typeof body?.patient_id === "string" ? body.patient_id : "";
    const patients = await base44.entities.Patient.filter({ id: patientId });
    if (!patients[0]) {
      return Response.json({ error: "Patient not found" }, { status: 404 });
    }

    let draft;
    try {
      draft = buildDraftEntry(body, new Date().toISOString().slice(0, 10));
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "invalid draft" },
        { status: 400 }
      );
    }

    const created = await base44.entities.Entry.create(
      encryptRecord("Entry", draft as unknown as Record<string, unknown>)
    );

    return Response.json({
      id: (created as { id: string }).id,
      title: draft.title,
      entry_date: draft.entry_date,
      is_draft: true,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
```

- [ ] **Step 5: Deploy the functions**

Run: `npx base44 functions deploy`
Expected: all four new functions deploy without error.

- [ ] **Step 6: Run the gates and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add base44/functions/
git commit -m "Phase 1: four agent-facing functions

find_patient, get_patient_context, search_records, create_draft. Each
reads through createClientFromRequest, so RLS is unchanged. create_draft
verifies the patient is in scope before writing, and is the only write
path the agent will have once its entity tools are removed."
```

---

### Task 4: Move the agent onto the function tools

**Files:**
- Modify: `base44/agents/dror.jsonc` — `tool_configs`, and the two `instructions` sections describing data access and draft creation.

**Interfaces:**
- Consumes: the four functions deployed in Task 3.
- Produces: an agent with no entity tools.

- [ ] **Step 1: Replace `tool_configs`**

Replace the existing five-entry entity array with:

```jsonc
  "tool_configs": [
    { "function_name": "find_patient", "description": "מאתר מטופל/ת לפי שם מלא או חלקי. מחזיר רשימת התאמות עם id ושם. יש להשתמש בו לפני כל פעולה אחרת הנוגעת למטופל/ת ספציפי/ת." },
    { "function_name": "get_patient_context", "description": "מחזיר את כל המידע על מטופל/ת אחד/ת: ההקשר הקבוע, הרשומות האחרונות, המסמכים שהועלו, מספר הפגישות והעדפות המטפל/ת. מקבל patient_id." },
    { "function_name": "search_records", "description": "חיפוש טקסט חופשי ברשומות של המטפל/ת. מקבל query, ואופציונלית patient_id לצמצום החיפוש למטופל/ת אחד/ת." },
    { "function_name": "create_draft", "description": "יוצר טיוטה חדשה — סיכום פגישה או מסמך רשמי. מקבל patient_id, type (summary או doc), title ו-body. הרשומה תמיד נשמרת כטיוטה." }
  ],
```

- [ ] **Step 2: Update the data-access section of `instructions`**

In the `גישה לנתונים ופרטיות` section, replace the sentence listing the entities with:

```
- יש לך גישה אך ורק לנתונים של המטפל/ת המחובר/ת כעת, דרך הכלים שברשותך בלבד: find_patient לאיתור מטופל/ת לפי שם, get_patient_context לקבלת כל המידע על מטופל/ת אחד/ת, ו-search_records לחיפוש חופשי ברשומות. אינך רואה ואינך יכול לגשת לנתונים של אף מטפל/ת אחר/ת.
```

In the `שימוש בכלים` section, replace the first two bullets with:

```
- כשנשאלת שאלה על מטופל/ת — קרא קודם ל-find_patient עם השם, ואז ל-get_patient_context עם ה-id שקיבלת, ורק אז ענה על בסיס המידע שחזר בלבד.
- find_patient בודק גם התאמות חלקיות — שם פרטי בלבד או שם משפחה בלבד. אמור שמטופל/ת לא נמצא/ה רק אחרי ש-find_patient החזיר רשימה ריקה. אם חזרו כמה התאמות — בקש הבהרה במקום לנחש.
- לשאלות רוחביות על הקליניקה (למשל «מתי דיברנו על חרדה») השתמש ב-search_records. אם השדה truncated חזר true — ציין שייתכן שיש רשומות נוספות.
```

- [ ] **Step 3: Update the draft-creation section of `instructions`**

Replace the bullets under `בקשות פעולה — הכנת טיוטות` that describe `create` and `is_draft` with:

```
- צור את הטיוטה בעזרת הכלי create_draft בלבד. אין לך שום דרך אחרת לכתוב רשומה.
- patient_id = ה-id שקיבלת מ-find_patient (אם לא ברור מיהו/מיהי המטופל/ת — שאל).
- type = "summary" לסיכום פגישה, "doc" למסמך רשמי.
```

Keep the existing `title` and `body` bullets, the two structural templates, and the closing "הודע למטפל/ת שהטיוטה מוכנה" bullet unchanged. In `גבולות קשיחים`, keep the draft-only line — it is now redundant with the platform but it is also what makes the agent *say* the draft is waiting.

- [ ] **Step 4: Push the agent**

Run: `npx base44 agents push`
Expected: success.

- [ ] **Step 5: Manual regression against the live agent**

There is no automated test for agent behaviour. Exercise each path in the live app and confirm:

1. "מה קרה עם איתי?" → answers from the record, does not report the patient as missing.
2. "לוי" (a shared surname) → asks which patient rather than picking one.
3. "רון" (no such patient) → says so plainly, invents nothing.
4. "תכין סיכום פגישה לאיתי" → a draft appears in that patient's world, **marked as a draft**.
5. Confirm in the app that the created entry shows as a draft, not as finished work.

- [ ] **Step 6: Commit**

```bash
git add base44/agents/dror.jsonc
git commit -m "Phase 1: move the agent onto function tools

Five entity tools become four function tools. Because the agent now holds
no entity write tool at all, create_draft is the only write path it can
reach and is_draft: true is enforced server-side — closing the residual
risk build-log.md records as accepted."
```

---

### Task 5: The `data` function and the frontend rewire

**Coordinate first:** confirm the other working session's changes to `src/api/data.ts` are committed before starting.

**Files:**
- Create: `base44/shared/dataOps.ts`
- Test: `base44/shared/dataOps.test.ts`
- Create: `base44/functions/data/entry.ts`
- Modify: `src/api/data.ts` (entity functions only — leave the `auth` wrapper on the SDK)
- Test: `src/api/data.test.ts`

**Interfaces:**
- Consumes: `encryptRecord`, `decryptRecord` (Task 1).
- Produces: `src/api/data.ts` with **unchanged** exported signatures.

- [ ] **Step 1: Write the failing test for op parsing**

Create `base44/shared/dataOps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DATA_OPS, isDataOp } from './dataOps.ts';

describe('isDataOp', () => {
  it('accepts every op the frontend uses', () => {
    for (const op of [
      'list_patients', 'create_patient', 'save_patient_context',
      'list_entries', 'save_entry', 'update_entry', 'delete_entry',
      'list_chats', 'create_chat', 'update_chat', 'create_patient_doc',
    ]) {
      expect(isDataOp(op)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isDataOp('drop_everything')).toBe(false);
    expect(isDataOp('')).toBe(false);
    expect(isDataOp(undefined)).toBe(false);
    expect(isDataOp(42)).toBe(false);
  });

  it('DATA_OPS and isDataOp cannot drift apart', () => {
    for (const op of DATA_OPS) expect(isDataOp(op)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run base44/shared/dataOps.test.ts`
Expected: FAIL — cannot resolve `./dataOps.ts`.

- [ ] **Step 3: Implement `dataOps.ts`**

```ts
// The op names the `data` function accepts, in one place so the handler's
// dispatch and the frontend's callers cannot drift apart.

export const DATA_OPS = [
  'list_patients',
  'create_patient',
  'save_patient_context',
  'list_entries',
  'save_entry',
  'update_entry',
  'delete_entry',
  'list_chats',
  'create_chat',
  'update_chat',
  'create_patient_doc',
] as const;

export type DataOp = (typeof DATA_OPS)[number];

export function isDataOp(v: unknown): v is DataOp {
  return typeof v === 'string' && (DATA_OPS as readonly string[]).includes(v);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run base44/shared/dataOps.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Implement the `data` function**

Create `base44/functions/data/entry.ts`:

```ts
// The frontend's single data path. RPC-style on { op, args } so that adding an
// operation is one case here rather than a new deployed function, and so that
// src/api/data.ts keeps its existing exported signatures — the refactor lands
// in one frontend file instead of every screen.
//
// Every branch runs through createClientFromRequest, so RLS is exactly what it
// was when these calls were made directly from the browser.
import { createClientFromRequest } from "npm:@base44/sdk";
import { isDataOp } from "../../shared/dataOps.ts";
import { decryptRecord, encryptRecord } from "../../shared/records.ts";

type Rec = Record<string, unknown>;

const ENTRY_LIMIT = 5000;
const CHAT_LIMIT = 5000;

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await req.json();
    const op = payload?.op;
    const args = (payload?.args ?? {}) as Rec;
    if (!isDataOp(op)) {
      return Response.json({ error: "unknown op" }, { status: 400 });
    }

    const dec = (entity: "Patient" | "Entry" | "Chat" | "PatientDoc", r: Rec) =>
      decryptRecord(entity, r);
    const enc = (entity: "Patient" | "Entry" | "Chat" | "PatientDoc", r: Rec) =>
      encryptRecord(entity, r);

    switch (op) {
      case "list_patients": {
        const rows = (await base44.entities.Patient.list()) as Rec[];
        return Response.json({ result: rows.map((r) => dec("Patient", r)) });
      }

      case "create_patient": {
        const created = await base44.entities.Patient.create(
          enc("Patient", {
            first_name: String(args.first_name ?? ""),
            last_name: String(args.last_name ?? ""),
            context_notes: "",
            treatment_since: "",
          })
        );
        return Response.json({ result: dec("Patient", created as Rec) });
      }

      case "save_patient_context": {
        await base44.entities.Patient.update(
          String(args.id ?? ""),
          enc("Patient", {
            context_notes: String(args.context_notes ?? ""),
            treatment_since: String(args.treatment_since ?? ""),
          })
        );
        return Response.json({ result: null });
      }

      case "list_entries": {
        const rows = (await base44.entities.Entry.filter(
          { patient_id: String(args.patient_id ?? "") },
          "-entry_date",
          ENTRY_LIMIT
        )) as Rec[];
        return Response.json({ result: rows.map((r) => dec("Entry", r)) });
      }

      case "save_entry": {
        const created = await base44.entities.Entry.create(enc("Entry", args.entry as Rec));
        return Response.json({ result: dec("Entry", created as Rec) });
      }

      case "update_entry": {
        await base44.entities.Entry.update(
          String(args.id ?? ""),
          enc("Entry", args.patch as Rec)
        );
        return Response.json({ result: null });
      }

      case "delete_entry": {
        await base44.entities.Entry.delete(String(args.id ?? ""));
        return Response.json({ result: null });
      }

      case "list_chats": {
        const rows = (await base44.entities.Chat.list("-updated_date", CHAT_LIMIT)) as Rec[];
        return Response.json({ result: rows.map((r) => dec("Chat", r)) });
      }

      case "create_chat": {
        const created = await base44.entities.Chat.create(enc("Chat", args.chat as Rec));
        return Response.json({ result: dec("Chat", created as Rec) });
      }

      case "update_chat": {
        await base44.entities.Chat.update(String(args.id ?? ""), enc("Chat", args.patch as Rec));
        return Response.json({ result: null });
      }

      case "create_patient_doc": {
        const created = await base44.entities.PatientDoc.create(
          enc("PatientDoc", args.doc as Rec)
        );
        return Response.json({ result: dec("PatientDoc", created as Rec) });
      }
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
```

- [ ] **Step 6: Write the failing frontend test**

Create `src/api/data.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('./base44Client', () => ({
  base44: { functions: { invoke }, entities: {}, auth: {} },
}));

import { listPatients, listEntries, createEntry, updateEntry, deleteEntry, updatePatientContext } from './data';

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { result: [] } });
});

describe('data.ts routes through the data function', () => {
  it('listPatients sends the list_patients op', async () => {
    await listPatients();
    expect(invoke).toHaveBeenCalledWith('data', { op: 'list_patients', args: {} });
  });

  it('listEntries passes the patient id', async () => {
    await listEntries('p1');
    expect(invoke).toHaveBeenCalledWith('data', {
      op: 'list_entries',
      args: { patient_id: 'p1' },
    });
  });

  it('createEntry sends the whole entry under save_entry', async () => {
    invoke.mockResolvedValue({ data: { result: { id: 'e1' } } });
    const entry = {
      patient_id: 'p1', type: 'summary' as const, title: 't', entry_date: '2026-07-27',
      body: 'b', is_draft: true, duration_seconds: 0, transcript: '', tags: [],
    };
    await createEntry(entry);
    expect(invoke).toHaveBeenCalledWith('data', { op: 'save_entry', args: { entry } });
  });

  it('updateEntry sends id and patch', async () => {
    await updateEntry('e1', { is_draft: false });
    expect(invoke).toHaveBeenCalledWith('data', {
      op: 'update_entry',
      args: { id: 'e1', patch: { is_draft: false } },
    });
  });

  it('deleteEntry sends the id', async () => {
    await deleteEntry('e1');
    expect(invoke).toHaveBeenCalledWith('data', { op: 'delete_entry', args: { id: 'e1' } });
  });

  it('updatePatientContext sends both fields the overlay owns', async () => {
    await updatePatientContext('p1', 'notes', '2024-03');
    expect(invoke).toHaveBeenCalledWith('data', {
      op: 'save_patient_context',
      args: { id: 'p1', context_notes: 'notes', treatment_since: '2024-03' },
    });
  });

  it('unwraps the {data:{result}} envelope', async () => {
    invoke.mockResolvedValue({ data: { result: [{ id: 'p1' }] } });
    await expect(listPatients()).resolves.toEqual([{ id: 'p1' }]);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/api/data.test.ts`
Expected: FAIL — the functions still call `base44.entities.*`, so `invoke` is never called.

- [ ] **Step 8: Rewire `src/api/data.ts`**

Leave the interfaces and the whole `auth` object exactly as they are — auth stays on the SDK directly. Replace only the entity functions below it. Add this helper above them:

```ts
// Every clinical read and write goes through the `data` function rather than
// base44.entities directly, so that encryption has exactly one place to live
// (see docs/superpowers/specs/2026-07-27-privacy-infrastructure-design.md).
// The exported signatures below are unchanged, which is why no screen had to
// change when this moved.
async function call<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await base44.functions.invoke('data', { op, args });
  return (res?.data as { result: T }).result;
}
```

Then:

```ts
export const listPatients = (): Promise<Patient[]> => call<Patient[]>('list_patients');

export const createPatient = (first: string, last: string): Promise<Patient> =>
  call<Patient>('create_patient', { first_name: first, last_name: last });

export const updatePatientContext = (
  id: string,
  notes: string,
  treatmentSince: string
): Promise<void> =>
  call<null>('save_patient_context', {
    id,
    context_notes: notes,
    treatment_since: treatmentSince,
  }).then(() => undefined);

// Sort and limit live in the data function now (-entry_date, 5000) for the same
// reason they were explicit here: a patient's world, session count and doc-flow
// numbering must never silently truncate past the SDK's default 50.
export const listEntries = (patientId: string): Promise<Entry[]> =>
  call<Entry[]>('list_entries', { patient_id: patientId });

export const createEntry = (e: Omit<Entry, 'id'>): Promise<Entry> =>
  call<Entry>('save_entry', { entry: e });

export const updateEntry = (id: string, patch: Partial<Entry>): Promise<void> =>
  call<null>('update_entry', { id, patch }).then(() => undefined);

// Used for exactly one thing: destroying a session recording once the summary
// written from it has been saved (useAppState's saveDraft).
export const deleteEntry = (id: string): Promise<void> =>
  call<null>('delete_entry', { id }).then(() => undefined);

export const listChats = (): Promise<Chat[]> => call<Chat[]>('list_chats');

export const createChat = (c: {
  title: string;
  patient_id: string;
  conversation_id: string;
  messages: ChatMsg[];
}): Promise<Chat> => call<Chat>('create_chat', { chat: c });

export const updateChat = (
  id: string,
  patch: { messages?: ChatMsg[]; conversation_id?: string }
): Promise<void> => call<null>('update_chat', { id, patch }).then(() => undefined);
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run src/api/data.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 10: Route the document upload through the function too**

In `src/api/docs.ts`, replace the `createPatientDoc` body:

```ts
export const createPatientDoc = async (doc: {
  patient_id: string;
  title: string;
  file_uri: string;
  extracted_text: string;
  doc_date: string;
}): Promise<PatientDoc> => {
  const res = await base44.functions.invoke('data', { op: 'create_patient_doc', args: { doc } });
  return (res?.data as { result: PatientDoc }).result;
};
```

Leave the private-storage upload and extraction flow above it untouched — that path is already correct.

- [ ] **Step 11: Deploy and exercise the app end to end**

Run: `npx base44 functions deploy && npm run build && npx base44 site deploy --yes`

Then in the live app confirm, against real seeded data:
1. The home screen lists patients.
2. A patient's world lists their entries in date order.
3. The patient-context overlay saves and reloads.
4. A summary drafted through the flow saves, and the recording is deleted after.
5. The menu drawer lists chat history, and an existing chat reopens with its messages.
6. Uploading a document from the chat bar's `+` still attaches and reads.

- [ ] **Step 12: Run the gates and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all pass, **+10 tests** since Task 2 (3 for `dataOps`, 7 for `data.ts`).

```bash
git add base44/shared/dataOps.ts base44/shared/dataOps.test.ts base44/functions/data/ src/api/data.ts src/api/data.test.ts src/api/docs.ts
git commit -m "Phase 1: route the frontend through the data function

RPC-style {op,args} so src/api/data.ts keeps its exported signatures and
no screen changes. Every branch runs under createClientFromRequest, so
RLS is exactly what it was when the browser called entities directly.
Encryption now has one place to live."
```

---

### Task 6: Prove the choke point holds

**Files:**
- Create: `scripts/verify-choke-point.ts`
- Modify: `README.md` — the Privacy posture section
- Modify: `docs/context/build-log.md` — the `is_draft` residual-risk entry

**Interfaces:**
- Consumes: the deployed functions from Tasks 3 and 5.
- Produces: evidence, in the same style as `scripts/verify-rls.ts`.

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-choke-point.ts`:

```ts
// Phase 1 verification — run with:
//   cat scripts/verify-choke-point.ts | npx base44 exec
//
// Proves the two claims phase 1 makes, from the currently-authenticated
// account. Written in the same spirit as scripts/verify-rls.ts: checks that
// would pass with the change reverted are not counted as evidence.

const results: string[] = [];
function check(name: string, pass: boolean, detail = '') {
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

// 1. The agent's tool surface contains no entity write path.
//    This is the claim that matters: is_draft cannot be set to false by the
//    agent because it has no tool that writes an Entry directly.
const agent = await base44.agents.get('dror');
const toolConfigs = agent?.tool_configs ?? [];
const entityTools = toolConfigs.filter((t: Record<string, unknown>) => 'entity_name' in t);
check('agent holds zero entity tools', entityTools.length === 0,
  `found ${entityTools.length}`);
check('agent holds the four function tools',
  ['find_patient', 'get_patient_context', 'search_records', 'create_draft']
    .every((n) => toolConfigs.some((t: Record<string, unknown>) => t.function_name === n)));

// 2. create_draft refuses to author a non-draft even when explicitly asked.
const patients = await base44.entities.Patient.list();
const patient = patients[0];
if (!patient) {
  check('create_draft forces is_draft', false, 'no patient to test against — seed first');
} else {
  const res = await base44.functions.invoke('create_draft', {
    patient_id: patient.id,
    type: 'summary',
    title: 'בדיקת אכיפה — למחיקה',
    body: 'רשומה שנוצרה על ידי סקריפט האימות.',
    is_draft: false, // explicitly asking for a non-draft
  });
  const created = res?.data;
  check('create_draft forces is_draft true despite is_draft:false', created?.is_draft === true);

  const stored = (await base44.entities.Entry.filter({ id: created?.id }))[0];
  check('the stored record is a draft', stored?.is_draft === true);
  check('create_draft never writes a transcript', (stored?.transcript ?? '') === '');

  if (stored?.id) await base44.entities.Entry.delete(stored.id);
  check('verification record cleaned up', true);
}

// 3. create_draft rejects a patient outside the caller's scope.
const bogus = await base44.functions
  .invoke('create_draft', {
    patient_id: 'ffffffffffffffffffffffff',
    type: 'summary',
    title: 'x',
    body: 'y',
  })
  .then(() => 'created')
  .catch(() => 'rejected');
check('create_draft rejects an out-of-scope patient_id', bogus === 'rejected');

console.log(results.join('\n'));
```

- [ ] **Step 2: Run it**

Run: `cat scripts/verify-choke-point.ts | npx base44 exec`
Expected: every line PASS. If the `create_draft` call rejects rather than returning, read the error — a 404 means the seeded patient lookup failed, not that enforcement is broken.

- [ ] **Step 3: Update the README's privacy posture**

Under **Instruction-enforced, not platform-enforced**, replace the paragraph about the agent's draft-only rule with:

```markdown
**Platform-enforced (was instruction-enforced).** The agent's draft-only rule. Base44's
`tool_configs` can grant or deny an operation but cannot constrain the values written
inside it — so as long as the agent held an `Entry` create tool, `is_draft = true` held
only because its instructions said so. The agent now holds **no entity tools at all**: its
four tools are backend functions, and the only one that writes is `create_draft`, which
hard-sets `is_draft: true` server-side and verifies the patient is inside the caller's RLS
scope before writing. Verified by `scripts/verify-choke-point.ts`, which asks it for a
non-draft explicitly and confirms it gets a draft.
```

- [ ] **Step 4: Update the build log**

Append to the `is_draft` residual-risk entry:

```markdown
  **Closed 2026-07-27** (privacy phase 1): the agent's entity tools were replaced by four
  function tools. With no entity write path available to it, `create_draft` is the only
  way the agent can author a record, and it sets `is_draft: true` server-side rather than
  reading it from the model's arguments. Evidence: `scripts/verify-choke-point.ts`.
```

- [ ] **Step 5: Run the gates and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add scripts/verify-choke-point.ts README.md docs/context/build-log.md
git commit -m "Phase 1: verify the choke point, and record what it closed

verify-choke-point.ts asks create_draft for a non-draft explicitly and
confirms it gets a draft — a check that would fail with the change
reverted, which is the standard verify-rls.ts already sets. The build
log's accepted is_draft risk is marked closed."
```

---

## Done when

- The `dror` agent has zero entity tools and four function tools, and still finds patients by partial name, asks which one when a surname is shared, and says so plainly when there is no match.
- `create_draft` returns a draft when explicitly asked for a non-draft, proven by a script rather than asserted.
- Every clinical read and write from the frontend goes through `base44/functions/data/entry.ts`, with `src/api/data.ts`'s exported signatures unchanged and no screen modified.
- `base44/shared/records.ts` is the only file that knows which fields are clinical, and its test fails if that list drifts from the spec.
- Gates green: `npx vitest run` (**+40 tests** over the phase-1 starting point of 150), `npx tsc --noEmit`, `npm run build`.

**Phase 2 then changes two function bodies** — `encryptRecord` and `decryptRecord` — plus the key, the migration scripts, and decryption inside `summarize`/`document`. Nothing above the shared module moves again.
