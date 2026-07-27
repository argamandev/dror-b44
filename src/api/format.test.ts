import { describe, it, expect } from 'vitest';
import {
  chipLabel,
  displayName,
  fmtDate,
  fmtTimer,
  formatSince,
  fullName,
  profileSubtitle,
  sessionCount,
  topicTags,
} from './format';

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
  it('resolves a display name, falling back to the email local part', () => {
    expect(displayName({ email: 'dana@example.com', full_name: 'ד"ר דנה לוי' })).toBe('ד"ר דנה לוי');
    expect(displayName({ email: 'dana@example.com' })).toBe('dana');
    expect(displayName({ email: 'dana@example.com', full_name: '   ' })).toBe('dana');
    expect(displayName(null)).toBe('');
  });
});

// The patient profile's subtitle (mock: "בטיפול מאז ינואר 2025 · 18 פגישות").
// treatment_since is what the patient-context overlay's month input stores.
describe('formatSince', () => {
  it('formats a YYYY-MM value as a Hebrew month and year', () => {
    expect(formatSince('2026-07')).toBe('בטיפול מאז יולי 2026');
  });
  it('returns empty for an unset value', () => {
    expect(formatSince('')).toBe('');
    expect(formatSince(undefined)).toBe('');
  });
  it('returns empty for a malformed value rather than inventing a month', () => {
    expect(formatSince('2026')).toBe('');
    expect(formatSince('2026-13')).toBe('');
    expect(formatSince('2026-00')).toBe('');
    expect(formatSince('nonsense')).toBe('');
  });
});

describe('profileSubtitle', () => {
  it('joins the start month and the session count', () => {
    expect(profileSubtitle('2026-07', 3)).toBe('בטיפול מאז יולי 2026 · 3 פגישות');
  });
  it('falls back to the session count alone when no start month is set', () => {
    expect(profileSubtitle('', 3)).toBe('3 פגישות');
    expect(profileSubtitle(undefined, 0)).toBe('0 פגישות');
  });
});

// The world screen's row headline.
describe('topicTags', () => {
  it('prefers the stored tags', () => {
    expect(topicTags({ tags: ['לחץ בעבודה', 'שינה'], body: '', title: 'סיכום' })).toEqual([
      'לחץ בעבודה',
      'שינה',
    ]);
  });
  it('caps stored tags at three', () => {
    expect(topicTags({ tags: ['א', 'ב', 'ג', 'ד'], title: 'ת' })).toEqual(['א', 'ב', 'ג']);
  });
  it('ignores blank stored tags and falls through to the body', () => {
    const body = 'תסמינים ונושאים:\nחרדה חברתית, טריגרים';
    expect(topicTags({ tags: ['  ', ''], body, title: 'ת' })).toEqual(['חרדה חברתית', 'טריגרים']);
  });
  it('parses the topics section out of a summary body when there are no tags', () => {
    const body =
      'רשומה רפואית\nפגישה שלישית.\n\nרשומה אישית\nתוכן הפגישה:\nדיברנו על העבודה.\n\nתסמינים ונושאים:\nלחץ בעבודה, שינה, גבולות\n\nהמשך טיפול:\nלהמשיך.';
    expect(topicTags({ body, title: 'סיכום פגישה 3' })).toEqual(['לחץ בעבודה', 'שינה', 'גבולות']);
  });
  it('caps a parsed section at three topics', () => {
    const body = 'תסמינים ונושאים:\nא, ב, ג, ד, ה';
    expect(topicTags({ body, title: 'ת' })).toEqual(['א', 'ב', 'ג']);
  });
  it('falls back to the title when there is nothing to parse', () => {
    expect(topicTags({ body: 'טקסט חופשי', title: 'מכתב לצבא — אבנר' })).toEqual([
      'מכתב לצבא — אבנר',
    ]);
  });
  it('falls back to the title when the section exists but is empty', () => {
    expect(topicTags({ body: 'תסמינים ונושאים:\n\nהמשך טיפול:\nלהמשיך.', title: 'סיכום' })).toEqual(
      ['סיכום']
    );
  });
});
