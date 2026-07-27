// Task W5.3 — iOS audio unlock, shared by the two halves of the voice loop.
//
// Founder-reported (iPhone, installed PWA): "I click on the orb, I talk to
// him, he doesn't respond at all." Half of that is the missing input engine
// (see useVoiceChat's recorded path); this module is the other half — on iOS,
// audio may only START from inside a user gesture. Both of the loop's audio
// primitives are affected:
//
//   * the <audio> element that plays Dror's reply (src/api/tts.ts). A fresh
//     `new Audio()` per reply is created long after the tap, deep inside an
//     async chain, so iOS refuses to play it — silence on the phone, fine on
//     desktop. One element, blessed by the tap and reused forever, is the fix.
//   * the AudioContext whose analyser measures the mic level for
//     end-of-utterance detection. A context created outside a gesture starts
//     suspended; a suspended analyser reports pure silence, which would leave
//     every turn running to its 60s hard cap.
//
// So both are created ONCE, inside the tap that opens the voice overlay
// (App.tsx's onOrbClick -> unlockAudio()), and reused for the whole session.
// A single shared context also stays well inside iOS's per-page AudioContext
// limit, which a per-turn context would eventually hit.

// A valid, zero-sample WAV. Playing it is a no-op the user can't hear; what
// matters is that play() is INVOKED from within the gesture, which is what
// lifts the element's playback restriction for the rest of the page's life.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

let sharedAudio: HTMLAudioElement | null = null;
let sharedContext: AudioContext | null = null;

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

/**
 * The one <audio> element every spoken reply plays through. Created on first
 * use — ideally that first use is unlockAudio() inside the orb tap, but a
 * caller that gets here first still gets a working element (it just may not
 * be allowed to autoplay on iOS).
 */
export function getSharedAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof window.Audio === 'undefined') return null;
  if (!sharedAudio) {
    try {
      sharedAudio = new window.Audio();
      sharedAudio.preload = 'auto';
    } catch {
      return null;
    }
  }
  return sharedAudio;
}

/**
 * The one AudioContext used for mic level analysis. Returns null where
 * WebAudio doesn't exist at all — callers must handle that (useVoiceChat
 * falls back to manual stop + the endpoint reducer's hard cap).
 */
export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedContext) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      sharedContext = new Ctor();
    } catch {
      return null;
    }
  }
  return sharedContext;
}

/** Resumes the shared context if the platform suspended it (iOS does this whenever the app is backgrounded). */
export function resumeSharedAudioContext(): void {
  const ctx = sharedContext;
  if (!ctx || ctx.state !== 'suspended') return;
  try {
    void ctx.resume().catch(() => {
      /* nothing to do — level monitoring degrades to the hard cap */
    });
  } catch {
    /* ignore */
  }
}

/**
 * Call this synchronously from inside a user gesture (the orb tap), before any
 * async work. Everything here is best-effort and silent: on a browser that
 * never needed unlocking it changes nothing, and on one where it fails the
 * loop still runs — just possibly without sound on iOS, which is exactly the
 * state we were in before.
 */
export function unlockAudio(): void {
  const audio = getSharedAudioElement();
  // `paused` keeps a second unlock (a re-opened overlay) from ever clobbering
  // the src of a reply that is still playing.
  if (audio && audio.paused) {
    try {
      // Muted, and paused again immediately — the element is blessed the
      // moment play() is called inside the gesture, whether or not this
      // (deliberately empty) clip ever renders a sample.
      audio.muted = true;
      audio.src = SILENT_WAV;
      const played = audio.play();
      // The pause() below aborts it; swallow the resulting AbortError so it
      // never surfaces as an unhandled rejection.
      if (played && typeof played.catch === 'function') played.catch(() => {});
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* not seekable yet — harmless, the next src assignment resets it */
      }
    } catch {
      /* ignore */
    } finally {
      audio.muted = false;
    }
  }

  // Creating the context inside the gesture is what starts it in 'running';
  // resume() covers a context that already existed and was suspended since.
  getSharedAudioContext();
  resumeSharedAudioContext();
}
