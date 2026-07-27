// Task W5.2 — honest mic-error taxonomy.
//
// Founder-reported bug (on-device, iPhone): recording said "blocked" even
// though he'd approved the mic inside the browser. On iPhone, mic permission
// has TWO layers — the in-page site permission AND the iOS system switch
// (הגדרות ← Chrome/Safari ← מיקרופון) — and when the iOS layer is off,
// getUserMedia rejects with the exact same NotAllowedError as an in-page
// refusal. There is no way to tell the two apart from JS, so this classifier
// deliberately does not try; 'denied' stays one bucket, and micCopy.ts's
// guidance for it covers both layers instead of guessing which one it was.
//
// Wave 4 already split "mic access failed" from "live transcription failed"
// (see useSessionRecorder.ts / useVoiceChat.ts) — this module only refines
// the FORMER into a precise-enough taxonomy for honest Hebrew guidance.

export type MicErrorKind = 'denied' | 'no-device' | 'busy' | 'unsupported' | 'unknown';

/**
 * Sentinel passed to classifyMicError when there is no getUserMedia API to
 * even attempt, rather than a thrown/rejected error — lets "the browser can't
 * record here at all" flow through the same single classifier as a real
 * rejection would. Most callers should just call isMicSupported() directly
 * as a pre-flight; this sentinel exists for call sites that funnel every mic
 * failure through classifyMicError uniformly.
 */
export const MIC_UNSUPPORTED: unique symbol = Symbol('mic-unsupported');

/** True when this browser/context exposes getUserMedia at all (says nothing about permission/hardware — just whether it's worth attempting). */
export function isMicSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

const DENIED_NAMES = new Set(['NotAllowedError', 'PermissionDeniedError', 'SecurityError']);
const NO_DEVICE_NAMES = new Set(['NotFoundError', 'OverconstrainedError', 'DevicesNotFoundError']);
const BUSY_NAMES = new Set(['NotReadableError', 'AbortError', 'TrackStartError']);

// Fallback only — used when there's no .name to classify by (a bare string,
// or a plain object without a name field). Real getUserMedia rejections are
// DOMExceptions with a proper .name and never reach this; it mainly exists
// so non-Error inputs (including the Web Speech API's bare error-code
// strings, e.g. 'not-allowed') still resolve to something sensible instead of
// always 'unknown'. Hyphens/underscores are normalized to spaces so those
// error-code strings match the same keywords a human-readable message would.
function classifyByText(text: string): MicErrorKind {
  const t = text.toLowerCase().replace(/[-_]/g, ' ');
  if (/denied|permission|not allowed|security/.test(t)) return 'denied';
  if (/not found|no device|no microphone|overconstrained|requested device/.test(t)) return 'no-device';
  if (/could not start|track start|already in use|in use|busy/.test(t)) return 'busy';
  return 'unknown';
}

/**
 * Classifies a getUserMedia rejection (or any mic-related error) into one of
 * a small, honest set of buckets a UI can give precise Hebrew guidance for —
 * see micCopy.ts. Classifies by err.name (DOMException) first; only falls
 * back to sniffing err.message (or, for a bare string, the string itself)
 * when no .name is present at all. A .name that IS present but unmapped
 * (e.g. a generic TypeError) is 'unknown' — it is never sniffed, since the
 * name already answered the question.
 */
export function classifyMicError(err: unknown): MicErrorKind {
  if (err === MIC_UNSUPPORTED) return 'unsupported';

  const name =
    typeof err === 'object' && err !== null && 'name' in err && typeof (err as { name: unknown }).name === 'string'
      ? (err as { name: string }).name
      : undefined;

  if (name !== undefined) {
    if (DENIED_NAMES.has(name)) return 'denied';
    if (NO_DEVICE_NAMES.has(name)) return 'no-device';
    if (BUSY_NAMES.has(name)) return 'busy';
    return 'unknown';
  }

  const message =
    typeof err === 'string'
      ? err
      : typeof err === 'object' &&
          err !== null &&
          'message' in err &&
          typeof (err as { message: unknown }).message === 'string'
        ? (err as { message: string }).message
        : undefined;

  return message !== undefined ? classifyByText(message) : 'unknown';
}
