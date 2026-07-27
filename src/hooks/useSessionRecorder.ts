import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyMicError, isMicSupported, MIC_UNSUPPORTED, type MicErrorKind } from './micAccess';
import { SttError, transcribeAudio, type SttErrorCode } from '@/api/stt';

// Minimal ambient typing for the (non-standard, Chrome-only) Web Speech API —
// there is no official DOM lib type for it.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

// Errors that mean retrying won't help (permission denied / no mic at all /
// recognition service unavailable) — restarting on these would spin in a
// tight start/error/end loop forever. A transient 'no-speech' (Chrome's
// silence timeout — the exact case the auto-restart exists for) is
// deliberately NOT in this set.
const FATAL_RECOGNITION_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);

// Wave 4 Issue C: these two used to be the SAME set ('micError' fired for
// all three), which wrongly told the user recording itself was blocked when
// only live transcription had failed — iOS Safari's webkitSpeechRecognition
// fires 'service-not-allowed' whenever Siri/Dictation is unavailable, even
// though getUserMedia succeeded and MediaRecorder is capturing audio just
// fine. Split into two disjoint sets so the two failure modes get two
// different (and differently-handled) states:

// Real mic-ACCESS failures — the mic itself is denied or gone, so recording
// genuinely cannot continue.
const MIC_ACCESS_RECOGNITION_ERRORS = new Set(['not-allowed', 'audio-capture']);

// The transcription SERVICE failed while the mic is fine — recording (the
// MediaRecorder + timer) keeps running with an empty transcript.
const TRANSCRIPT_UNAVAILABLE_RECOGNITION_ERRORS = new Set(['service-not-allowed']);

// Wave 4 Issue C: shown by FlowOverlay/RecordOverlay under the timer when
// `transcriptUnavailable` is true and recording is still running.
export const TRANSCRIPT_UNAVAILABLE_NOTICE =
  'תמלול חי אינו זמין במכשיר הזה — ההקלטה נמשכת, ואפשר גם לכתוב נקודות במקום';

// Task W5.5 — shown by FlowOverlay/RecordOverlay in place of the recording
// controls while stop() is awaiting server-side transcription of the
// recorded audio (see `transcribing` / shouldTranscribeRecording below).
export const TRANSCRIBING_NOTICE = 'דרור מתמלל את ההקלטה…';

// Requirement 2 (task brief): over this size, keep the honest no-transcript
// path instead of sending a very large upload.
export const RECORDED_TRANSCRIPTION_MAX_BYTES = 15 * 1024 * 1024;

// Calm, single toast so the user knows a transcription attempt happened and
// didn't land (requirement 2) — never shown for `no_key` (see
// shouldToastTranscriptionFailure below).
export const RECORDED_TRANSCRIPTION_FAILED_TOAST = 'דרור ניסה לתמלל את ההקלטה ולא הצליח הפעם';

/**
 * Pure decision (Task W5.5, TDD'd in useSessionRecorder.test.ts): should
 * stop() attempt server-side transcription of the recorded audio blob?
 * Requirement 3 — when live recognition delivered a transcript throughout,
 * `transcriptUnavailable` stays false and this is always false: the live
 * path is untouched, never double-transcribed. Requirement 2 — an empty or
 * over-the-gate blob keeps the existing honest no-transcript path instead.
 */
export function shouldTranscribeRecording(transcriptUnavailable: boolean, blobSize: number): boolean {
  if (!transcriptUnavailable) return false;
  if (blobSize <= 0) return false;
  return blobSize <= RECORDED_TRANSCRIPTION_MAX_BYTES;
}

/**
 * Error routing (requirement 2, TDD'd alongside shouldTranscribeRecording):
 * `no_key` means the transcription feature simply isn't configured
 * server-side — not the therapist's problem and not actionable, so it stays
 * silent (the existing no-transcript path, no toast). Every other outcome
 * (`too_large`, `stt_failed`) gets one calm toast.
 */
export function shouldToastTranscriptionFailure(code: SttErrorCode): boolean {
  return code !== 'no_key';
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

const RecognitionCtor: SpeechRecognitionCtor | undefined =
  typeof window !== 'undefined' ? window.SpeechRecognition ?? window.webkitSpeechRecognition : undefined;

export interface SessionRecorder {
  seconds: number;
  running: boolean;
  transcript: string;
  supported: boolean;
  /**
   * Real mic-access failure (getUserMedia rejection, or an unrecoverable
   * 'not-allowed'/'audio-capture' from the recognition side) — recording
   * cannot run. Null when there's no mic error; otherwise the classified
   * kind (Task W5.2 — see micAccess.ts/micCopy.ts) so the UI can show
   * precise, honest guidance instead of a generic refusal message.
   */
  micErrorKind: MicErrorKind | null;
  /** The transcription service failed (or isn't supported) while the mic itself is fine — recording continues, transcript stays empty. */
  transcriptUnavailable: boolean;
  /** Task W5.5: true while stop() is awaiting server-side transcription of the recorded audio — show TRANSCRIBING_NOTICE while this is true. */
  transcribing: boolean;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  /**
   * Stops recording. When `transcriptUnavailable` is true and the recorded
   * audio is within the size gate (Task W5.5), this awaits server-side
   * transcription before resolving — `transcript` in the result (and the
   * hook's own reactive `transcript`) already has the filled-in text by
   * then, so callers must not start summarization before this resolves. The
   * live-transcript path (`transcriptUnavailable` stays false throughout) is
   * untouched — no extra await, no behavior change. `transcriptionFailed` is
   * true when transcription was attempted and did not land (excluding the
   * silent, not-configured `no_key` case) — pair it with
   * RECORDED_TRANSCRIPTION_FAILED_TOAST.
   */
  stop(): Promise<{ seconds: number; transcript: string; transcriptionFailed: boolean }>;
  reset(): void;
}

// Appends a newly-final speech chunk to the accumulated transcript, adding a
// separating space when needed so consecutive final segments (e.g. across a
// Chrome-forced silence restart) don't run together.
function appendFinal(current: string, chunk: string): string {
  if (!chunk) return current;
  if (!current) return chunk;
  return /\s$/.test(current) || /^\s/.test(chunk) ? current + chunk : `${current} ${chunk}`;
}

// Records a session: keeps the mic hot via MediaRecorder while running live
// Hebrew transcription through SpeechRecognition in parallel. Chrome kills
// SpeechRecognition after a few seconds of silence even in `continuous`
// mode, so `onend` auto-restarts it whenever we're still supposed to be
// listening (tracked via `wantRecognitionRef`, distinct from an intentional
// pause/stop). Task W5.5: the MediaRecorder's audio chunks are retained
// (not discarded) so a session with no live transcript can be handed to
// server-side transcription once stop() decides it's needed — see
// shouldTranscribeRecording and stop() below.
export function useSessionRecorder(): SessionRecorder {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [micErrorKind, setMicErrorKind] = useState<MicErrorKind | null>(null);
  const [transcriptUnavailable, setTranscriptUnavailable] = useState(false);
  // Task W5.5: true while stop() is awaiting transcribeAudio() for a session
  // that had no live transcript — see stop()'s docstring below.
  const [transcribing, setTranscribing] = useState(false);

  const secondsRef = useRef(0);
  const transcriptRef = useRef('');
  // Mirrors `transcriptUnavailable` synchronously — stop() reads this to
  // decide whether the recorded-transcription path applies, the same
  // ref-mirrors-state rationale as transcriptRef above (lets stop()'s
  // useCallback stay stable rather than needing to be redefined every time
  // the state itself changes).
  const transcriptUnavailableRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRecognitionRef = useRef(false);
  const fatalErrorRef = useRef(false);
  // Task W5.2 fix round 1: guards start() against overlapping invocations
  // (e.g. a rapid double-tap of a retry button) — two concurrent calls would
  // each open their own getUserMedia stream, the second silently overwriting
  // streamRef/recorderRef and leaking the first (nothing left to stop it).
  const startingRef = useRef(false);
  // Task W5.5: the recorded audio, retained only long enough to hand to
  // transcribeAudio() once stop() decides it's needed (shouldTranscribeRecording)
  // — cleared the instant it's no longer needed (releaseMedia, or right after
  // being read into a Blob), so nothing holds a session's audio beyond that.
  const chunksRef = useRef<Blob[]>([]);
  // True once this hook instance has unmounted — stop()'s post-transcription
  // continuation (a real network round-trip) can resolve well after that and
  // must not write state on a component that's gone (mirrors useDictation.ts's
  // / useVoiceChat.ts's closedRef).
  const closedRef = useRef(false);
  // stop() re-entrancy guard (Task W5.5): a caller can invoke stop() a second
  // time while the first call is still awaiting transcription (e.g. the user
  // taps the overlay's X while TRANSCRIBING_NOTICE is showing) — without
  // this, the second call would race the first's MediaRecorder teardown (see
  // stopRecorderAndCollectBlob) and could clear chunksRef out from under the
  // first call's still-pending onstop. A concurrent caller gets back the
  // SAME promise instead of starting a second, conflicting stop.
  const stopPromiseRef = useRef<Promise<{
    seconds: number;
    transcript: string;
    transcriptionFailed: boolean;
  }> | null>(null);

  const supported = !!RecognitionCtor;

  const stopTimer = useCallback(() => {
    if (timerRef.current !== undefined) clearInterval(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
    }, 1000);
  }, [stopTimer]);

  const setTranscriptBoth = useCallback((t: string) => {
    transcriptRef.current = t;
    setTranscript(t);
  }, []);

  const setTranscriptUnavailableBoth = useCallback((v: boolean) => {
    transcriptUnavailableRef.current = v;
    setTranscriptUnavailable(v);
  }, []);

  // Stops the MediaRecorder and releases the getUserMedia stream's tracks.
  // Shared by stop() (an intentional close) and rec.onerror's mic-access
  // branch below (an async failure that can arrive well after start() already
  // resolved with running=true) — Task W5.2 fix round 1: before this, that
  // onerror branch only flipped state (micErrorKind/running) and left the
  // still-live stream/recorder referenced by nothing else, so a retry's
  // start() would overwrite streamRef/recorderRef with a fresh stream and
  // leak the old one (and its mic indicator) forever.
  const releaseMedia = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      // Task W5.5 fix round 1 (review Important): cleared BEFORE stop() —
      // MediaRecorder.stop() queues a final 'dataavailable' event (the
      // ENTIRE un-timesliced recording, as one Blob) on whatever handler is
      // still attached, fired asynchronously on the next tick. Left
      // attached (as it was before this fix), that late flush pushed the
      // full recording right back into chunksRef.current a moment after the
      // synchronous clear below — on EVERY ordinary stop() (this is the
      // live-transcript path's teardown, the majority case), silently
      // parking tens of MB in memory until the next start()/unmount instead
      // of actually releasing it. Nulling the handlers first makes that late
      // flush a no-op.
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop()); // mic indicator must go off
      streamRef.current = null;
    }
    // Task W5.5: this is the hard-teardown path (onerror's mic-access branch,
    // a fresh start(), unmount) — any retained audio from an in-progress
    // recorded-transcription session is abandoned along with everything else.
    chunksRef.current = [];
  }, []);

  // Task W5.5 — the async counterpart to releaseMedia() above, used ONLY on
  // the no-live-transcript path (see stop() below). MediaRecorder.stop() only
  // queues its final 'dataavailable'/'stop' events asynchronously — there is
  // no synchronous "flush now" API — so building a Blob immediately the way
  // releaseMedia()'s fire-and-forget teardown does would miss the tail of the
  // recording. This awaits that flush, then does the same stream teardown
  // releaseMedia() does, and hands back whatever chunksRef accumulated (null
  // when there's nothing to send).
  const stopRecorderAndCollectBlob = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      releaseMedia();
      return Promise.resolve(null);
    }
    return new Promise<Blob | null>((resolve) => {
      const finish = () => {
        const chunks = chunksRef.current;
        const type = recorder.mimeType || 'audio/webm';
        const blob = chunks.length > 0 ? new Blob(chunks, { type }) : null;
        chunksRef.current = [];
        recorderRef.current = null;
        const stream = streamRef.current;
        streamRef.current = null;
        if (stream) {
          try {
            stream.getTracks().forEach((t) => t.stop()); // mic indicator must go off
          } catch {
            /* ignore */
          }
        }
        resolve(blob);
      };
      recorder.onstop = finish;
      recorder.onerror = finish; // don't hang forever if stopping itself errors
      try {
        recorder.stop();
      } catch {
        finish();
      }
    });
  }, [releaseMedia]);

  const createRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (!RecognitionCtor) return null;
    const rec = new RecognitionCtor();
    rec.lang = 'he-IL';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let finalChunk = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalChunk += r[0]?.transcript ?? '';
      }
      if (finalChunk) setTranscriptBoth(appendFinal(transcriptRef.current, finalChunk));
    };
    rec.onerror = (ev) => {
      // A transient 'no-speech' (Chrome's silence timeout) is exactly the
      // case onend's auto-restart below exists for — only permission/device/
      // service errors stop the retry loop, since those won't fix themselves.
      if (FATAL_RECOGNITION_ERRORS.has(ev.error)) fatalErrorRef.current = true;
      // A mic-access error can arrive asynchronously, after start() already
      // resolved with running=true — surface it as a visible failure state
      // instead of leaving a fake "listening" UI ticking away, and stop the
      // recording outright (there is no audio to keep capturing).
      if (MIC_ACCESS_RECOGNITION_ERRORS.has(ev.error)) {
        // Tear down fully — see releaseMedia's docstring above for why this
        // can't be skipped just because recording is about to show as
        // stopped: nothing else is holding a reference to this stream/
        // recorder once this handler returns.
        wantRecognitionRef.current = false;
        recognitionRef.current = null;
        releaseMedia();
        setMicErrorKind(classifyMicError(ev.error));
        stopTimer();
        setRunning(false);
      } else if (TRANSCRIPT_UNAVAILABLE_RECOGNITION_ERRORS.has(ev.error)) {
        // The mic/MediaRecorder are unaffected — recording keeps running,
        // just without a live transcript.
        setTranscriptUnavailableBoth(true);
      }
    };
    rec.onend = () => {
      if (wantRecognitionRef.current && !fatalErrorRef.current) {
        try {
          rec.start();
        } catch {
          // iOS can throw here in edge states (e.g. Dictation just got
          // disabled) — the mic/recording are unaffected, only live
          // transcription is lost; never surface this as micError.
          setTranscriptUnavailableBoth(true);
        }
      }
    };
    return rec;
  }, [setTranscriptBoth, stopTimer, releaseMedia]);

  const stopRecognition = useCallback(() => {
    wantRecognitionRef.current = false;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try {
        rec.onend = null;
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Clears accumulated transcript/seconds/error state without touching the
  // mic/recognition lifecycle — used when the consumer switches methods
  // (e.g. abandons a recording for text entry) so the abandoned side's data
  // can't resurface later. `start()` also calls this internally on a fresh
  // attempt.
  const reset = useCallback(() => {
    secondsRef.current = 0;
    transcriptRef.current = '';
    fatalErrorRef.current = false;
    setSeconds(0);
    setTranscript('');
    setMicErrorKind(null);
    setTranscriptUnavailableBoth(false);
    setTranscribing(false);
  }, []);

  const start = useCallback(async () => {
    // Re-entrancy guard (Task W5.2 fix round 1) — see startingRef's docstring.
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      // Defense-in-depth: release any still-live stream/recorder/recognition
      // from a previous attempt before requesting fresh ones. rec.onerror's
      // mic-access branch already tears its own attempt down (see
      // releaseMedia), but start() must never be the single point of failure
      // for that invariant — nothing here should ever have a next attempt
      // silently overwrite (and leak) a still-open stream.
      stopRecognition();
      releaseMedia();
      reset();
      // Task W5.5: a fresh recording attempt must never inherit a previous
      // one's in-flight (or just-settled) stop()/transcription promise.
      stopPromiseRef.current = null;

      // No getUserMedia at all (rather than a call that would throw/reject) —
      // classify it the same way a real rejection would be, via the sentinel,
      // instead of letting `undefined.getUserMedia(...)` throw a generic
      // TypeError that would otherwise land in the 'unknown' bucket.
      if (!isMicSupported()) {
        setMicErrorKind(classifyMicError(MIC_UNSUPPORTED));
        return;
      }

      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        streamRef.current = null;
        // Mic denied/unavailable — surface precisely why instead of pretending to listen.
        setMicErrorKind(classifyMicError(err));
        return;
      }

      try {
        const recorder = new MediaRecorder(streamRef.current);
        chunksRef.current = [];
        // Task W5.5: retained (not discarded) so a session with no live
        // transcript can be handed to server-side transcription once stop()
        // decides it's needed (shouldTranscribeRecording) — released the
        // moment that's done, or immediately by releaseMedia() if it never
        // ends up needed.
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        recorder.start();
        recorderRef.current = recorder;
      } catch {
        recorderRef.current = null;
      }

      if (supported) {
        wantRecognitionRef.current = true;
        // iOS Safari can throw constructing/starting SpeechRecognition in edge
        // states (e.g. Siri/Dictation disabled) — the mic/MediaRecorder above
        // are already running and unaffected, so this must never become
        // micError: only live transcription is unavailable.
        try {
          const rec = createRecognition();
          recognitionRef.current = rec;
          rec?.start();
        } catch {
          wantRecognitionRef.current = false;
          recognitionRef.current = null;
          setTranscriptUnavailableBoth(true);
        }
      } else {
        // No SpeechRecognition API at all — recording still proceeds via
        // MediaRecorder alone, just without a live transcript.
        setTranscriptUnavailableBoth(true);
      }

      startTimer();
      setRunning(true);
    } finally {
      startingRef.current = false;
    }
  }, [createRecognition, reset, startTimer, supported, stopRecognition, releaseMedia]);

  const pause = useCallback(() => {
    stopRecognition();
    try {
      recorderRef.current?.pause();
    } catch {
      /* ignore */
    }
    stopTimer();
    setRunning(false);
  }, [stopRecognition, stopTimer]);

  const resume = useCallback(() => {
    if (supported) {
      wantRecognitionRef.current = true;
      fatalErrorRef.current = false;
      try {
        const rec = createRecognition();
        recognitionRef.current = rec;
        rec?.start();
      } catch {
        wantRecognitionRef.current = false;
        recognitionRef.current = null;
        setTranscriptUnavailableBoth(true);
      }
    } else {
      setTranscriptUnavailableBoth(true);
    }
    try {
      recorderRef.current?.resume();
    } catch {
      /* ignore */
    }
    startTimer();
    setRunning(true);
  }, [createRecognition, startTimer, supported]);

  // Task W5.5 — when this session had no live transcript
  // (transcriptUnavailable), stop() now awaits server-side transcription of
  // the recorded audio before resolving (see shouldTranscribeRecording and
  // `transcribing` above), so a caller's summarize step never starts before
  // the text exists. On success, `transcript` (both the returned value and
  // the reactive `transcript` state) is replaced with the server result —
  // strictly a superset of whatever partial live text may have preceded a
  // mid-session recognition failure, never a smaller one, so there's nothing
  // to merge. The live-transcript path (transcriptUnavailable stays false
  // throughout) is completely untouched: no extra await, no behavior change
  // (requirement 3). Re-entrant-safe via stopPromiseRef — see its docstring
  // above — and every continuation past an `await` checks closedRef before
  // touching state, since the caller can unmount while transcription is
  // still in flight.
  const stop = useCallback((): Promise<{ seconds: number; transcript: string; transcriptionFailed: boolean }> => {
    if (stopPromiseRef.current) return stopPromiseRef.current;

    const run = async () => {
      stopRecognition();

      const wantsRecordedTranscription = transcriptUnavailableRef.current;
      let blob: Blob | null = null;
      if (wantsRecordedTranscription) {
        blob = await stopRecorderAndCollectBlob();
      } else {
        releaseMedia();
      }

      stopTimer();
      if (!closedRef.current) setRunning(false);

      let finalTranscript = transcriptRef.current;
      let transcriptionFailed = false;

      if (blob && shouldTranscribeRecording(wantsRecordedTranscription, blob.size)) {
        if (!closedRef.current) setTranscribing(true);
        try {
          const text = await transcribeAudio(blob);
          finalTranscript = text;
          if (!closedRef.current) setTranscriptBoth(text);
        } catch (err) {
          // Requirement 2: no_key (feature not configured) stays silent;
          // every other outcome (too_large, stt_failed) is toast-worthy. The
          // existing honest no-transcript path is kept either way —
          // finalTranscript is left exactly as it was (empty, since this only
          // runs when there was no live transcript to begin with).
          const code = err instanceof SttError ? err.code : 'stt_failed';
          transcriptionFailed = shouldToastTranscriptionFailure(code);
        } finally {
          if (!closedRef.current) setTranscribing(false);
        }
      }

      return { seconds: secondsRef.current, transcript: finalTranscript, transcriptionFailed };
    };

    const promise = run();
    stopPromiseRef.current = promise;
    void promise.finally(() => {
      stopPromiseRef.current = null;
    });
    return promise;
  }, [stopRecognition, stopRecorderAndCollectBlob, releaseMedia, stopTimer, setTranscriptBoth]);

  // Safety net: release the mic/timer if the component unmounts mid-recording.
  useEffect(() => {
    closedRef.current = false;
    return () => {
      closedRef.current = true;
      stopRecognition();
      releaseMedia();
      stopTimer();
    };
  }, [stopRecognition, releaseMedia, stopTimer]);

  return {
    seconds,
    running,
    transcript,
    supported,
    micErrorKind,
    transcriptUnavailable,
    transcribing,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
