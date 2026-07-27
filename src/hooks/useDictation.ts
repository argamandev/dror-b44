import { useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '@/api/stt';
import { getMicGuidance } from './micCopy';
import { classifyMicError, isMicSupported, MIC_UNSUPPORTED } from './micAccess';

// Task W5.4 — dictation on the ChatBar's mic button: tap → speak Hebrew →
// words land in the text input → the user edits and sends like any typed
// message. Completely separate from the orb voice-conversation mode
// (useVoiceChat.ts / VoiceOverlay.tsx) — no agent call, no TTS, no turn loop;
// this hook only ever writes text into whatever input owns it.
//
// Engine-split exactly like useVoiceChat.ts's ENGINE constant: live
// SpeechRecognition wherever it exists (desktop Chrome, Android), MediaRecorder
// + server transcription (src/api/stt.ts) everywhere else that can capture
// audio at all (iPhone). Teardown discipline mirrors useVoiceChat.ts /
// useSessionRecorder.ts's releaseMedia pattern: handlers cleared before
// stopping, tracks always stopped, refs always nulled, re-entrancy guarded —
// the last three tasks' reviews each hunted a leaked mic stream here.

// Minimal ambient typing for the (non-standard, Chrome-only) Web Speech API —
// there is no official DOM lib type for it. Redeclared here rather than
// shared with useVoiceChat.ts/useSessionRecorder.ts (neither exports its
// types); the three `declare global` augmentations are structurally
// identical and merge without conflict.
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

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

const RecognitionCtor: SpeechRecognitionCtor | undefined =
  typeof window !== 'undefined' ? window.SpeechRecognition ?? window.webkitSpeechRecognition : undefined;

const hasMediaRecorder = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';

type DictationEngine = 'live' | 'recorded';

// Chosen once at module load, same rule as useVoiceChat.ts's ENGINE constant.
const ENGINE: DictationEngine | null =
  RecognitionCtor ? 'live' : hasMediaRecorder && isMicSupported() ? 'recorded' : null;

// Per the brief: iOS Safari/Chrome only produce audio/mp4; everything else on
// the recorded path prefers Opus. `undefined` means "let the browser pick".
const RECORDING_MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus'];

function pickRecordingMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return RECORDING_MIME_CANDIDATES.find((mime) => {
    try {
      return MediaRecorder.isTypeSupported(mime);
    } catch {
      return false;
    }
  });
}

// Same taxonomy as useSessionRecorder.ts / useVoiceChat.ts: errors that mean
// retrying won't help stop the live engine outright; a transient 'no-speech'
// is deliberately NOT in this set (onend just lets the caller decide whether
// to keep listening).
const FATAL_RECOGNITION_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);
const MIC_ACCESS_RECOGNITION_ERRORS = new Set(['not-allowed', 'audio-capture']);
const SPEECH_UNAVAILABLE_RECOGNITION_ERRORS = new Set(['service-not-allowed']);

// A forgotten mic must never run forever. The brief calls this out for the
// recorded path explicitly ("auto-stop → transcribe"), but an open live
// SpeechRecognition session holds the mic just as much as an open
// MediaRecorder does, so the same cap applies to both engines — on the
// recorded path it fires the exact same stop() a manual tap would, so it
// always transcribes whatever was captured; on the live path it just ends
// listening (whatever was already committed stays in the input).
const HARD_CAP_MS = 90_000;

// Two failures that are NOT a mic-access problem (the mic itself is fine),
// so they don't route through W5.2's getMicGuidance — calm, one-line, same
// register as the rest of the app's failure copy (STT_FAILED_TOAST mirrors
// useVoiceChat.ts's own constant of the same name verbatim).
const SPEECH_UNAVAILABLE_TOAST = 'הכתבה קולית אינה זמינה במכשיר הזה — אפשר לכתוב לדרור';
const STT_FAILED_TOAST = 'דרור לא הצליח לשמוע, נסו שוב';

/**
 * Merges a newly-arrived chunk (a live interim/final result, or a recorded
 * utterance's transcript) into the anchor — the input's own text at the
 * moment dictation started, re-anchored to include each committed final
 * chunk as it lands. Adds a separating space only when neither side already
 * supplies boundary whitespace, so consecutive chunks (across a Chrome
 * silence-restart, or onto whatever the user had already typed) never run
 * together and are never double-spaced. Pure — see useDictation.test.ts,
 * written first.
 */
export function mergeDictationText(anchor: string, chunk: string): string {
  if (!chunk) return anchor;
  if (!anchor) return chunk;
  return /\s$/.test(anchor) || /^\s/.test(chunk) ? anchor + chunk : `${anchor} ${chunk}`;
}

export interface UseDictationArgs {
  /** Reads the input's current value — sampled at start() so dictation appends onto whatever the user already typed. */
  getValue: () => string;
  /** Writes the merged text back into the input as chunks arrive/commit. */
  setValue: (next: string) => void;
  /** Compact Hebrew toast (a single headline, not the multi-step guidance) for any dictation failure. */
  onError: (message: string) => void;
}

export interface UseDictation {
  /** True while dictation is listening/recording — drives the mic button's pulse. */
  active: boolean;
  /** True while a recorded utterance is being transcribed (recorded engine only). */
  pending: boolean;
  start(): void;
  stop(): void;
  toggle(): void;
}

export function useDictation({ getValue, setValue, onError }: UseDictationArgs): UseDictation {
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);

  // Kept in sync every render so callbacks that fire well after this render
  // (a recognition event, a transcription round-trip) always read the
  // latest closure instead of whatever was current when they were attached.
  const getValueRef = useRef(getValue);
  getValueRef.current = getValue;
  const setValueRef = useRef(setValue);
  setValueRef.current = setValue;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // The text dictation appends onto: the input's own content at start(),
  // re-anchored to include each committed final chunk as it lands.
  const anchorRef = useRef('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const hardCapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Mirrors `active` synchronously — read inside closures where a state
  // update from this render isn't visible yet (a rapid double-tap, an async
  // getUserMedia resolving after stop()/unmount).
  const activeRef = useRef(false);
  // True once this hook instance has unmounted — every async callback checks
  // it before touching state or refs.
  const closedRef = useRef(false);
  // Guards startRecorded()'s getUserMedia against overlapping invocations —
  // belt-and-braces alongside start()'s own activeRef check at its top (see
  // the W5.2/W5.3 review history: two concurrent getUserMedia calls would
  // each open their own stream, the second silently overwriting streamRef
  // and leaking the first, still-live one with nothing left to stop it).
  const startingRef = useRef(false);
  // Set once a fatal recognition error has stopped the live engine, so its
  // onend (which ALSO fires right after an error) does not restart listening
  // on top of an error state.
  const fatalRef = useRef(false);

  function clearHardCap() {
    if (hardCapTimerRef.current !== undefined) {
      clearTimeout(hardCapTimerRef.current);
      hardCapTimerRef.current = undefined;
    }
  }

  // THE hard-teardown path — unmount and any error state go through this.
  // Handlers are cleared BEFORE stopping so this can never be mistaken for a
  // graceful stop (see stop() below, which deliberately leaves them attached
  // so a final recognition result can still flush / a recorded blob can
  // still be transcribed). Idempotent and never throws — safe to call
  // defensively at the top of a fresh attempt too.
  function releaseMedia() {
    clearHardCap();

    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }

    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        /* ignore */
      }
    }

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      try {
        stream.getTracks().forEach((t) => t.stop()); // the mic indicator must go off
      } catch {
        /* ignore */
      }
    }

    chunksRef.current = [];
    startingRef.current = false;
  }

  // -- live engine (SpeechRecognition) -------------------------------------

  function createRecognition(): SpeechRecognitionLike | null {
    if (!RecognitionCtor) return null;
    const rec = new RecognitionCtor();
    rec.lang = 'he-IL';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (ev) => {
      if (closedRef.current) return;
      let finalChunk = '';
      let interimChunk = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const t = r[0]?.transcript ?? '';
        if (r.isFinal) finalChunk += t;
        else interimChunk += t;
      }
      if (finalChunk) {
        // Commit: the anchor now includes this chunk, so the next interim
        // (or the next final, across a silence-restart) builds on top of it.
        anchorRef.current = mergeDictationText(anchorRef.current, finalChunk.trim());
        setValueRef.current(anchorRef.current);
      } else if (interimChunk) {
        // Not committed — recomputed from the same anchor every tick, so an
        // interim never accumulates onto a previous interim.
        setValueRef.current(mergeDictationText(anchorRef.current, interimChunk));
      }
    };

    rec.onerror = (ev) => {
      if (closedRef.current) return;
      if (!FATAL_RECOGNITION_ERRORS.has(ev.error)) return; // e.g. 'no-speech' — onend decides
      fatalRef.current = true;
      activeRef.current = false;
      setActive(false);
      clearHardCap();
      if (MIC_ACCESS_RECOGNITION_ERRORS.has(ev.error)) {
        onErrorRef.current(getMicGuidance(classifyMicError(ev.error)).headline);
      } else if (SPEECH_UNAVAILABLE_RECOGNITION_ERRORS.has(ev.error)) {
        onErrorRef.current(SPEECH_UNAVAILABLE_TOAST);
      }
    };

    rec.onend = () => {
      if (recognitionRef.current === rec) recognitionRef.current = null;
      if (closedRef.current || !activeRef.current || fatalRef.current) return;
      // Chrome's silence timeout for a continuous session — keep listening;
      // no error surfaced (matches useSessionRecorder.ts's live transcript).
      try {
        recognitionRef.current = rec;
        rec.start();
      } catch {
        activeRef.current = false;
        setActive(false);
        onErrorRef.current(SPEECH_UNAVAILABLE_TOAST);
      }
    };

    return rec;
  }

  function startLive() {
    fatalRef.current = false;
    let rec: SpeechRecognitionLike | null;
    try {
      rec = createRecognition();
    } catch {
      activeRef.current = false;
      setActive(false);
      onErrorRef.current(SPEECH_UNAVAILABLE_TOAST);
      return;
    }
    if (!rec) {
      // Unreachable in practice (ENGINE === 'live' implies RecognitionCtor is
      // truthy) — defensive fallback only.
      activeRef.current = false;
      setActive(false);
      onErrorRef.current(getMicGuidance('unsupported').headline);
      return;
    }
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      recognitionRef.current = null;
      activeRef.current = false;
      setActive(false);
      onErrorRef.current(SPEECH_UNAVAILABLE_TOAST);
      return;
    }
    hardCapTimerRef.current = setTimeout(() => stop(), HARD_CAP_MS);
  }

  // -- recorded engine (MediaRecorder + transcribeAudio) -------------------

  async function startRecorded() {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      if (!isMicSupported()) {
        activeRef.current = false;
        setActive(false);
        onErrorRef.current(getMicGuidance(classifyMicError(MIC_UNSUPPORTED)).headline);
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        activeRef.current = false;
        setActive(false);
        onErrorRef.current(getMicGuidance(classifyMicError(err)).headline);
        return;
      }

      // Stopped (or unmounted) while getUserMedia's permission prompt was
      // still up — release the now-live stream instead of storing it; there
      // is nothing left holding it once this attempt is abandoned.
      if (closedRef.current || !activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const mimeType = pickRecordingMime();
      let recorder: MediaRecorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        // The mic itself was fine — this browser just can't record it.
        stream.getTracks().forEach((t) => t.stop());
        activeRef.current = false;
        setActive(false);
        onErrorRef.current(getMicGuidance('unsupported').headline);
        return;
      }

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onerror = (ev) => {
        if (closedRef.current) return;
        releaseMedia();
        activeRef.current = false;
        setActive(false);
        onErrorRef.current(getMicGuidance(classifyMicError((ev as Event & { error?: unknown }).error)).headline);
      };

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = chunks.length > 0 ? new Blob(chunks, { type }) : null;

        // Released the instant the utterance ends — the mic indicator must
        // go off immediately, not when the transcription round-trip returns.
        const s = streamRef.current;
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        clearHardCap();
        if (s) {
          try {
            s.getTracks().forEach((t) => t.stop());
          } catch {
            /* ignore */
          }
        }

        if (closedRef.current) return;
        if (!blob || blob.size === 0) return;
        void finishTranscription(blob);
      };

      try {
        recorder.start();
      } catch {
        releaseMedia();
        activeRef.current = false;
        setActive(false);
        onErrorRef.current(SPEECH_UNAVAILABLE_TOAST);
        return;
      }

      hardCapTimerRef.current = setTimeout(() => stop(), HARD_CAP_MS);
    } finally {
      startingRef.current = false;
    }
  }

  async function finishTranscription(blob: Blob) {
    setPending(true);
    try {
      const text = await transcribeAudio(blob);
      if (closedRef.current) return;
      const trimmed = text.trim();
      if (trimmed) {
        anchorRef.current = mergeDictationText(anchorRef.current, trimmed);
        setValueRef.current(anchorRef.current);
      }
    } catch {
      if (closedRef.current) return;
      onErrorRef.current(STT_FAILED_TOAST);
    } finally {
      if (!closedRef.current) setPending(false);
    }
  }

  // -- public API ------------------------------------------------------------

  function start() {
    if (closedRef.current || activeRef.current) return;
    if (!ENGINE) {
      onErrorRef.current(getMicGuidance('unsupported').headline);
      return;
    }
    anchorRef.current = getValueRef.current();
    activeRef.current = true;
    setActive(true);
    if (ENGINE === 'recorded') {
      void startRecorded();
    } else {
      startLive();
    }
  }

  function stop() {
    if (!activeRef.current && !recognitionRef.current && !recorderRef.current) return;
    activeRef.current = false;
    setActive(false);
    clearHardCap();

    // Live engine: rec.stop() (not abort()) so Chrome flushes one last
    // onresult for the tail of speech before ending — onend is cleared
    // first so that flush can't restart listening.
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }

    // Recorded engine: onstop (still attached) is what transcribes — the
    // only path that flips `pending`, via finishTranscription.
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        releaseMedia();
      }
    }
  }

  function toggle() {
    if (activeRef.current) stop();
    else start();
  }

  // Safety net: release everything if the component unmounts mid-dictation
  // (ChatBar unmounts on the 'draft' screen) — mirrors useSessionRecorder.ts's
  // / useVoiceChat.ts's unmount cleanup. StrictMode-safe: closedRef resets on
  // every (re-)mount, so a dev double-invoke's first mount's cleanup can't
  // poison the second mount.
  useEffect(() => {
    closedRef.current = false;
    return () => {
      closedRef.current = true;
      activeRef.current = false;
      releaseMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { active, pending, start, stop, toggle };
}
