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

// Hebrew nouns from the הפעיל/הפעלה pattern (החלטה, הצעה, הסבר, הפניה…) start
// with ה as part of the word itself, not as a definite article — making them
// definite still takes the article, DOUBLING the ה ("החלטה" -> "ההחלטה"),
// which is correct Hebrew rather than an accidental duplicate. So the
// definite article ה is always prefixed, with no exception for a type whose
// own first letter happens to be ה.
export function docStatusLine(type: string | undefined): string {
  const trimmed = (type ?? '').trim();
  if (!trimmed || trimmed.length > MAX_TYPE_LENGTH) return DOC_STATUS_FALLBACK;
  return `דרור מנסח את ה${trimmed}…`;
}
