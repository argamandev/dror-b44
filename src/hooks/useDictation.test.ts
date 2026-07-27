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
});
