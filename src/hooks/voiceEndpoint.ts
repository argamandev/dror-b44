// Task W5.3 — end-of-utterance detection for the RECORDED voice path.
//
// Devices without SpeechRecognition (every iPhone — Apple restricts it) get
// no "the user stopped talking" signal for free: the browser hands us a
// MediaRecorder and nothing else. So useVoiceChat samples the mic level ~10
// times a second through a WebAudio analyser and feeds those samples here;
// this module decides, and only decides, when the turn is over.
//
// It is deliberately a pure state machine — no timers, no audio nodes, no
// refs — so the whole decision (which is otherwise only observable by talking
// into a phone for a minute) is testable in milliseconds. See
// voiceEndpoint.test.ts, which was written before this file.

export interface EndpointConfig {
  /**
   * RMS level (0..1) at or above which a sample counts as speech. Tuned for
   * a phone held at conversational distance: room tone and breath sit an
   * order of magnitude below this, speech an order of magnitude above.
   */
  threshold: number;
  /** Total speech that must have been heard before a pause is allowed to end the turn. */
  minSpeechMs: number;
  /** Contiguous silence that ends the turn, once minSpeechMs has been met. */
  silenceMs: number;
  /** Hard bound on a single utterance, measured from the first sample. */
  maxUtteranceMs: number;
}

export const DEFAULT_ENDPOINT_CONFIG: EndpointConfig = {
  threshold: 0.02,
  minSpeechMs: 500,
  silenceMs: 1400,
  maxUtteranceMs: 60_000,
};

export type EndpointStopReason = 'silence' | 'max-duration';

export interface EndpointSample {
  /** Root-mean-square level of the audio since the previous sample, 0..1. */
  rms: number;
  /** Timestamp of this sample (Date.now()/performance.now() — any monotonic ms clock). */
  at: number;
}

export interface EndpointState {
  /** Total speech heard so far, cumulative across dips (not the longest run). */
  speechMs: number;
  /** Length of the CURRENT silence run; reset by any speech sample. */
  silenceMs: number;
  /** Time from the first sample to the latest one. */
  elapsedMs: number;
  /** Timestamp of the first sample; null before any sample has arrived. */
  startedAt: number | null;
  /** Timestamp of the most recent sample. */
  lastAt: number | null;
  /** True once 'stop' has been emitted — the machine is inert from then on. */
  stopped: boolean;
}

export interface EndpointResult {
  state: EndpointState;
  action: 'none' | 'stop';
  /** Why the turn ended; only present alongside action === 'stop'. */
  reason?: EndpointStopReason;
}

export function createEndpointState(): EndpointState {
  return { speechMs: 0, silenceMs: 0, elapsedMs: 0, startedAt: null, lastAt: null, stopped: false };
}

/**
 * Folds one mic-level sample into the state and reports whether the utterance
 * should now end.
 *
 * Time is attributed by the gap between samples rather than by counting them,
 * so a hiccup in the sampling interval (a busy main thread, a backgrounded
 * tab) can't make a 1.4s pause read as 0.9s. The first sample spans no
 * interval, and a clock that fails to advance (or goes backwards) contributes
 * nothing — never negative time.
 *
 * A sample AT the threshold is speech; strictly below it is silence.
 */
export function advance(
  state: EndpointState,
  sample: EndpointSample,
  config: EndpointConfig = DEFAULT_ENDPOINT_CONFIG,
): EndpointResult {
  // Inert once stopped: the hook tears the recorder down on the first stop,
  // but an already-scheduled tick can still land afterwards, and it must not
  // end a second utterance that hasn't started yet.
  if (state.stopped) return { state, action: 'none' };

  const startedAt = state.startedAt ?? sample.at;
  const dt = state.lastAt === null ? 0 : Math.max(0, sample.at - state.lastAt);
  const isSpeech = sample.rms >= config.threshold;

  const next: EndpointState = {
    speechMs: isSpeech ? state.speechMs + dt : state.speechMs,
    silenceMs: isSpeech ? 0 : state.silenceMs + dt,
    elapsedMs: Math.max(0, sample.at - startedAt),
    startedAt,
    lastAt: sample.at,
    stopped: false,
  };

  // The normal ending: a real pause after the user has genuinely said
  // something. Checked before the hard cap so that on the (vanishingly rare)
  // sample where both are true, the reason reported is the informative one.
  if (next.speechMs >= config.minSpeechMs && next.silenceMs >= config.silenceMs) {
    return { state: { ...next, stopped: true }, action: 'stop', reason: 'silence' };
  }

  // Safety bound. Applies even when nothing was ever heard (a mic that stayed
  // silent, or a device where level monitoring is unavailable) so no turn can
  // record forever — the caller checks speechMs to decide whether the audio is
  // even worth transcribing.
  if (next.elapsedMs >= config.maxUtteranceMs) {
    return { state: { ...next, stopped: true }, action: 'stop', reason: 'max-duration' };
  }

  return { state: next, action: 'none' };
}
