import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyMicError, isMicSupported, MIC_UNSUPPORTED, type MicErrorKind } from './micAccess';

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
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<{ seconds: number; transcript: string }>;
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

// Records a session: keeps the mic hot via MediaRecorder (audio chunks are
// discarded for now — future-proofing for audio upload) while running live
// Hebrew transcription through SpeechRecognition in parallel. Chrome kills
// SpeechRecognition after a few seconds of silence even in `continuous`
// mode, so `onend` auto-restarts it whenever we're still supposed to be
// listening (tracked via `wantRecognitionRef`, distinct from an intentional
// pause/stop).
export function useSessionRecorder(): SessionRecorder {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [micErrorKind, setMicErrorKind] = useState<MicErrorKind | null>(null);
  const [transcriptUnavailable, setTranscriptUnavailable] = useState(false);

  const secondsRef = useRef(0);
  const transcriptRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRecognitionRef = useRef(false);
  const fatalErrorRef = useRef(false);

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
        setMicErrorKind(classifyMicError(ev.error));
        stopTimer();
        setRunning(false);
      } else if (TRANSCRIPT_UNAVAILABLE_RECOGNITION_ERRORS.has(ev.error)) {
        // The mic/MediaRecorder are unaffected — recording keeps running,
        // just without a live transcript.
        setTranscriptUnavailable(true);
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
          setTranscriptUnavailable(true);
        }
      }
    };
    return rec;
  }, [setTranscriptBoth, stopTimer]);

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
    setTranscriptUnavailable(false);
  }, []);

  const start = useCallback(async () => {
    reset();

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
      recorder.ondataavailable = () => {
        /* chunks discarded this week — MediaRecorder is only kept running to
           keep the mic hot and future-proof audio upload */
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
        setTranscriptUnavailable(true);
      }
    } else {
      // No SpeechRecognition API at all — recording still proceeds via
      // MediaRecorder alone, just without a live transcript.
      setTranscriptUnavailable(true);
    }

    startTimer();
    setRunning(true);
  }, [createRecognition, reset, startTimer, supported]);

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
        setTranscriptUnavailable(true);
      }
    } else {
      setTranscriptUnavailable(true);
    }
    try {
      recorderRef.current?.resume();
    } catch {
      /* ignore */
    }
    startTimer();
    setRunning(true);
  }, [createRecognition, startTimer, supported]);

  const stop = useCallback(async () => {
    stopRecognition();
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop()); // mic indicator must go off
      streamRef.current = null;
    }
    stopTimer();
    setRunning(false);
    return { seconds: secondsRef.current, transcript: transcriptRef.current };
  }, [stopRecognition, stopTimer]);

  // Safety net: release the mic/timer if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      stopRecognition();
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopTimer();
    };
  }, [stopRecognition, stopTimer]);

  return {
    seconds,
    running,
    transcript,
    supported,
    micErrorKind,
    transcriptUnavailable,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
