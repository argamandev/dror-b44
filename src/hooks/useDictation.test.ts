import { describe, it, expect } from 'vitest';
import { mergeDictationText } from './useDictation';

// Pure merge behind useDictation's live-engine interim/final handling and the
// recorded-engine's post-transcription append. Written first (red), before
// useDictation.ts existed — per the task brief's TDD requirement for the one
// piece of this task with real branching (append semantics + separator
// handling). No DOM, no timers, no SpeechRecognition/MediaRecorder mocking —
// those live entirely in the hook and are exercised manually per the brief
// ("don't test-theater the DOM").
//
// Contract under test: `anchor` is the input's own text (whatever the user
// already typed, or the last committed dictation chunk); `chunk` is a
// newly-arrived interim/final piece. The result is what the input should show
// next — joined with exactly one separating space unless one side already
// supplies boundary whitespace.
describe('mergeDictationText', () => {
  it('returns the anchor unchanged when the chunk is empty', () => {
    expect(mergeDictationText('שלום', '')).toBe('שלום');
  });

  it('returns the chunk unchanged when the anchor is empty (dictating into an empty input)', () => {
    expect(mergeDictationText('', 'שלום עולם')).toBe('שלום עולם');
  });

  it('both anchor and chunk empty stays empty', () => {
    expect(mergeDictationText('', '')).toBe('');
  });

  it('joins with a single separating space when neither side has boundary whitespace', () => {
    expect(mergeDictationText('כתבתי כבר משהו', 'ועכשיו ממשיך')).toBe('כתבתי כבר משהו ועכשיו ממשיך');
  });

  it('does not double the space when the anchor already ends in whitespace', () => {
    expect(mergeDictationText('שלום ', 'עולם')).toBe('שלום עולם');
  });

  it('does not double the space when the chunk already starts with whitespace', () => {
    expect(mergeDictationText('שלום', ' עולם')).toBe('שלום עולם');
  });

  it('appends onto whatever the user already typed (brief requirement 1)', () => {
    const typed = 'המטופל דיווח על';
    expect(mergeDictationText(typed, 'שיפור משמעותי')).toBe('המטופל דיווח על שיפור משמעותי');
  });

  it('commits a second final chunk on top of a first (e.g. across a Chrome silence-restart)', () => {
    const afterFirstFinal = mergeDictationText('', 'המשפט הראשון.');
    const afterSecondFinal = mergeDictationText(afterFirstFinal, 'המשפט השני.');
    expect(afterSecondFinal).toBe('המשפט הראשון. המשפט השני.');
  });

  it('is pure — a live interim re-derived from the same anchor never mutates that anchor', () => {
    const anchor = 'התחלתי לדבר';
    const interim1 = mergeDictationText(anchor, 'על');
    const interim2 = mergeDictationText(anchor, 'על המצב שלי');
    expect(interim1).toBe('התחלתי לדבר על');
    expect(interim2).toBe('התחלתי לדבר על המצב שלי');
    expect(anchor).toBe('התחלתי לדבר');
  });

  // Fix round 1, Critical 2: typing while dictation is active used to vanish
  // within a few hundred ms, because the anchor was only ever updated by the
  // engine (a committed final chunk) and never by the user's own keystrokes —
  // so the next interim/final overwrote the input from the STALE anchor,
  // erasing whatever had just been typed. The fix is useDictation.ts's new
  // syncAnchor(): ChatBar's onChange calls it with the input's current value
  // while dictation is active, re-anchoring onto the manual edit. syncAnchor
  // itself is a bare ref assignment (nothing to unit-test in isolation), so
  // what's tested here is the CONTRACT it relies on: once the anchor has been
  // resynced to include a manual edit, mergeDictationText must build the next
  // chunk on top of exactly that — not lose it, not double it.
  describe('anchor re-sync after a manual edit (fix round 1, Critical 2)', () => {
    it('a chunk arriving after a resync builds on the resynced anchor, not the pre-edit one', () => {
      const afterDictation = mergeDictationText('', 'המטופל דיווח על');
      // Simulates the user typing more while dictation was still active —
      // ChatBar's onChange would call dictation.syncAnchor(afterManualEdit).
      const afterManualEdit = `${afterDictation} כאב ראש קל`;
      const afterNextChunk = mergeDictationText(afterManualEdit, 'שנמשך יומיים');
      expect(afterNextChunk).toBe('המטופל דיווח על כאב ראש קל שנמשך יומיים');
    });

    it('a resync to an empty input (the user cleared everything) still merges cleanly', () => {
      expect(mergeDictationText('', 'התחלה חדשה')).toBe('התחלה חדשה');
    });

    it('a resync that itself ends in whitespace does not get double-spaced by the next chunk', () => {
      expect(mergeDictationText('טקסט שהמשתמש הקליד ', 'המשך בהכתבה')).toBe('טקסט שהמשתמש הקליד המשך בהכתבה');
    });
  });
});
