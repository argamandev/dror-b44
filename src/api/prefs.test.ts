import { describe, it, expect } from 'vitest';
import { GUIDELINES_MAX, SUMMARY_STYLES, normalizePrefs } from './prefs';

// normalizePrefs is the only branchy logic in src/api/prefs.ts (loadMyPrefs/
// saveMyPrefs are thin network wrappers, not worth mocking) — spec first,
// per the task brief. It must tolerate whatever a raw entity record or a
// half-typed form state throws at it and always return a fully-populated,
// safe-to-store object.
describe('normalizePrefs', () => {
  it('returns a fully-populated object of empty strings for missing input', () => {
    expect(normalizePrefs(undefined)).toEqual({
      display_name: '',
      professional_title: '',
      guidelines: '',
      summary_style: '',
    });
    expect(normalizePrefs(null)).toEqual({
      display_name: '',
      professional_title: '',
      guidelines: '',
      summary_style: '',
    });
    expect(normalizePrefs({})).toEqual({
      display_name: '',
      professional_title: '',
      guidelines: '',
      summary_style: '',
    });
  });

  it('trims every string field', () => {
    const out = normalizePrefs({
      display_name: '  ד"ר דנה לוי  ',
      professional_title: ' פסיכולוגית קלינית ',
      guidelines: '  לכתוב בלשון נקבה  ',
      summary_style: ' מאוזן ',
    });
    expect(out.display_name).toBe('ד"ר דנה לוי');
    expect(out.professional_title).toBe('פסיכולוגית קלינית');
    expect(out.guidelines).toBe('לכתוב בלשון נקבה');
    expect(out.summary_style).toBe('מאוזן');
  });

  it('coerces non-string values on any field to an empty string', () => {
    const out = normalizePrefs({
      display_name: 42 as unknown as string,
      professional_title: true as unknown as string,
      guidelines: {} as unknown as string,
      summary_style: [] as unknown as string,
    });
    expect(out).toEqual({ display_name: '', professional_title: '', guidelines: '', summary_style: '' });
  });

  it('accepts each of the three allowed summary_style values verbatim', () => {
    for (const style of SUMMARY_STYLES) {
      expect(normalizePrefs({ summary_style: style }).summary_style).toBe(style);
    }
  });

  it('falls back summary_style to empty string for anything not exactly one of the three values', () => {
    expect(normalizePrefs({ summary_style: 'קצר' }).summary_style).toBe('');
    expect(normalizePrefs({ summary_style: 'תמציתי מאוד' }).summary_style).toBe('');
    expect(normalizePrefs({ summary_style: '' }).summary_style).toBe('');
  });

  it('passes guidelines of exactly GUIDELINES_MAX chars through unchanged', () => {
    const text = 'א'.repeat(GUIDELINES_MAX);
    expect(normalizePrefs({ guidelines: text }).guidelines).toBe(text);
    expect(normalizePrefs({ guidelines: text }).guidelines.length).toBe(GUIDELINES_MAX);
  });

  it('caps guidelines longer than GUIDELINES_MAX chars, keeping the first GUIDELINES_MAX', () => {
    const text = 'ב'.repeat(GUIDELINES_MAX + 500);
    const out = normalizePrefs({ guidelines: text });
    expect(out.guidelines.length).toBe(GUIDELINES_MAX);
    expect(out.guidelines).toBe('ב'.repeat(GUIDELINES_MAX));
  });

  it('caps guidelines AFTER trimming, so trailing whitespace does not eat into the cap unnecessarily', () => {
    const text = 'ג'.repeat(GUIDELINES_MAX) + '   ';
    expect(normalizePrefs({ guidelines: text }).guidelines).toBe('ג'.repeat(GUIDELINES_MAX));
  });
});
