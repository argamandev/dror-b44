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
