import { base44 } from './base44Client';

// Task W6 — "what Dror should know about you": the therapist's own display
// name/title plus free-text guidelines and a summary-style choice, read by
// the `dror` agent (base44/agents/dror.jsonc) and injected into the
// summarize/document functions' prompts (base44/functions/{summarize,
// document}/entry.ts) so the product's core promise — "drafts summaries per
// the therapist's own guidelines" — is actually honored, not just stored.
//
// One TherapistPref record per therapist. RLS (base44/entities/
// therapist-pref.jsonc, same rls block as patient-doc.jsonc) scopes list()
// to just their own records, so "mine" is simply the first (and only)
// record list() ever returns for that caller.

/** `summary_style` allowed values — anything else normalizes to ''. */
export const SUMMARY_STYLES = ['תמציתי', 'מאוזן', 'מפורט'] as const;
export type SummaryStyle = (typeof SUMMARY_STYLES)[number];

/** Hard cap on stored guidelines length — an unbounded paste must not blow
 * the prompt budget of every future summarize/document call. */
export const GUIDELINES_MAX = 2000;

export interface TherapistPrefs {
  display_name: string;
  professional_title: string;
  guidelines: string;
  summary_style: SummaryStyle | '';
}

type RawPrefs = Partial<Record<keyof TherapistPrefs, unknown>>;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Pure normalization — the only branchy logic in this file. Trims every
 * field, caps `guidelines` at GUIDELINES_MAX chars, and coerces
 * `summary_style` to one of the three allowed values, falling back to '' for
 * anything else (including missing/garbage input). Always returns a
 * fully-populated object, so a caller never has to guard against undefined
 * fields.
 */
export function normalizePrefs(raw: RawPrefs | null | undefined): TherapistPrefs {
  const style = str(raw?.summary_style);
  return {
    display_name: str(raw?.display_name),
    professional_title: str(raw?.professional_title),
    guidelines: str(raw?.guidelines).slice(0, GUIDELINES_MAX),
    summary_style: (SUMMARY_STYLES as readonly string[]).includes(style) ? (style as SummaryStyle) : '',
  };
}

/** The therapist's saved preferences, or null if none have been saved yet.
 * Errors (network, auth) are not swallowed — they reject to the caller. */
export async function loadMyPrefs(): Promise<TherapistPrefs | null> {
  const records = await base44.entities.TherapistPref.list();
  const first = records[0];
  return first ? normalizePrefs(first) : null;
}

/** Updates the therapist's existing record if one exists, else creates it —
 * never a second record for the same therapist (RLS already scopes list()
 * to just theirs, so the first result IS theirs). Errors are not swallowed. */
export async function saveMyPrefs(prefs: TherapistPrefs): Promise<TherapistPrefs> {
  const normalized = normalizePrefs(prefs);
  const existing = (await base44.entities.TherapistPref.list())[0] as ({ id: string } & RawPrefs) | undefined;
  const saved = existing
    ? await base44.entities.TherapistPref.update(existing.id, normalized)
    : await base44.entities.TherapistPref.create(normalized);
  return normalizePrefs(saved);
}
