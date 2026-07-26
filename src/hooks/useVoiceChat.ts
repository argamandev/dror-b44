import { useCallback, useEffect, useRef, useState } from 'react';
import { askDror } from '@/api/ai';
import { speakHebrew, stopSpeaking } from '@/api/tts';
import { createChat, type ChatMsg } from '@/api/data';

// Minimal ambient typing for the (non-standard, Chrome-only) Web Speech API —
// there is no official DOM lib type for it. Mirrors useSessionRecorder.ts's
// shape; declared again here (that hook doesn't export its types) rather than
// shared, since the two `declare global` augmentations are structurally
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

// Same rationale as useSessionRecorder.ts: permission/device/service errors
// won't fix themselves on retry, so they stop the listen-again loop instead
// of spinning forever. A transient 'no-speech' (Chrome's silence timeout for
// a continuous=false utterance) is deliberately NOT in this set — it's
// exactly the case the auto-restart exists for.
const FATAL_RECOGNITION_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);

// Wave 4 Issue C: split same as useSessionRecorder.ts — 'service-not-allowed'
// (iOS Safari when Siri/Dictation is unavailable) means the mic is FINE but
// the recognition/transcription service isn't, so it must surface as a
// distinct state, not the generic "mic denied" message.
const MIC_ACCESS_RECOGNITION_ERRORS = new Set(['not-allowed', 'audio-capture']);
const SPEECH_UNAVAILABLE_RECOGNITION_ERRORS = new Set(['service-not-allowed']);

export type VoicePhase = 'listening' | 'thinking' | 'speaking';

export interface UseVoiceChatArgs {
  /** Patient this conversation is about; omit for a general (Home) conversation. */
  patientId?: string;
}

export interface UseVoiceChat {
  phase: VoicePhase;
  caption: string;
  /** Live transcript of what Dror last heard — updates as speech is recognized. */
  lastUserText: string;
  supported: boolean;
  /** Mic permission denied/unavailable — the overlay shows its own notice and the loop stops. */
  micError: boolean;
  /** Recognition/transcription service failed (e.g. iOS 'service-not-allowed' or a constructor throw) while the mic itself is fine. */
  speechUnavailable: boolean;
  stop(): void;
}

const CAPTIONS: Record<VoicePhase, string> = {
  listening: 'דרור מקשיב…',
  thinking: 'דרור חושב…',
  speaking: 'דרור מדבר…',
};

const VOICE_CHAT_TITLE = 'שיחה קולית עם דרור';

// Speech-to-speech loop: SpeechRecognition (he-IL, single utterance per turn)
// -> on a final transcript, ask the real Dror agent (conversation kept across
// turns via conversationIdRef) -> speak the reply (src/api/tts.ts's priority
// chain) -> on playback end, listen again. Everything async is guarded by
// closedRef so a callback that resolves after stop()/unmount is a no-op —
// mirrors FlowOverlay/RecordOverlay's closedRef pattern, StrictMode-safe (the
// mount effect resets it, the cleanup sets it).
export function useVoiceChat({ patientId }: UseVoiceChatArgs): UseVoiceChat {
  const [phase, setPhase] = useState<VoicePhase>('listening');
  const [lastUserText, setLastUserText] = useState('');
  const [micError, setMicError] = useState(false);
  const [speechUnavailable, setSpeechUnavailable] = useState(false);

  const supported = !!RecognitionCtor;

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  const closedRef = useRef(false);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef<ChatMsg[]>([]);
  // Kept in sync every render so the async turn handler always reads the
  // current prop, not whatever it was when the hook first mounted.
  const patientIdRef = useRef(patientId);
  patientIdRef.current = patientId;

  // Function DECLARATIONS (not consts) so startListening/createRecognitionInstance
  // /handleTurn can reference each other regardless of source order — hoisting
  // resolves the mutual recursion; none of them actually run until an event
  // fires, by which point every declaration in this render's closure exists.

  function createRecognitionInstance(): SpeechRecognitionLike | null {
    if (!RecognitionCtor) return null;
    const rec = new RecognitionCtor();
    rec.lang = 'he-IL';
    rec.continuous = false;
    rec.interimResults = true;

    // Scoped to this one instance (a fresh instance is created per listen
    // attempt) so there's no stale state to reset between turns.
    let finalized = false;
    let fatal = false;

    rec.onresult = (ev) => {
      if (closedRef.current) return;
      let finalChunk = '';
      let interimChunk = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const text = r[0]?.transcript ?? '';
        if (r.isFinal) finalChunk += text;
        else interimChunk += text;
      }
      if (finalChunk) {
        // Double-final defense: one utterance should only ever start one turn.
        if (finalized) return;
        finalized = true;
        setLastUserText(finalChunk);
        void handleTurn(finalChunk);
      } else if (interimChunk) {
        setLastUserText(interimChunk);
      }
    };

    rec.onerror = (ev) => {
      if (closedRef.current) return;
      if (FATAL_RECOGNITION_ERRORS.has(ev.error)) {
        fatal = true;
        wantListeningRef.current = false;
        if (MIC_ACCESS_RECOGNITION_ERRORS.has(ev.error)) {
          setMicError(true);
        } else if (SPEECH_UNAVAILABLE_RECOGNITION_ERRORS.has(ev.error)) {
          setSpeechUnavailable(true);
        }
      }
      // Non-fatal (e.g. 'no-speech') — onend below decides whether to restart.
    };

    rec.onend = () => {
      if (recognitionRef.current === rec) recognitionRef.current = null;
      if (closedRef.current || finalized || fatal) return;
      // Silence timeout with nothing recognized yet — just listen again, no
      // error surfaced (per spec).
      if (wantListeningRef.current) startListening();
    };

    return rec;
  }

  function startListening() {
    if (closedRef.current || !supported) return;
    wantListeningRef.current = true;
    setPhase('listening');
    // Wave 4 Issue C: iOS can throw constructing OR starting recognition in
    // edge states (e.g. Siri/Dictation disabled) — never surface that as
    // micError, since the mic itself was never touched.
    let rec: SpeechRecognitionLike | null;
    try {
      rec = createRecognitionInstance();
    } catch {
      wantListeningRef.current = false;
      setSpeechUnavailable(true);
      return;
    }
    if (!rec) return;
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      wantListeningRef.current = false;
      setSpeechUnavailable(true);
    }
  }

  async function handleTurn(userText: string) {
    if (closedRef.current) return;
    setPhase('thinking');

    let answer: string;
    let conversationId: string;
    try {
      const res = await askDror({
        message: userText,
        patientId: patientIdRef.current,
        conversationId: conversationIdRef.current,
      });
      answer = res.answer;
      conversationId = res.conversationId;
    } catch {
      if (closedRef.current) return;
      // No reply to speak — resume listening rather than getting stuck on
      // "thinking" (mirrors recognition's no-speech case: no error surfaced).
      startListening();
      return;
    }

    if (closedRef.current) return;
    conversationIdRef.current = conversationId;
    messagesRef.current = [
      ...messagesRef.current,
      { role: 'user', text: userText, ts: new Date().toISOString() },
      { role: 'dror', text: answer, ts: new Date().toISOString() },
    ];

    setPhase('speaking');
    try {
      await speakHebrew(answer);
    } catch {
      /* best-effort playback — proceed to listening regardless */
    }
    if (closedRef.current) return;
    startListening();
  }

  // Persists the conversation so far as a Chat entity (mirrors useAppState's
  // sendChat persistence, kept local here per controller resolution 1 to avoid
  // entangling the voice state machine with the chat screen's). Idempotent
  // against a StrictMode double-invoke via closedRef; best-effort (the
  // conversation already happened even if this save fails).
  const stop = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    wantListeningRef.current = false;

    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
    stopSpeaking();

    const messages = messagesRef.current;
    if (messages.length > 0) {
      createChat({
        title: VOICE_CHAT_TITLE,
        patient_id: patientIdRef.current ?? '',
        conversation_id: conversationIdRef.current ?? '',
        messages,
      }).catch(() => {
        /* best-effort — dropping the history record silently is preferable
           to surfacing an error after the user already closed the overlay */
      });
    }
  }, []);

  useEffect(() => {
    closedRef.current = false;
    if (supported) startListening();
    return () => {
      stop();
    };
    // Mount/unmount only — supported is derived from a module-level constant
    // and stop is a stable (deps-free) callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    phase,
    caption: CAPTIONS[phase],
    lastUserText,
    supported,
    micError,
    speechUnavailable,
    stop,
  };
}
