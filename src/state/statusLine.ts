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

// A second (or later) word starting with one of these reads as a bound
// preposition (ל/ב/מ physically attach as the word's own first letter) or the
// standalone "של" ("of") — e.g. "לקופת" in "מכתב לקופת חולים". For these, the
// phrase is NOT a simple two-word construct chain, so making it definite
// belongs on the FIRST word instead (round-1 fix — see docStatusLine below).
const PREPOSITION_LETTERS = /^[לבמ]/;

function startsLikePreposition(word: string): boolean {
  return PREPOSITION_LETTERS.test(word) || word.startsWith('של');
}

// Marks `type` definite by inserting ה in the grammatically correct spot,
// then wraps it in the "דרור מנסח את …" status line. Three cases (round-1
// fix — the original always-prefix-the-whole-phrase rule was wrong for
// multi-word types, e.g. it produced "החוות דעת" for "חוות דעת" instead of
// the correct "חוות הדעת"):
//
// 1. Single word: prefix ה onto that word. Hebrew nouns from the
//    הפעיל/הפעלה pattern (החלטה, הצעה, הסבר, הפניה…) start with ה as part of
//    the word itself, not as a definite article — making them definite still
//    takes the article, DOUBLING the ה ("החלטה" -> "ההחלטה"), which is
//    correct Hebrew rather than an accidental duplicate. So this prefix has
//    no exception for a type whose own first letter happens to be ה.
// 2. Multi-word, 2nd word reads like a bound preposition (see
//    startsLikePreposition above): prefix ה onto the FIRST word only —
//    "מכתב לקופת חולים" -> "המכתב לקופת חולים" (the rest is an idiomatic
//    unit — "קופת חולים", the health fund — left untouched).
// 3. Multi-word, otherwise (a construct chain, סמיכות): insert ה before the
//    LAST word — "חוות דעת" -> "חוות הדעת", "אישור טיפול" -> "אישור הטיפול".
function definiteType(trimmed: string): string {
  const words = trimmed.split(/\s+/);
  if (words.length === 1) return `ה${words[0]}`;
  if (startsLikePreposition(words[1])) {
    return [`ה${words[0]}`, ...words.slice(1)].join(' ');
  }
  const lastIndex = words.length - 1;
  return [...words.slice(0, lastIndex), `ה${words[lastIndex]}`].join(' ');
}

export function docStatusLine(type: string | undefined): string {
  const trimmed = (type ?? '').trim();
  if (!trimmed || trimmed.length > MAX_TYPE_LENGTH) return DOC_STATUS_FALLBACK;
  return `דרור מנסח את ${definiteType(trimmed)}…`;
}
