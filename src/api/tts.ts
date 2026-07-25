import { base44 } from './base44Client';

// Text-to-speech priority chain for the voice conversation overlay (Task 11,
// controller resolution 2 — the brief's original VITE_ELEVENLABS_KEY plan was
// amended to a server-side key so the key never reaches the browser):
//   (a) the `tts` Deno function (base44/functions/tts/entry.ts), which calls
//       ElevenLabs server-side and returns base64 mp3 — played through an
//       `<audio>` element via a data: URI;
//   (b) if that function is unreachable, throws, or reports {error:'no_key'}
//       (503 — ELEVENLABS_API_KEY not configured yet), fall back to the
//       browser's built-in `speechSynthesis` with a Hebrew voice.
// Either path resolves once playback actually finishes, so callers (useVoiceChat)
// can await a single `speakHebrew()` call before moving on to the next turn.

export type TtsMode = 'eleven' | 'browser';

export interface SpeakResult {
  mode: TtsMode;
}

interface TtsFunctionResult {
  audio_b64?: string;
  mime?: string;
  error?: string;
}

// Holds whatever "stop the thing currently playing" callback is active, so
// stopSpeaking() can cancel either an <audio> element or a speechSynthesis
// utterance without the caller needing to know which mode is in flight.
let activeStop: (() => void) | null = null;

// Bumped by stopSpeaking() (and at the start of every speakHebrew() call, so
// a fresh call always supersedes a stale one). speakHebrew's async steps
// re-check their own snapshot against this counter before ever starting
// playback — this is what makes stop() effective even when it's called while
// the `tts` function's network request is still in flight (i.e. before
// there's any audio/utterance yet for `activeStop` to cancel). Without it,
// that in-flight reply would start playing right after the overlay closed.
let generation = 0;

export function stopSpeaking(): void {
  generation++;
  const stop = activeStop;
  activeStop = null;
  stop?.();
  // Belt-and-suspenders: cancel() is safe to call even if nothing is speaking,
  // and covers a speechSynthesis utterance that outlived its own activeStop
  // registration (e.g. a stray utterance from before a fast stop/replay).
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

function speakBrowser(text: string, gen: number): Promise<SpeakResult> {
  return new Promise((resolve) => {
    if (gen !== generation) {
      resolve({ mode: 'browser' });
      return;
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve({ mode: 'browser' });
      return;
    }
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text);
    const voice = synth.getVoices().find((v) => v.lang.startsWith('he'));
    if (voice) utter.voice = voice;
    utter.lang = voice?.lang ?? 'he-IL';
    utter.rate = 1.0;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (activeStop === stopThis) activeStop = null;
      resolve({ mode: 'browser' });
    };
    const stopThis = () => {
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
      finish();
    };

    utter.onend = finish;
    utter.onerror = finish;
    activeStop = stopThis;
    synth.speak(utter);
  });
}

function playAudioB64(audioB64: string, mime: string, gen: number): Promise<SpeakResult> {
  return new Promise((resolve) => {
    if (gen !== generation) {
      resolve({ mode: 'eleven' });
      return;
    }
    const audio = new Audio(`data:${mime};base64,${audioB64}`);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (activeStop === stopThis) activeStop = null;
      resolve({ mode: 'eleven' });
    };
    const stopThis = () => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      finish();
    };

    audio.onended = finish;
    // Playback failing mid-stream is treated the same as it ending — there's
    // no second fallback once we're already in the (a) branch's audio path.
    audio.onerror = finish;
    activeStop = stopThis;
    audio.play().catch(finish);
  });
}

export async function speakHebrew(text: string): Promise<SpeakResult> {
  // A fresh call always supersedes whatever generation came before it —
  // stopSpeaking() bumps this too, so a stop() that lands while the network
  // request below is still in flight is caught by the check right after it,
  // before any audio/utterance would otherwise start.
  const gen = ++generation;

  let data: TtsFunctionResult | undefined;
  try {
    const res = await base44.functions.invoke('tts', { text });
    data = res?.data as TtsFunctionResult | undefined;
  } catch {
    // Non-2xx (503 no_key / 502 tts_failed / network error) — expected until
    // ELEVENLABS_API_KEY is configured; fall through to browser voice.
    data = undefined;
  }

  if (gen !== generation) {
    // Stopped (or superseded by a newer speakHebrew call) while the network
    // request was in flight — resolve without ever starting playback.
    return { mode: 'browser' };
  }

  if (data?.audio_b64 && data.mime) {
    return playAudioB64(data.audio_b64, data.mime, gen);
  }
  return speakBrowser(text, gen);
}
