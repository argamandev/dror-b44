const IL_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem', day: 'numeric', month: '2-digit', year: 'numeric',
});

export function fmtDate(iso: string): string {
  const parts = IL_DATE.formatToParts(new Date(iso));
  const get = (t: string) => {
    const val = parts.find(p => p.type === t)?.value ?? '';
    return val.replace(/^0+/, '') || '0'; // strip leading zeros, but keep at least one '0'
  };
  return `${get('day')}.${get('month')}.${get('year')}`;
}

export function fmtTimer(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fullName(p: { first_name: string; last_name?: string }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}

export function displayName(u: { email: string; full_name?: string } | null | undefined): string {
  if (!u) return '';
  const name = u.full_name?.trim();
  return name || u.email.split('@')[0];
}

export function sessionCount(entries: { type: string; is_draft?: boolean }[]): number {
  return entries.filter(e => e.type === 'summary' && !e.is_draft).length;
}

export function chipLabel(t: string): string {
  return t === 'doc' ? 'מסמך רשמי' : t === 'rec' ? 'הקלטה' : 'סיכום פגישה';
}

const HEB_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export function hebrewMonth(month: number): string {
  return HEB_MONTHS[month - 1] ?? '';
}

// Patient.treatment_since holds 'YYYY-MM' — what the month input in the
// patient-context overlay produces. Anything else is treated as unset rather
// than guessed at: the profile subtitle simply drops the phrase.
export function formatSince(value: string | undefined): string {
  const m = /^(\d{4})-(\d{2})$/.exec((value ?? '').trim());
  if (!m) return '';
  const name = hebrewMonth(Number(m[2]));
  return name ? `בטיפול מאז ${name} ${m[1]}` : '';
}

export function profileSubtitle(since: string | undefined, sessions: number): string {
  const head = formatSince(since);
  const tail = `${sessions} פגישות`;
  return head ? `${head} · ${tail}` : tail;
}

// The world screen's row headline. Stored tags (written by `summarize`) win;
// entries created before that field existed fall back to the summary's own
// topics section, and anything else — documents, free-form bodies — to the
// title. A row is never blank.
const TOPICS_HEADING = 'תסמינים ונושאים';

function parseTopics(body: string): string[] {
  const idx = body.indexOf(TOPICS_HEADING);
  if (idx === -1) return [];
  const after = body.slice(idx + TOPICS_HEADING.length).replace(/^\s*:?/, '');
  const block = after.split(/\n\s*\n/)[0] ?? '';
  return block
    .split(/[,\n·]/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function topicTags(entry: { tags?: string[]; body?: string; title: string }): string[] {
  const stored = (entry.tags ?? []).map(t => t.trim()).filter(Boolean);
  if (stored.length) return stored.slice(0, 3);
  const parsed = parseTopics(entry.body ?? '');
  return parsed.length ? parsed : [entry.title];
}
