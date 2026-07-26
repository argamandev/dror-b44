import { useState, type CSSProperties } from 'react';
import type { Entry, Patient } from '@/api/data';
import { chipLabel, fmtDate, fullName } from '@/api/format';
import { chipStyle } from '@/ui/chips';

// Ported verbatim from the design mock (lines 107-140). worldFilter is
// local UI state — it resets to 'all' naturally since World unmounts
// whenever the screen leaves 'world' (mock's goWorld reset behavior).
interface WorldProps {
  patient: Patient;
  sessionCount: number;
  entries: Entry[];
  onGoProfile: () => void;
  onOpenEntry: (entry: Entry) => void;
}

type Filter = 'all' | 'summary' | 'doc';

const heroStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  opacity: 0.35,
  background:
    'radial-gradient(108% 48% at 50% -4%, rgba(107,113,246,0.95) 0%, rgba(169,185,249,0.85) 30%, rgba(240,228,232,0.75) 55%, rgba(246,217,196,0.5) 70%, rgba(246,217,196,0) 82%), #faf8fa',
};

const topRowStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--top-inset) + 66px)',
  left: 24,
  right: 24,
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const backBtnStyle: CSSProperties = {
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const titleWrapStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--top-inset) + 116px)',
  left: 0,
  right: 0,
  zIndex: 4,
  textAlign: 'center',
};

const titleStyle: CSSProperties = {
  fontFamily: "'Frank Ruhl Libre',serif",
  fontSize: 30,
  fontWeight: 500,
  color: '#17171b',
};

const subStyle: CSSProperties = { fontSize: 13.5, color: '#9a9ca1', marginTop: 3 };

const filtersRowStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--top-inset) + 192px)',
  left: 0,
  right: 0,
  zIndex: 4,
  display: 'flex',
  justifyContent: 'center',
  gap: 8,
};

const listStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--top-inset) + 240px)',
  // Clears the ChatBar the same way the chat list does (Task W5.8): the bar's
  // own bottom edge, plus its 105px height, plus the mock's 21px gap.
  bottom: 'calc(var(--chatbar-bottom) + 126px)',
  left: 20,
  right: 20,
  zIndex: 4,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '4px 2px 10px',
};

const cardStyle: CSSProperties = {
  background: '#ffffff',
  borderRadius: 24,
  padding: '16px 20px',
  cursor: 'pointer',
  boxShadow: '0 8px 22px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
  flex: 'none',
};

const cardHeadStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 7,
};

const cardDateStyle: CSSProperties = { fontSize: 12, color: '#9a9ca1' };
const cardTitleStyle: CSSProperties = { fontSize: 16, fontWeight: 600, color: '#17171b' };
const cardSnippetStyle: CSSProperties = {
  fontSize: 13.5,
  color: '#6d6f74',
  lineHeight: 1.55,
  marginTop: 4,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const emptyStyle: CSSProperties = { textAlign: 'center', color: '#9a9ca1', fontSize: 14, padding: '40px 0' };

function pillStyle(on: boolean): CSSProperties {
  return {
    padding: '8px 18px',
    borderRadius: 999,
    fontSize: 13.5,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    ...(on
      ? { background: '#17171b', color: '#ffffff' }
      : { background: '#ffffff', color: '#6d6f74', boxShadow: '0 0 0 1px rgba(0,0,0,0.06)' }),
  };
}

const FILTERS: { label: string; v: Filter }[] = [
  { label: 'הכל', v: 'all' },
  { label: 'סיכומי פגישות', v: 'summary' },
  { label: 'מסמכים רשמיים', v: 'doc' },
];

export default function World({ patient, sessionCount, entries, onGoProfile, onOpenEntry }: WorldProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const name = fullName(patient);
  const filtered = entries.filter((e) => filter === 'all' || e.type === filter);

  return (
    <>
      <div style={heroStyle} />
      <div dir="ltr" style={topRowStyle}>
        <div />
        <div onClick={onGoProfile} title="חזרה לפרופיל" style={backBtnStyle}>
          <svg viewBox="0 0 24 24" fill="none" width={24} height={24}>
            <path d="M9 6l6 6-6 6" stroke="#17171b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div style={titleWrapStyle}>
        <div style={titleStyle}>העולם של {name}</div>
        <div style={subStyle}>{sessionCount} פגישות</div>
      </div>
      <div style={filtersRowStyle}>
        {FILTERS.map((f) => (
          <div key={f.v} onClick={() => setFilter(f.v)} className="pressable" style={pillStyle(filter === f.v)}>
            {f.label}
          </div>
        ))}
      </div>
      <div className="scroll-touch" style={listStyle}>
        {filtered.map((e) => (
          <div key={e.id} onClick={() => onOpenEntry(e)} className="pressable" style={cardStyle}>
            <div style={cardHeadStyle}>
              <span style={chipStyle(e.type)}>{chipLabel(e.type)}</span>
              <span dir="ltr" style={cardDateStyle}>
                {fmtDate(e.entry_date)}
              </span>
            </div>
            <div style={cardTitleStyle}>{e.title}</div>
            <div style={cardSnippetStyle}>{e.body.replace(/\n+/g, ' ')}</div>
          </div>
        ))}
        {filtered.length === 0 && <div style={emptyStyle}>אין עדיין פריטים מהסוג הזה</div>}
      </div>
    </>
  );
}
