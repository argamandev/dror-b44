import { describe, it, expect } from 'vitest';
import {
  advance,
  createEndpointState,
  DEFAULT_ENDPOINT_CONFIG,
  type EndpointConfig,
  type EndpointState,
  type EndpointStopReason,
} from './voiceEndpoint';

// Task W5.3 — silence endpointing for the recorded voice path (devices with
// no SpeechRecognition, i.e. every iPhone). The recorded path has to decide on
// its own when the user has finished talking; this pure reducer is that
// decision, isolated from MediaRecorder/WebAudio so it can be tested in ms,
// not in real seconds.
//
// Contract under test:
//   - a sample at/above the threshold is SPEECH; strictly below it is SILENCE
//   - stop after >= silenceMs of CONTIGUOUS silence, but only once >= minSpeechMs
//     of speech has been heard in total (cumulative across dips)
//   - never stop on silence alone — a user who hasn't started talking yet must
//     not have their turn ended out from under them
//   - hard-cap every utterance at maxUtteranceMs from the first sample, no
//     matter what was heard

const STEP_MS = 100; // the hook samples ~10/s

// Levels used symbolically below so the tests read as "speech / quiet" rather
// than as magic numbers; both are well clear of the threshold boundary, which
// gets its own dedicated tests.
const LOUD = 0.5;
const QUIET = 0;

interface RunResult {
  /** Index of the sample that produced the first 'stop', or null if none did. */
  stopIndex: number | null;
  stopReason: EndpointStopReason | null;
  /** State after the last sample fed (or after the stop, if one fired). */
  state: EndpointState;
  /** Every action emitted, one per sample fed. */
  actions: Array<'none' | 'stop'>;
}

/**
 * Feeds `levels` as evenly-spaced samples, stopping the moment the reducer
 * says 'stop' (as the hook does — it tears the recorder down on the first
 * stop and never advances the state machine again).
 */
function run(levels: number[], config: EndpointConfig = DEFAULT_ENDPOINT_CONFIG, stepMs = STEP_MS): RunResult {
  let state = createEndpointState();
  const actions: Array<'none' | 'stop'> = [];
  for (let i = 0; i < levels.length; i++) {
    const res = advance(state, { rms: levels[i], at: 1_000_000 + i * stepMs }, config);
    state = res.state;
    actions.push(res.action);
    if (res.action === 'stop') {
      return { stopIndex: i, stopReason: res.reason ?? null, state, actions };
    }
  }
  return { stopIndex: null, stopReason: null, state, actions };
}

const repeat = (level: number, count: number) => Array<number>(count).fill(level);

describe('voiceEndpoint reducer', () => {
  describe('silence only — the turn is never ended before the user starts talking', () => {
    it('emits nothing across 20s of pure silence', () => {
      const res = run(repeat(QUIET, 200));
      expect(res.stopIndex).toBeNull();
      expect(res.actions.every((a) => a === 'none')).toBe(true);
      expect(res.state.speechMs).toBe(0);
    });

    it('accumulates the silence run without acting on it', () => {
      const res = run(repeat(QUIET, 30));
      // 30 samples, the first of which spans no interval (nothing precedes it).
      expect(res.state.silenceMs).toBe(29 * STEP_MS);
    });
  });

  describe('speech then a pause — stops at 1.4s of silence, not before', () => {
    // 6 loud samples span 500ms of speech (the first sample spans no interval),
    // which is exactly minSpeechMs; 14 quiet samples then span 1400ms.
    const levels = [...repeat(LOUD, 6), ...repeat(QUIET, 40)];

    it('stops on the sample where the silence run reaches 1.4s', () => {
      const res = run(levels);
      expect(res.stopIndex).toBe(19);
      expect(res.stopReason).toBe('silence');
    });

    it('is still listening one sample earlier (1.3s of silence)', () => {
      const res = run(levels.slice(0, 19));
      expect(res.stopIndex).toBeNull();
      expect(res.state.silenceMs).toBe(1300);
    });

    it('reports the speech it heard', () => {
      const res = run(levels);
      expect(res.state.speechMs).toBe(500);
      expect(res.state.silenceMs).toBe(1400);
    });

    it('requires the speech minimum — 400ms of speech then a long pause never stops', () => {
      const res = run([...repeat(LOUD, 5), ...repeat(QUIET, 100)]);
      expect(res.stopIndex).toBeNull();
      expect(res.state.speechMs).toBe(400);
    });
  });

  describe('brief dips below the threshold do not end the turn', () => {
    it('a 1.0s pause mid-sentence resets the silence run', () => {
      const res = run([...repeat(LOUD, 6), ...repeat(QUIET, 10), ...repeat(LOUD, 4), ...repeat(QUIET, 13)]);
      expect(res.stopIndex).toBeNull();
      expect(res.state.silenceMs).toBe(1300);
    });

    it('stops once a dip finally does reach 1.4s', () => {
      const res = run([...repeat(LOUD, 6), ...repeat(QUIET, 10), ...repeat(LOUD, 4), ...repeat(QUIET, 14)]);
      expect(res.stopIndex).toBe(33);
      expect(res.stopReason).toBe('silence');
    });

    it('counts speech cumulatively across dips, not contiguously', () => {
      // 3 loud (200ms) + a dip + 4 loud (400ms) = 600ms total, so the pause
      // that follows is allowed to end the turn even though neither speech run
      // on its own reached 500ms.
      const res = run([...repeat(LOUD, 3), ...repeat(QUIET, 5), ...repeat(LOUD, 4), ...repeat(QUIET, 14)]);
      expect(res.stopIndex).toBe(25);
      expect(res.stopReason).toBe('silence');
      expect(res.state.speechMs).toBe(600);
    });
  });

  describe('60s hard cap from record start', () => {
    it('stops continuous speech at 60s', () => {
      const res = run(repeat(LOUD, 700));
      expect(res.stopIndex).toBe(600); // 600 * 100ms = 60_000ms elapsed
      expect(res.stopReason).toBe('max-duration');
      expect(res.state.elapsedMs).toBe(60_000);
    });

    it('caps a silence-only utterance too — nothing runs forever', () => {
      const res = run(repeat(QUIET, 700));
      expect(res.stopIndex).toBe(600);
      expect(res.stopReason).toBe('max-duration');
      // No speech was heard, which is what lets the hook skip the upload.
      expect(res.state.speechMs).toBe(0);
    });

    it('does not fire one sample early', () => {
      const res = run(repeat(LOUD, 600)); // last sample sits at 59.9s
      expect(res.stopIndex).toBeNull();
      expect(res.state.elapsedMs).toBe(59_900);
    });
  });

  describe('threshold boundary', () => {
    const t = DEFAULT_ENDPOINT_CONFIG.threshold;

    it('a sample exactly at the threshold counts as speech', () => {
      const res = run([...repeat(t, 6), ...repeat(QUIET, 14)]);
      expect(res.stopIndex).toBe(19);
      expect(res.state.speechMs).toBe(500);
    });

    it('a sample just below the threshold counts as silence', () => {
      const res = run([...repeat(t - 1e-6, 40)]);
      expect(res.stopIndex).toBeNull();
      expect(res.state.speechMs).toBe(0);
      expect(res.state.silenceMs).toBe(39 * STEP_MS);
    });

    it('ends the turn on levels that fall to just below the threshold', () => {
      const res = run([...repeat(t, 6), ...repeat(t - 1e-6, 14)]);
      expect(res.stopIndex).toBe(19);
      expect(res.stopReason).toBe('silence');
    });
  });

  describe('robustness', () => {
    it('is idempotent once stopped — a late sample never re-fires', () => {
      const res = run([...repeat(LOUD, 6), ...repeat(QUIET, 14)]);
      expect(res.state.stopped).toBe(true);
      const after = advance(res.state, { rms: LOUD, at: 9_999_999 });
      expect(after.action).toBe('none');
      expect(after.state).toEqual(res.state);
    });

    it('treats a non-advancing or out-of-order timestamp as zero elapsed time', () => {
      let state = createEndpointState();
      state = advance(state, { rms: QUIET, at: 1000 }).state;
      state = advance(state, { rms: QUIET, at: 900 }).state; // clock went backwards
      state = advance(state, { rms: QUIET, at: 900 }).state; // duplicate sample
      expect(state.silenceMs).toBe(0);
      expect(state.elapsedMs).toBe(0);
    });

    it('honours a custom config', () => {
      const config: EndpointConfig = { threshold: 0.5, minSpeechMs: 100, silenceMs: 200, maxUtteranceMs: 5000 };
      const res = run([...repeat(LOUD, 2), ...repeat(QUIET, 10)], config);
      expect(res.stopIndex).toBe(3);
      expect(res.stopReason).toBe('silence');
    });

    it('caps on a custom maxUtteranceMs', () => {
      const config: EndpointConfig = { ...DEFAULT_ENDPOINT_CONFIG, maxUtteranceMs: 1000 };
      const res = run(repeat(LOUD, 40), config);
      expect(res.stopIndex).toBe(10);
      expect(res.stopReason).toBe('max-duration');
    });

    it('does not mutate the state it is given', () => {
      const state = createEndpointState();
      const snapshot = { ...state };
      advance(state, { rms: LOUD, at: 5000 });
      expect(state).toEqual(snapshot);
    });
  });

  describe('defaults match the brief', () => {
    it('is 1.4s of silence after 0.5s of speech, capped at 60s', () => {
      expect(DEFAULT_ENDPOINT_CONFIG.silenceMs).toBe(1400);
      expect(DEFAULT_ENDPOINT_CONFIG.minSpeechMs).toBe(500);
      expect(DEFAULT_ENDPOINT_CONFIG.maxUtteranceMs).toBe(60_000);
      expect(DEFAULT_ENDPOINT_CONFIG.threshold).toBeGreaterThan(0);
      expect(DEFAULT_ENDPOINT_CONFIG.threshold).toBeLessThan(1);
    });
  });
});
