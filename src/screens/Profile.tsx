import type { CSSProperties } from 'react';
import type { Patient } from '@/api/data';
import { fullName, profileSubtitle } from '@/api/format';

// Ported from the design mock's current revision (Dror.dc.html lines 76-122).
// The old rounded indigo hero and the three white pill buttons are gone: the
// screen is now the same full-bleed dawn gradient the world screen uses, a
// single back chevron, the name over a "בטיפול מאז … · N פגישות" line, a
// translucent context chip (which replaces the gear — the patient-context
// overlay is reached only from here now), and three quiet label-over-title
// rows with a leading chevron.
interface ProfileProps {
  patient: Patient;
  sessionCount: number;
  /** Non-draft documents in this patient's file — the third row's meta line. */
  docCount: number;
  onOpenContext: () => void;
  onGoHome: () => void;
  onOpenFlow: (type: 'summary' | 'doc') => void;
  onGoWorld: () => void;
}

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

const headerStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--top-inset) + 116px)',
  left: 0,
  right: 0,
  zIndex: 4,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const nameStyle: CSSProperties = {
  fontFamily: "'Frank Ruhl Libre',serif",
  fontSize: 29,
  fontWeight: 500,
  color: '#17171b',
};

const subStyle: CSSProperties = {
  fontSize: 13,
  color: '#8f8b85',
  marginTop: 2,
  letterSpacing: '0.01em',
};

const chipStyle: CSSProperties = {
  marginTop: 14,
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  background: 'rgba(255,255,255,0.72)',
  borderRadius: 999,
  padding: '7px 14px 7px 12px',
  cursor: 'pointer',
  boxShadow: '0 0 0 1px rgba(23,23,27,0.05)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
};

const chipLabelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#3a3a3f' };

// Scrolls inside itself rather than growing the screen — same bottom
// clearance the world's list uses (the ChatBar's own edge + its height + the
// mock's gap).
const rowsWrapStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--top-inset) + 248px)',
  bottom: 'calc(var(--chatbar-bottom) + 126px)',
  left: 20,
  right: 20,
  zIndex: 4,
  overflowY: 'auto',
  padding: '2px 2px 16px',
};

const rowStyle: CSSProperties = {
  position: 'relative',
  cursor: 'pointer',
  padding: '15px 22px 17px 10px',
  marginBottom: 16,
  borderRadius: '0 16px 16px 0',
};

const rowInnerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
};

const rowTextStyle: CSSProperties = { minWidth: 0 };
const rowMetaStyle: CSSProperties = { fontSize: 11.5, color: '#a9a49d', letterSpacing: '0.01em' };
const rowTitleStyle: CSSProperties = { fontSize: 15.5, fontWeight: 600, color: '#2b2b30', marginTop: 7 };

const bottomGlowStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: 225,
  zIndex: 3,
  pointerEvents: 'none',
  background:
    'radial-gradient(120% 95% at 50% 108%, rgba(169,185,249,0.48) 0%, rgba(240,228,232,0.34) 40%, rgba(246,217,196,0.20) 62%, rgba(246,217,196,0) 100%)',
};

function RowChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={15} height={15} style={{ flex: 'none' }}>
      <path d="M15 6l-6 6 6 6" stroke="#c3beb7" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Profile({
  patient,
  sessionCount,
  docCount,
  onOpenContext,
  onGoHome,
  onOpenFlow,
  onGoWorld,
}: ProfileProps) {
  const name = fullName(patient);
  const hasContext = patient.context_notes.trim().length > 0;

  return (
    <>
      <div style={heroStyle} />
      <div dir="ltr" style={topRowStyle}>
        <div />
        <div onClick={onGoHome} title="חזרה לבית" style={backBtnStyle}>
          <svg viewBox="0 0 24 24" fill="none" width={24} height={24}>
            <path d="M9 6l6 6-6 6" stroke="#17171b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div style={headerStyle}>
        <div style={nameStyle}>{name}</div>
        <div style={subStyle}>{profileSubtitle(patient.treatment_since, sessionCount)}</div>
        <div onClick={onOpenContext} className="pressable" style={chipStyle}>
          <svg viewBox="0 0 24 24" fill="none" width={14} height={14} style={{ flex: 'none' }}>
            <path
              d="M6 3.5h12a1.5 1.5 0 011.5 1.5v14a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 19V5A1.5 1.5 0 016 3.5z"
              stroke="#7d7f85"
              strokeWidth={1.8}
              strokeLinejoin="round"
            />
            <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" stroke="#7d7f85" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
          <span style={chipLabelStyle}>
            {hasContext ? 'הקשר על המטופל · מוגדר' : 'הוספת הקשר על המטופל'}
          </span>
        </div>
      </div>

      <div className="scroll-touch" style={rowsWrapStyle}>
        <div onClick={() => onOpenFlow('summary')} className="pressable" style={rowStyle}>
          <div style={rowInnerStyle}>
            <div style={rowTextStyle}>
              <div style={rowMetaStyle}>הקלטה או נקודות מהפגישה</div>
              <div style={rowTitleStyle}>יצירת סיכום פגישה</div>
            </div>
            <RowChevron />
          </div>
        </div>
        <div onClick={() => onOpenFlow('doc')} className="pressable" style={rowStyle}>
          <div style={rowInnerStyle}>
            <div style={rowTextStyle}>
              <div style={rowMetaStyle}>אישור, חוות דעת או מכתב</div>
              <div style={rowTitleStyle}>יצירת מסמך רשמי</div>
            </div>
            <RowChevron />
          </div>
        </div>
        <div onClick={onGoWorld} className="pressable" style={rowStyle}>
          <div style={rowInnerStyle}>
            <div style={rowTextStyle}>
              <div style={rowMetaStyle}>
                {sessionCount} סיכומים · {docCount} מסמכים
              </div>
              <div style={rowTitleStyle}>העולם של {name}</div>
            </div>
            <RowChevron />
          </div>
        </div>
      </div>

      <div style={bottomGlowStyle} />
    </>
  );
}
