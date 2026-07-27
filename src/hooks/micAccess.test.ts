import { describe, it, expect, afterEach } from 'vitest';
import { classifyMicError, isMicSupported, MIC_UNSUPPORTED } from './micAccess';

// classifyMicError turns whatever getUserMedia (or the Web Speech API, whose
// error codes are hyphenated words like 'not-allowed' — classified the same
// way, via the message-sniffing fallback below) rejects/reports with into a
// small, honest set of buckets the UI can give precise Hebrew guidance for.
//
// Founder-reported bug this task fixes: on iOS, the OS-level mic toggle being
// off (הגדרות ← Chrome/Safari ← מיקרופון) rejects getUserMedia with the exact
// same NotAllowedError as an in-page refusal — there is no way to tell the
// two apart from JS. That's why 'denied' is a single bucket here; the fix is
// in micCopy.ts's guidance covering both layers, not in guessing which layer
// blocked it.
describe('classifyMicError', () => {
  describe("'denied' — NotAllowedError / PermissionDeniedError / SecurityError", () => {
    it('classifies a NotAllowedError DOMException', () => {
      expect(classifyMicError(new DOMException('Permission denied', 'NotAllowedError'))).toBe('denied');
    });

    it('classifies a PermissionDeniedError-named error (legacy Firefox)', () => {
      expect(classifyMicError({ name: 'PermissionDeniedError' })).toBe('denied');
    });

    it('classifies a SecurityError DOMException (e.g. insecure context)', () => {
      expect(classifyMicError(new DOMException('Blocked', 'SecurityError'))).toBe('denied');
    });
  });

  describe("'no-device' — NotFoundError / OverconstrainedError / DevicesNotFoundError", () => {
    it('classifies a NotFoundError DOMException', () => {
      expect(classifyMicError(new DOMException('Requested device not found', 'NotFoundError'))).toBe('no-device');
    });

    it('classifies an OverconstrainedError DOMException', () => {
      expect(classifyMicError(new DOMException('Constraints not satisfiable', 'OverconstrainedError'))).toBe(
        'no-device',
      );
    });

    it('classifies a DevicesNotFoundError-named error (older browsers)', () => {
      expect(classifyMicError({ name: 'DevicesNotFoundError' })).toBe('no-device');
    });
  });

  describe("'busy' — NotReadableError / AbortError / TrackStartError", () => {
    it('classifies a NotReadableError DOMException (mic held by another app)', () => {
      expect(classifyMicError(new DOMException('Could not start audio source', 'NotReadableError'))).toBe('busy');
    });

    it('classifies an AbortError DOMException', () => {
      expect(classifyMicError(new DOMException('Starting the device timed out', 'AbortError'))).toBe('busy');
    });

    it('classifies a TrackStartError-named error (older Chrome)', () => {
      expect(classifyMicError({ name: 'TrackStartError' })).toBe('busy');
    });
  });

  describe("'unsupported' — the MIC_UNSUPPORTED sentinel", () => {
    it('classifies the sentinel as unsupported', () => {
      expect(classifyMicError(MIC_UNSUPPORTED)).toBe('unsupported');
    });
  });

  describe("'unknown' — a present-but-unmapped name, or nothing at all to go on", () => {
    it('a present, unrelated .name is unknown — never sniffed, even if the message looks like a match', () => {
      // Binding rule (task brief): message sniffing is a fallback for when
      // .name is ABSENT only. A real .name always wins over the message.
      expect(classifyMicError({ name: 'TypeError', message: 'permission denied' })).toBe('unknown');
    });

    it('undefined is unknown', () => {
      expect(classifyMicError(undefined)).toBe('unknown');
    });

    it('null is unknown', () => {
      expect(classifyMicError(null)).toBe('unknown');
    });

    it('a bare number is unknown', () => {
      expect(classifyMicError(42)).toBe('unknown');
    });

    it('a plain object with neither name nor message is unknown', () => {
      expect(classifyMicError({})).toBe('unknown');
    });

    it('a message that matches no known keyword is unknown', () => {
      expect(classifyMicError({ message: 'something went sideways' })).toBe('unknown');
    });
  });

  describe('message sniffing — only engages when .name is absent (non-Error inputs)', () => {
    it('sniffs a plain denial string', () => {
      expect(classifyMicError('Permission was denied by the user agent')).toBe('denied');
    });

    it('sniffs a plain object message mentioning no device found', () => {
      expect(classifyMicError({ message: 'No device was found matching the constraints' })).toBe('no-device');
    });

    it('sniffs a plain object message mentioning the mic already being in use', () => {
      expect(classifyMicError({ message: 'Could not start audio source — device already in use' })).toBe('busy');
    });

    it("bridges the Web Speech API's hyphenated 'not-allowed' error code the same way", () => {
      // useVoiceChat's recognition.onerror hands classifyMicError a bare
      // string ('not-allowed' / 'audio-capture'), not a DOMException — it
      // must still resolve sensibly via the message path.
      expect(classifyMicError('not-allowed')).toBe('denied');
    });

    it("the Web Speech API's 'audio-capture' code is genuinely ambiguous (no-device vs busy vs OS-level denial) — honestly unknown rather than guessed", () => {
      expect(classifyMicError('audio-capture')).toBe('unknown');
    });
  });
});

describe('isMicSupported', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalDescriptor);
    } else {
      delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  it('is true when navigator.mediaDevices.getUserMedia exists', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: { getUserMedia: () => Promise.resolve() } },
      configurable: true,
    });
    expect(isMicSupported()).toBe(true);
  });

  it('is false when mediaDevices exists but getUserMedia does not', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: {} },
      configurable: true,
    });
    expect(isMicSupported()).toBe(false);
  });

  it('is false when mediaDevices itself is missing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });
    expect(isMicSupported()).toBe(false);
  });
});
