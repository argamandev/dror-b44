import { describe, it, expect } from 'vitest';
import {
  shouldTranscribeRecording,
  shouldToastTranscriptionFailure,
  RECORDED_TRANSCRIPTION_MAX_BYTES,
} from './useSessionRecorder';

// Task W5.5 — pure decision logic behind stop()'s recorded-transcription
// path (fill the transcript, server-side, for sessions that had no live
// SpeechRecognition — the founder's iPhone). Written first (red), before the
// wiring in useSessionRecorder.ts's stop(), per the task brief's TDD
// requirement for the one piece of this task with real branching (size gate
// / availability gate / error routing). No DOM, no MediaRecorder/timers —
// those live entirely in the hook and are exercised by tsc/build + review,
// matching the convention set by useDictation.test.ts.

describe('shouldTranscribeRecording', () => {
  it('requirement 3 — never attempts when live recognition delivered a transcript, so nothing is double-transcribed', () => {
    expect(shouldTranscribeRecording('שלום, איך היה השבוע', 1_000)).toBe(false);
  });

  it('treats a whitespace-only live transcript as no transcript at all', () => {
    expect(shouldTranscribeRecording('   \n  ', 1_000)).toBe(true);
  });

  it('attempts when live recognition returned nothing even though it reported no error (the iOS Safari case)', () => {
    expect(shouldTranscribeRecording('', 2_000_000)).toBe(true);
  });

  it('does not attempt when there is no recorded audio at all (blob size 0)', () => {
    expect(shouldTranscribeRecording('', 0)).toBe(false);
  });

  it('does not attempt for a negative/invalid size (defensive)', () => {
    expect(shouldTranscribeRecording('', -1)).toBe(false);
  });

  it('attempts exactly at the 15MB boundary (inclusive)', () => {
    expect(shouldTranscribeRecording('', RECORDED_TRANSCRIPTION_MAX_BYTES)).toBe(true);
  });

  it('requirement 2 — does not attempt one byte over the 15MB gate', () => {
    expect(shouldTranscribeRecording('', RECORDED_TRANSCRIPTION_MAX_BYTES + 1)).toBe(false);
  });

  it('does not attempt when both the transcript gate and the size gate would independently fail', () => {
    expect(shouldTranscribeRecording('יש טקסט חי', RECORDED_TRANSCRIPTION_MAX_BYTES + 1)).toBe(false);
  });
});

describe('shouldToastTranscriptionFailure', () => {
  it('requirement 2 — stays silent for no_key: the feature simply is not configured, not the user’s problem', () => {
    expect(shouldToastTranscriptionFailure('no_key')).toBe(false);
  });

  it('toasts for too_large (server disagreed with the client-side size gate)', () => {
    expect(shouldToastTranscriptionFailure('too_large')).toBe(true);
  });

  it('toasts for a generic stt_failed', () => {
    expect(shouldToastTranscriptionFailure('stt_failed')).toBe(true);
  });
});
