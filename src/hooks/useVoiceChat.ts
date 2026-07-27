import { useCallback, useEffect, useRef, useState } from 'react';
import { askDror } from '@/api/ai';
import { speakHebrew, stopSpeaking } from '@/api/tts';
import { transcribeAudio } from '@/api/stt';
import { getSharedAudioContext, resumeSharedAudioContext } from '@/api/audioUnlock';
import { createChat, type ChatMsg } from '@/api/data';
import { classifyMicError, isMicSupported, MIC_UNSUPPORTED, type MicErrorKind } from './micAccess';
import { advance, createEndpointState, DEFAULT_ENDPOINT_CONFIG, type EndpointState } from './voiceEndpoint';

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

// -- Task W5.3: the second input engine ----------------------------------
//
// Founder-reported: "I click on the orb, I talk to him, he doesn't respond at
// all." On his iPhone there is no SpeechRecognition at all (Apple restricts
// it), so the loop above had no input engine and simply sat there. The
// recorded engine below is the fallback: MediaRecorder captures the utterance,
// a WebAudio analyser decides when it ended (voiceEndpoint.ts), and the
// auth-gated `stt` function transcribes it (src/api/stt.ts). From the
// transcript onwards the two engines share one downstream — handleTurn.
type VoiceEngine = 'live' | 'recorded';

const hasMediaRecorder = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';

// Chosen once, at module load, exactly like RecognitionCtor above: live
// recognition wherever it exists (desktop Chrome keeps today's behavior
// untouched), recorded everywhere else that can capture audio at all.
const ENGINE: VoiceEngine | null = RecognitionCtor ? 'live' : hasMediaRecorder && isMicSupported() ? 'recorded' : null;

// Ordered by preference: iOS Safari/Chrome only produce audio/mp4, everything
// else prefers Opus. An undefined result means "let the browser pick" rather
// than failing to record.
const RECORDING_MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];

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

// ~10 samples a second — dense enough that the 1.4s silence window is measured
// to a tenth of a second, cheap enough to run on a phone for a full minute.
const LEVEL_SAMPLE_MS = 100;

// Same calm register as the rest of the app's failures (see useAppState's
// ASK_ERROR / RecordOverlay's SUMMARIZE_FAILED_TOAST): says what didn't work,
// never blames the user, always leaves a way forward.
const STT_FAILED_TOAST = 'דרור לא הצליח לשמוע, נסו שוב';

/**
 * Mic level of the current analyser window, 0..1 — the reducer's only input.
 * Byte time-domain data (rather than float) because it is the one analyser
 * read supported everywhere, including older iOS Safari.
 */
function readRms(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

export type VoicePhase = 'listening' | 'thinking' | 'speaking';

export interface UseVoiceChatArgs {
  /** Patient this conversation is about; omit for a general (Home) conversation. */
  patientId?: string;
  /** App-level toast (App.tsx's state.showToast) — used for the one failure the loop can't recover silently from: transcription. */
  showToast?: (text: string) => void;
}

export interface UseVoiceChat {
  phase: VoicePhase;
  caption: string;
  /** Live transcript of what Dror last heard — updates as speech is recognized. */
  lastUserText: string;
  /** True when this device has ANY voice input engine — live recognition, or (Task W5.3) recording + server transcription. */
  supported: boolean;
  /**
   * Mic permission denied/unavailable — the overlay shows its own guidance
   * and the loop stops. Null when there's no mic error; otherwise the
   * classified kind (Task W5.2 — see micAccess.ts/micCopy.ts).
   */
  micErrorKind: MicErrorKind | null;
  /** Recognition/transcription service failed (e.g. iOS 'service-not-allowed' or a constructor throw) while the mic itself is fine. */
  speechUnavailable: boolean;
  /** Re-attempts listening after a mic error, without needing to reopen the overlay (e.g. once the user has fixed a settings toggle). */
  retryMic(): void;
  /**
   * Ends the current utterance now (the orb tap). On the recorded engine that
   * stops the recorder and sends what was captured; on the live engine it is
   * deliberately a no-op — the recognizer already decides when an utterance is
   * over, and Task W5.3 must not change that path's behavior.
   */
  endUtterance(): void;
  stop(): void;
}

// Short and quiet — this sits under the orb as a state hint, not a label
// (Task W5.3 requirement 4).
const CAPTIONS: Record<VoicePhase, string> = {
  listening: 'מקשיב…',
  thinking: 'חושב…',
  speaking: 'עונה…',
};

const VOICE_CHAT_TITLE = 'שיחה קולית עם דרור';

// Spoken the moment the overlay opens, before any listening — the founder's
// addition to W5.3: the orb shouldn't open into silence and wait to be spoken
// to first. Deliberately NOT added to messagesRef: it isn't part of the agent
// conversation (there is no conversationId yet), and recording it would make
// every opened-and-immediately-closed overlay persist a Chat entity that
// contains nothing but Dror greeting himself.
const GREETING = 'היי, איך אני יכול לעזור?';

// Speech-to-speech loop: capture one utterance (whichever engine this device
// has — SpeechRecognition live, or Task W5.3's record-and-transcribe) -> on a
// transcript, ask the real Dror agent (conversation kept across
// turns via conversationIdRef) -> speak the reply (src/api/tts.ts's priority
// chain) -> on playback end, listen again. Only the capture step differs
// between engines; handleTurn onwards is shared. Everything async is guarded by
// closedRef so a callback that resolves after stop()/unmount is a no-op —
// mirrors FlowOverlay/RecordOverlay's closedRef pattern, StrictMode-safe (the
// mount effect resets it, the cleanup sets it).
export function useVoiceChat({ patientId, showToast }: UseVoiceChatArgs): UseVoiceChat {
  // Opens on 'speaking', not 'listening': every mount starts with the greeting
  // (see openWithGreeting), and initialising to 'listening' would flash
  // "מקשיב…" for a frame before the mount effect corrected it.
  const [phase, setPhase] = useState<VoicePhase>('speaking');
  const [lastUserText, setLastUserText] = useState('');
  const [micErrorKind, setMicErrorKind] = useState<MicErrorKind | null>(null);
  const [speechUnavailable, setSpeechUnavailable] = useState(false);

  const supported = ENGINE !== null;

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  const closedRef = useRef(false);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef<ChatMsg[]>([]);
  // Kept in sync every render so the async turn handler always reads the
  // current prop, not whatever it was when the hook first mounted.
  const patientIdRef = useRef(patientId);
  patientIdRef.current = patientId;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  // -- recorded engine state (unused on the live engine) --
  //
  // Every one of these is released by releaseMedia(), which is the single
  // teardown path: W5.2's review found a Critical mic leak from a second
  // attempt overwriting streamRef and orphaning the first stream, so nothing
  // here is ever assigned without the previous value having been released
  // first, and every exit (stop, unmount, mic error, recorder error, a
  // getUserMedia that resolves after close) goes through it.
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const endpointRef = useRef<EndpointState>(createEndpointState());
  const chunksRef = useRef<Blob[]>([]);
  // Re-entrancy guard, mirroring useSessionRecorder's (W5.2 fix round 1): two
  // overlapping starts would each open their own getUserMedia stream, and the
  // second would overwrite streamRef/recorderRef — leaking the first with
  // nothing left to stop it (the mic indicator would stay on forever).
  const startingRef = useRef(false);
  // Set when a start had to be dropped because another was still in flight, so
  // the in-flight one can hand the loop back instead of leaving it dead — the
  // exact shape of React StrictMode's mount/cleanup/mount while the mic
  // permission prompt is still open.
  const restartWantedRef = useRef(false);
  // Guards the end of an utterance: the level tick and the orb tap can both
  // land in the same frame, and MediaRecorder.stop() is asynchronous.
  const stoppingRef = useRef(false);
  // True when the user ended the turn by tapping — that audio is always worth
  // transcribing, even if the analyser heard very little.
  const manualStopRef = useRef(false);
  // Identifies one mount of this hook. StrictMode mounts twice, and the first
  // run's greeting is still awaiting playback when the second begins — without
  // this the stale run would start listening UNDERNEATH the live run's
  // greeting, and the recorded engine would transcribe Dror greeting himself.
  const runIdRef = useRef(0);

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
          setMicErrorKind(classifyMicError(ev.error));
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
    if (closedRef.current || !ENGINE) return;
    // Task W5.3: everything below this line is the live (SpeechRecognition)
    // engine, untouched; devices without it take the recorded engine instead.
    if (ENGINE === 'recorded') {
      void startRecordedListening();
      return;
    }
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

  // -- recorded engine (Task W5.3) -----------------------------------------

  // Stops the level sampling and unhooks the analyser graph. Split out from
  // releaseMedia because ending an utterance has to stop SAMPLING immediately
  // (before MediaRecorder.stop() has asynchronously delivered its audio) while
  // the recorder and stream are still needed for another moment.
  function stopLevelMonitoring() {
    if (levelTimerRef.current !== undefined) {
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = undefined;
    }
    const source = sourceRef.current;
    const analyser = analyserRef.current;
    sourceRef.current = null;
    analyserRef.current = null;
    try {
      source?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      analyser?.disconnect();
    } catch {
      /* ignore */
    }
  }

  // THE teardown path for the recorded engine — every exit runs it: a normal
  // end-of-utterance, a manual tap, stop()/unmount, a mic error, a recorder
  // error, and a getUserMedia that resolves after the overlay already closed.
  // It is idempotent and never throws, so calling it defensively (e.g. at the
  // top of a fresh attempt) is always safe.
  //
  // The shared AudioContext is deliberately NOT closed: it is reused for the
  // whole session (see audioUnlock.ts) and iOS allows only a handful per page.
  function releaseMedia() {
    stopLevelMonitoring();

    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec) {
      // Cleared BEFORE stop() so a teardown can never be mistaken for the end
      // of an utterance — a stop() here must not fire onstop's transcribe path.
      rec.ondataavailable = null;
      rec.onstop = null;
      rec.onerror = null;
      try {
        if (rec.state !== 'inactive') rec.stop();
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
    stoppingRef.current = false;
    manualStopRef.current = false;
  }

  // Feeds the endpoint reducer ~10 samples a second off a WebAudio analyser.
  // The analyser is connected to nothing downstream — routing the mic to the
  // destination would put the therapist's own voice back through the speaker.
  function startLevelMonitoring(stream: MediaStream) {
    let analyser: AnalyserNode | null = null;
    let buf: Uint8Array<ArrayBuffer> | null = null;

    const ctx = getSharedAudioContext();
    if (ctx) {
      // iOS suspends the context whenever the app is backgrounded; without
      // this the analyser would report a flat zero and every turn would run to
      // the hard cap.
      resumeSharedAudioContext();
      try {
        const source = ctx.createMediaStreamSource(stream);
        const node = ctx.createAnalyser();
        node.fftSize = 1024;
        source.connect(node);
        sourceRef.current = source;
        analyserRef.current = node;
        analyser = node;
        buf = new Uint8Array(node.fftSize);
      } catch {
        stopLevelMonitoring();
        analyser = null;
        buf = null;
      }
    }

    endpointRef.current = createEndpointState();
    levelTimerRef.current = setInterval(() => {
      if (closedRef.current) return;
      // A suspended context (iOS, when the unlock in the orb tap didn't take)
      // reports a flat zero, which is NOT silence — it's no data. Treated the
      // same as having no analyser at all rather than trusted, so a turn can
      // never be ended by an analyser that isn't actually running.
      const live = !!analyser && !!buf && (!ctx || ctx.state === 'running');
      // With no level data there is nothing to endpoint on, so every sample is
      // reported as speech: the turn then ends on the user's tap or the
      // reducer's hard cap, rather than ending instantly on phantom silence.
      const rms = live ? readRms(analyser!, buf!) : DEFAULT_ENDPOINT_CONFIG.threshold;
      const res = advance(endpointRef.current, { rms, at: Date.now() });
      endpointRef.current = res.state;
      if (res.action === 'stop') finishUtterance(false);
    }, LEVEL_SAMPLE_MS);
  }

  // Ends the current utterance and hands the audio to onstop below. Guarded
  // against the tick and the orb tap racing each other, and against being
  // called when there is nothing recording.
  function finishUtterance(manual: boolean) {
    if (closedRef.current || stoppingRef.current) return;
    const rec = recorderRef.current;
    if (!rec) return;
    stoppingRef.current = true;
    manualStopRef.current = manual;
    stopLevelMonitoring();
    setPhase('thinking');

    if (rec.state === 'inactive') {
      // Nothing left to deliver (it never started, or already ended) — recover
      // rather than wait for an onstop that will not come.
      releaseMedia();
      if (wantListeningRef.current) startListening();
      return;
    }
    try {
      rec.stop();
    } catch {
      releaseMedia();
      if (!closedRef.current && wantListeningRef.current) startListening();
    }
  }

  async function startRecordedListening() {
    if (closedRef.current) return;
    if (startingRef.current) {
      // Another attempt is mid-getUserMedia. Dropping this one outright would
      // leave the loop dead (StrictMode's mount/cleanup/mount does exactly
      // this); the in-flight attempt restarts on our behalf instead.
      restartWantedRef.current = true;
      return;
    }
    startingRef.current = true;
    wantListeningRef.current = true;
    setPhase('listening');
    // Set by the branches that end this attempt in a state the user has to fix
    // (mic denied, no recorder) — a handed-off restart must not paper over
    // those by immediately trying again behind the error message.
    let failed = false;
    try {
      // Defense in depth: a fresh attempt must never overwrite live refs.
      releaseMedia();

      if (!isMicSupported()) {
        failed = true;
        wantListeningRef.current = false;
        setMicErrorKind(classifyMicError(MIC_UNSUPPORTED));
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        if (closedRef.current) return;
        failed = true;
        wantListeningRef.current = false;
        setMicErrorKind(classifyMicError(err));
        return;
      }

      // The Wave 4 pending-getUserMedia leak, on the new path: the overlay can
      // be closed (or the loop stopped) while the permission prompt is still
      // up, and this promise then resolves with a LIVE stream that nothing is
      // holding. Release it here instead of storing it.
      if (closedRef.current || !wantListeningRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const mimeType = pickRecordingMime();
      let recorder: MediaRecorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        // The mic itself was fine — this browser just can't record it, which
        // is a "no voice input here" state, not a permission problem.
        stream.getTracks().forEach((t) => t.stop());
        failed = true;
        wantListeningRef.current = false;
        setSpeechUnavailable(true);
        return;
      }

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      // Capture died mid-utterance (device pulled, mic seized by another app).
      // Tear down and surface it as a classified mic error with a retry, the
      // same as any other mic failure — restarting blindly would spin.
      recorder.onerror = (ev) => {
        if (closedRef.current) return;
        wantListeningRef.current = false;
        releaseMedia();
        setMicErrorKind(classifyMicError((ev as Event & { error?: unknown }).error));
      };

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = chunks.length > 0 ? new Blob(chunks, { type }) : null;
        // Whether the analyser actually heard someone talking — a hard-capped
        // minute of silence is not worth uploading. A manual tap overrides it:
        // the user said they were done, so we trust the audio.
        const worthSending =
          manualStopRef.current || endpointRef.current.speechMs >= DEFAULT_ENDPOINT_CONFIG.minSpeechMs;
        // Released BEFORE the transcript round-trip: the mic indicator must go
        // off the moment the utterance ends, not when the network comes back.
        releaseMedia();

        if (closedRef.current) return;
        if (!blob || blob.size === 0 || !worthSending) {
          if (wantListeningRef.current) startListening();
          return;
        }
        void handleRecordedBlob(blob);
      };

      try {
        recorder.start();
      } catch {
        releaseMedia();
        failed = true;
        wantListeningRef.current = false;
        setSpeechUnavailable(true);
        return;
      }

      startLevelMonitoring(stream);
    } finally {
      startingRef.current = false;
      if (restartWantedRef.current) {
        restartWantedRef.current = false;
        if (!closedRef.current && !failed) startListening();
      }
    }
  }

  // The recorded engine's equivalent of a final recognition result: transcribe
  // server-side, then join the SAME downstream the live engine uses.
  async function handleRecordedBlob(blob: Blob) {
    if (closedRef.current) return;
    setPhase('thinking');

    let text: string;
    try {
      text = await transcribeAudio(blob);
    } catch {
      if (closedRef.current) return;
      // One toast, then straight back to listening — a failed transcript
      // should cost the therapist a sentence, not the conversation.
      showToastRef.current?.(STT_FAILED_TOAST);
      if (wantListeningRef.current) startListening();
      return;
    }

    if (closedRef.current) return;
    const spoken = text.trim();
    if (!spoken) {
      // Silence, or nothing recognizable in it — don't bother the agent, and
      // don't say anything about it either.
      if (wantListeningRef.current) startListening();
      return;
    }
    setLastUserText(spoken);
    await handleTurn(spoken);
  }

  // Orb tap during a recorded utterance — see UseVoiceChat.endUtterance.
  function endUtterance() {
    if (closedRef.current || ENGINE !== 'recorded') return;
    if (phase !== 'listening' || !recorderRef.current) return;
    finishUtterance(true);
  }

  // Task W5.2: a mic error (unlike a closed overlay) doesn't tear down this
  // hook instance — closedRef stays false, only wantListeningRef was turned
  // off. So a retry is just clearing the error and listening again, once the
  // user has actually fixed whatever blocked it (e.g. flipped the iOS system
  // mic toggle back on) — no overlay remount/reload needed.
  //
  // Fix round 1 — re-entrancy: a rapid double-tap of the retry button fires
  // two synchronous calls before React re-renders to hide/disable it. Since
  // there's no `await` in startListening() to race against, wantListeningRef
  // (set true at its very start, and only ever false again while there's
  // genuinely no attempt in flight — see its other call sites) doubles as the
  // guard: the second tap sees it already true and bails, instead of
  // creating a second SpeechRecognition instance that orphans the first
  // (still-listening) one with nothing left to stop it.
  // Task W5.3: startingRef joins the guard for the recorded engine, whose
  // start DOES have an `await` in it (getUserMedia) — there, wantListeningRef
  // is already true for the whole in-flight attempt, so this is belt and
  // braces rather than the load-bearing check.
  function retryMic() {
    if (closedRef.current || wantListeningRef.current || startingRef.current) return;
    setMicErrorKind(null);
    startListening();
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
    restartWantedRef.current = false;

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
    // Task W5.3: the recorded engine's mic/recorder/analyser/timer, released
    // on the same close. A getUserMedia still in flight at this point is
    // covered too — closedRef makes it release its own stream on arrival.
    releaseMedia();
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

  // Dror speaks first, then listens. Capture deliberately does not start until
  // playback has finished (or failed): on the recorded engine an open mic
  // during the greeting would record Dror's own voice and send it back to be
  // transcribed. A TTS failure is not surfaced — it just means the
  // conversation starts a beat earlier.
  //
  // This also lands the greeting inside the iOS gesture's slipstream: it is the
  // first real playback after the orb tap, which is the strongest possible
  // unlock. unlockAudio() stays as belt-and-braces for the browser-voice
  // fallback path.
  async function openWithGreeting(runId: number) {
    setPhase('speaking');
    try {
      await speakHebrew(GREETING);
    } catch {
      /* best-effort — the loop matters more than the greeting */
    }
    // Closed mid-greeting (stopSpeaking already cancelled playback), or
    // superseded by a newer mount — either way this run must not start a mic.
    if (closedRef.current || runId !== runIdRef.current) return;
    startListening();
  }

  useEffect(() => {
    closedRef.current = false;
    const runId = ++runIdRef.current;
    if (supported) void openWithGreeting(runId);
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
    micErrorKind,
    speechUnavailable,
    retryMic,
    endUtterance,
    stop,
  };
}
