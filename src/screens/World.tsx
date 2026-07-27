import { useState, type CSSProperties } from 'react';
import type { Entry, Patient } from '@/api/data';
import { chipLabel, fmtDate, fullName, topicTags } from '@/api/format';

// Ported from the design mock's current revision (Dror.dc.html lines 127-180).
// The white cards and the three filters are gone: two tabs (פגישות / מסמכים),
// and rows that hang off a thin timeline rail on the right — a meta line over
// the session's topics (or, for documents, its title). Session recordings are
// listed under neither tab: they exist only until the summary written from
// them is saved, and are never shown to the therapist.
interface WorldProps {
  patient: Patient;
  sessionCount: number;
  entries: Entry[];
  onGoProfile: () => void;
  onOpenEntry: (entry: Entry) => void;
}

type Tab = 'sessions' | 'docs';

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
  top: 'calc(var(--top-inset) + 118px)',
  left: 0,
  right: 0,
  zIndex: 4,
  textAlign: 'center',
};

const titleStyle: CSSProperties = {
  fontFamily: "'Frank Ruhl Libre',serif",
  fontSize: 29,
  fontWeight: 500,
  color: '#17171b',
};

const subStyle: CSSProperties = {
  fontSize: 13,
  color: '#a2a4a9',
  marginTop: 2,
  letterSpacing: '0.01em',
};

const tabsRowStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--top-inset) + 188px)',
  left: 0,
  right: 0,
  zIndex: 4,
  display: 'flex',
  justifyContent: 'center',
  gap: 6,
};

const listStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--top-inset) + 238px)',
  // Clears the ChatBar: the bar's own bottom edge, plus its 105px height,
  // plus the mock's 21px gap.
  bottom: 'calc(var(--chatbar-bottom) + 126px)',
  left: 20,
  right: 20,
  zIndex: 4,
  overflowY: 'auto',
  padding: '2px 2px 16px',
};

// The timeline: a hairline rail down the right edge of every row, with the
// row's own dot sitting on it.
const rowStyle: CSSProperties = {
  position: 'relative',
  cursor: 'pointer',
  padding: '14px 20px 16px 6px',
  borderRight: '1.5px solid #e3ddd6',
  borderRadius: '0 14px 14px 0',
};

const dotStyle: CSSProperties = {
  position: 'absolute',
  top: 20,
  right: -4.5,
  width: 7.5,
  height: 7.5,
  borderRadius: '50%',
  background: '#cdc3b8',
};

const metaStyle: CSSProperties = { fontSize: 11.5, color: '#a9a49d', letterSpacing: '0.01em' };

const tagsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginTop: 8,
};

const tagStyle: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: '#2b2b30' };
const docTitleStyle: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: '#2b2b30', marginTop: 8 };

const emptyStyle: CSSProperties = {
  textAlign: 'center',
  color: '#a9a49d',
  fontSize: 13.5,
  padding: '44px 0',
};

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

const TABS: { label: string; v: Tab }[] = [
  { label: 'פגישות', v: 'sessions' },
  { label: 'מסמכים', v: 'docs' },
];

export default function World({ patient, sessionCount, entries, onGoProfile, onOpenEntry }: WorldProps) {
  const [tab, setTab] = useState<Tab>('sessions');
  const name = fullName(patient);

  const summaries = entries.filter((e) => e.type === 'summary');
  const docs = entries.filter((e) => e.type === 'doc');

  // Session position, oldest = 1, counted over non-draft summaries only — the
  // same numbering `summarize` and the document flow use, so the number on a
  // row matches the number the therapist sees everywhere else. `entries`
  // arrives newest-first (listEntries sorts '-entry_date').
  const numbering = new Map<string, number>();
  [...summaries]
    .filter((e) => !e.is_draft)
    .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime())
    .forEach((e, i) => numbering.set(e.id, i + 1));

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
        <div style={titleStyle}>{name}</div>
        <div style={subStyle}>{sessionCount} פגישות</div>
      </div>

      <div style={tabsRowStyle}>
        {TABS.map((t) => (
          <div key={t.v} onClick={() => setTab(t.v)} className="pressable" style={pillStyle(tab === t.v)}>
            {t.label}
          </div>
        ))}
      </div>

      <div className="scroll-touch" style={listStyle}>
        {tab === 'sessions' ? (
          <>
            {summaries.map((e) => (
              <div key={e.id} onClick={() => onOpenEntry(e)} className="pressable" style={rowStyle}>
                <div style={dotStyle} />
                <div dir="rtl" style={metaStyle}>
                  פגישה {numbering.get(e.id) ?? '—'} · {fmtDate(e.entry_date)}
                </div>
                <div style={tagsRowStyle}>
                  {topicTags(e).map((tag, i) => (
                    <span key={i} style={tagStyle}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {summaries.length === 0 && <div style={emptyStyle}>אין עדיין פגישות מסוכמות</div>}
          </>
        ) : (
          <>
            {docs.map((e) => (
              <div key={e.id} onClick={() => onOpenEntry(e)} className="pressable" style={rowStyle}>
                <div style={dotStyle} />
                <div dir="rtl" style={metaStyle}>
                  {chipLabel(e.type)} · {fmtDate(e.entry_date)}
                </div>
                <div style={docTitleStyle}>{e.title}</div>
              </div>
            ))}
            {docs.length === 0 && <div style={emptyStyle}>אין עדיין מסמכים בתיק</div>}
          </>
        )}
      </div>
    </>
  );
}
