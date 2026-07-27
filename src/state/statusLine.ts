// Pure derivation of the FlowOverlay/RecordOverlay generating-state status
// text (Task W5.7). The founder's ask: the line must name the actual work —
// which document type is being drafted, or that a session is being summarized
// — instead of a generic "…את הטיוטה…". Extracted so the ה-prefix rule (see
// docStatusLine below) is independently testable without rendering the overlay.

/** Shown while summarizing a session — the type never varies, so no derivation needed. */
export const SUMMARY_STATUS_LINE = 'דרור מסכם את הפגישה…';

/** Shown when there's no usable document type to name (missing, blank, or too long to read naturally). */
export const DOC_STATUS_FALLBACK = 'דרור מנסח את המסמך…';

/** Longest free-typed type we'll still read aloud in the status line before falling back. */
const MAX_TYPE_LENGTH = 30;

// Round-1 fix tried to detect a bound preposition (ל/ב/מ physically attach as
// a word's own first letter, e.g. "לקופת" in "מכתב לקופת חולים") purely by
// looking at the 2nd word's first letter(s). Round-2 review disproved that:
// ל/ב/מ/ש are ALSO the ordinary root-initial letters of countless unrelated
// nouns — "בקשה" (request), "מטופל" (patient), "מפגש" (meeting), "שלב"
// (stage) — so the same letter-level check misfired on real free-typed types
// ("אישור מטופל" -> wrongly "האישור מטופל"). There is no local (word-level)
// signal that reliably tells a bound preposition apart from a word's own
// first letter — the two are genuinely undecidable without real parsing —
// and the brand voice must never surface broken Hebrew while guessing. So
// the exact multi-word phrases known to need the FIRST-word placement are
// hardcoded below; every other multi-word type either takes the safe
// construct-chain default (ה before the last word) or, when the 2nd word's
// first letter(s) make that default itself unreliable, falls back to the
// generic מסמך line rather than risk a wrong guess.
const CURATED_DEFINITE_TYPES: Record<string, string> = {
  'אישור טיפול': 'אישור הטיפול',
  'מכתב לקופת חולים': 'המכתב לקופת חולים',
  'מסמך אינטייק': 'מסמך האינטייק',
  'חוות דעת': 'חוות הדעת',
  'סיכום טיפול': 'סיכום הטיפול',
};

// A word matching this is the ambiguous class from the comment above: it
// MIGHT be a bound preposition (in which case ה-before-last-word would be
// wrong) or might just be an ordinary word that happens to start the same way
// (in which case ה-before-last-word would be right) — with no way to tell
// which from the word alone. Rather than guess, docStatusLine falls back to
// the generic line whenever ANY word from index 1 onward is ambiguous (unless
// the whole phrase is one of the curated exceptions above, checked first).
//
// Round-2 only gated words[1] (the 2nd word), reasoning that it's the word
// right before the construct default's mutation point. Round-3 re-review
// found the gap that leaves: the construct default actually mutates the LAST
// word, not the 2nd — so a 3+-word phrase with an unambiguous 2nd word but an
// ambiguous LAST word slipped through, e.g. "מסמך הפניה לרופא" (words[1] =
// "הפניה", unambiguous) still let the construct default prefix ה onto
// words[2] = "לרופא", producing the invalid "מסמך הפניה הלרופא". So every
// word from index 1 on is now checked, not just the one right before the
// mutation point.
function isAmbiguousWord(word: string): boolean {
  return word === 'של' || /^[לבמ]/.test(word);
}

// Marks `type` definite by inserting ה in the grammatically correct spot, or
// returns null when doing so safely isn't possible (docStatusLine then uses
// the generic fallback). Checked in order:
//
// 1. One of the curated exact phrases above (docS1's shipped chip labels,
//    plus the brief's own "סיכום טיפול" example) — each has a known-correct
//    definite form, some of which need the FIRST word ("מכתב לקופת חולים").
// 2. Single word: prefix ה onto that word — always safe. Hebrew nouns from
//    the הפעיל/הפעלה pattern (החלטה, הצעה, הסבר, הפניה…) start with ה as
//    part of the word itself, not as a definite article — making them
//    definite still takes the article, DOUBLING the ה ("החלטה" ->
//    "ההחלטה"), which is correct Hebrew rather than an accidental
//    duplicate. So this prefix has no exception for a type whose own first
//    letter happens to be ה.
// 3. Multi-word, not curated, ANY word from index 1 onward is ambiguous
//    (isAmbiguousWord above): null — refuse to guess, let the generic line
//    stand in. Checking every trailing word (not just the one right before
//    the last-word mutation point) is what closes the round-3 gap above.
// 4. Multi-word, otherwise — every word from index 1 on is unambiguous, so
//    it's safely a construct chain (סמיכות): insert ה before the LAST word
//    — "סיכום שלב" -> "סיכום השלב", "סיכום פגישת היכרות" -> "סיכום פגישת
//    ההיכרות" (last word היכרות doubles its own ה, same as case 2 above).
function definiteType(trimmed: string): string | null {
  const words = trimmed.split(/\s+/);
  const normalized = words.join(' ');
  const curated = CURATED_DEFINITE_TYPES[normalized];
  if (curated) return curated;
  if (words.length === 1) return `ה${words[0]}`;
  if (words.slice(1).some(isAmbiguousWord)) return null;
  const lastIndex = words.length - 1;
  return [...words.slice(0, lastIndex), `ה${words[lastIndex]}`].join(' ');
}

export function docStatusLine(type: string | undefined): string {
  const trimmed = (type ?? '').trim();
  if (!trimmed || trimmed.length > MAX_TYPE_LENGTH) return DOC_STATUS_FALLBACK;
  const result = definiteType(trimmed);
  return result === null ? DOC_STATUS_FALLBACK : `דרור מנסח את ${result}…`;
}
