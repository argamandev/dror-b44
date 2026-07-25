import { useCallback, useEffect, useRef, useState } from 'react';

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

// Errors that mean retrying won't help (permission denied / no mic at all) —
// restarting on these would spin in a tight start/error/end loop forever.
// A transient 'no-speech' (Chrome's silence timeout — the exact case the
// auto-restart exists for) is deliberately NOT in this set.
const FATAL_RECOGNITION_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);

// Subset of the fatal errors above that specifically mean "no mic access" —
// surfaced to the UI via `micError` so a denied/unavailable mic shows a
// visible notice instead of a fake "listening" state.
const MIC_ACCESS_RECOGNITION_ERRORS = new Set(['not-allowed', 'service-not-allowed']);

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
  micError: boolean;
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
  const [micError, setMicError] = useState(false);

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
      // case onend's auto-restart below exists for — only permission/device
      // errors stop the retry loop, since those won't fix themselves.
      if (FATAL_RECOGNITION_ERRORS.has(ev.error)) fatalErrorRef.current = true;
      // A mic-access error can arrive asynchronously, after start() already
      // resolved with running=true — surface it as a visible failure state
      // instead of leaving a fake "listening" UI ticking away.
      if (MIC_ACCESS_RECOGNITION_ERRORS.has(ev.error)) {
        setMicError(true);
        stopTimer();
        setRunning(false);
      }
    };
    rec.onend = () => {
      if (wantRecognitionRef.current && !fatalErrorRef.current) {
        try {
          rec.start();
        } catch {
          /* already running / transient — the next onend retries */
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
    setMicError(false);
  }, []);

  const start = useCallback(async () => {
    reset();

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      streamRef.current = null;
      // Mic denied/unavailable — surface it instead of pretending to listen.
      setMicError(true);
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
      const rec = createRecognition();
      recognitionRef.current = rec;
      try {
        rec?.start();
      } catch {
        /* ignore */
      }
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
      const rec = createRecognition();
      recognitionRef.current = rec;
      try {
        rec?.start();
      } catch {
        /* ignore */
      }
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

  return { seconds, running, transcript, supported, micError, start, pause, resume, stop, reset };
}
