import { describe, it, expect } from 'vitest';
import { chipLabel, fmtDate, fmtTimer, fullName, sessionCount } from './format';

describe('format helpers', () => {
  it('formats ISO date as d.m.yyyy', () => {
    expect(fmtDate('2026-07-25T10:00:00.000Z')).toBe('25.7.2026');
  });
  it('timezone-deterministic across day boundary (IDT)', () => {
    expect(fmtDate('2026-07-24T22:30:00.000Z')).toBe('25.7.2026');
  });
  it('formats seconds as mm:ss', () => {
    expect(fmtTimer(0)).toBe('00:00');
    expect(fmtTimer(65)).toBe('01:05');
    expect(fmtTimer(600)).toBe('10:00');
  });
  it('joins names, tolerating empty last name', () => {
    expect(fullName({ first_name: 'איתי', last_name: 'כהן' })).toBe('איתי כהן');
    expect(fullName({ first_name: 'איתי' })).toBe('איתי');
  });
  it('counts only non-draft summaries', () => {
    expect(sessionCount([
      { type: 'summary' }, { type: 'summary', is_draft: true },
      { type: 'doc' }, { type: 'rec' },
    ])).toBe(1);
  });
  it('labels entry chips', () => {
    expect(chipLabel('summary')).toBe('סיכום פגישה');
    expect(chipLabel('doc')).toBe('מסמך רשמי');
    expect(chipLabel('rec')).toBe('הקלטה');
  });
});
