import type { CSSProperties } from 'react';
import type { Patient } from '@/api/data';
import { fullName } from '@/api/format';

// Ported from the design mock (lines 74-105), restyled per the Dawn Break v2
// diff: shorter indigo hero, icons moved into a right-side vertical column
// (home above settings), dark title/subtitle instead of white-on-hero, and a
// new pointer-events:none bottom glow layered above the action buttons.
interface ProfileProps {
  patient: Patient;
  sessionCount: number;
  onOpenSettings: () => void;
  onGoHome: () => void;
  onOpenFlow: (type: 'summary' | 'doc') => void;
  onGoWorld: () => void;
}

const heroStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 186,
  zIndex: 0,
  borderRadius: '0 0 44px 44px',
  background:
    'radial-gradient(170% 150% at 50% -42%, rgba(107,113,246,0.96) 0%, rgba(169,185,249,0.88) 34%, rgba(240,228,232,0.78) 58%, rgba(246,217,196,0.62) 80%, rgba(246,217,196,0.42) 100%), #faf8fa',
  boxShadow: '0 14px 34px -18px rgba(107,113,246,0.35)',
};

// Right-side vertical icon column (v2 diff) — replaces the old left/right
// justify-content:space-between row.
const iconColStyle: CSSProperties = {
  position: 'absolute',
  top: 58,
  right: 24,
  zIndex: 5,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
};

const homeBtnStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const gearBtnStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const nameWrapStyle: CSSProperties = {
  position: 'absolute',
  top: 92,
  left: 0,
  right: 0,
  zIndex: 4,
  textAlign: 'center',
};

const nameStyle: CSSProperties = {
  fontFamily: "'Frank Ruhl Libre',serif",
  fontSize: 38,
  fontWeight: 500,
  color: '#17171b',
  lineHeight: 1.1,
};

const subStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  color: '#17171b',
  marginTop: 4,
};

const actionsWrapStyle: CSSProperties = {
  position: 'absolute',
  top: 220,
  left: 24,
  right: 24,
  zIndex: 4,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

// New bottom glow (v2 diff) — sits above everything, but pointer-events:none
// so it never blocks the action buttons underneath it.
const bottomGlowStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: 225,
  zIndex: 5,
  pointerEvents: 'none',
  background:
    'radial-gradient(120% 95% at 50% 108%, rgba(169,185,249,0.48) 0%, rgba(240,228,232,0.34) 40%, rgba(246,217,196,0.20) 62%, rgba(246,217,196,0) 100%)',
};

const actionBtnStyle: CSSProperties = {
  background: '#ffffff',
  borderRadius: 999,
  height: 64,
  padding: '0 26px',
  display: 'flex',
  alignItems: 'center',
  gap: 15,
  cursor: 'pointer',
  boxShadow: '0 10px 26px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
};

const actionLabelStyle: CSSProperties = { fontSize: 17, fontWeight: 600, color: '#17171b' };

export default function Profile({
  patient,
  sessionCount,
  onOpenSettings,
  onGoHome,
  onOpenFlow,
  onGoWorld,
}: ProfileProps) {
  const name = fullName(patient);

  return (
    <>
      <div style={heroStyle} />
      <div style={iconColStyle}>
        <div onClick={onGoHome} title="חזרה לבית" style={homeBtnStyle}>
          <svg viewBox="0 0 24 24" fill="none" width={23} height={23}>
            <path
              d="M4 10.5L12 4l8 6.5V20h-5.5v-5h-5v5H4V10.5z"
              stroke="#17171b"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div onClick={onOpenSettings} style={gearBtnStyle}>
          <svg viewBox="0 0 24 24" fill="none" width={25} height={25}>
            <path d="M12 8.6a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8z" stroke="#17171b" strokeWidth={2} />
            <path
              d="M19.4 12a7.4 7.4 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 00-2.1-1.2L14.5 3h-4l-.4 2.7a7.5 7.5 0 00-2.1 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 000 2.4l-2 1.5 2 3.4 2.3-1c.64.5 1.35.9 2.1 1.2l.4 2.7h4l.4-2.7a7.5 7.5 0 002.1-1.2l2.3 1 2-3.4-2-1.5c.07-.4.1-.8.1-1.2z"
              stroke="#17171b"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      <div style={nameWrapStyle}>
        <div style={nameStyle}>{name}</div>
        <div style={subStyle}>{sessionCount} פגישות</div>
      </div>
      <div style={actionsWrapStyle}>
        <div onClick={() => onOpenFlow('summary')} style={actionBtnStyle}>
          <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
            <path
              d="M4 20l1.2-4.2L16.6 4.4a2 2 0 012.9 0l0.1 0.1a2 2 0 010 2.9L8.2 18.8 4 20z"
              stroke="#17171b"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            <path d="M14.5 6.5l3 3" stroke="#17171b" strokeWidth={2} />
          </svg>
          <span style={actionLabelStyle}>יצירת סיכום פגישה</span>
        </div>
        <div onClick={() => onOpenFlow('doc')} style={actionBtnStyle}>
          <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
            <path d="M6 2.8h8l4 4v14.4H6V2.8z" stroke="#17171b" strokeWidth={2} strokeLinejoin="round" />
            <path d="M14 2.8v4h4" stroke="#17171b" strokeWidth={2} strokeLinejoin="round" />
            <path d="M9 12h6M9 16h6" stroke="#17171b" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span style={actionLabelStyle}>יצירת מסמך רשמי</span>
        </div>
        <div onClick={onGoWorld} style={actionBtnStyle}>
          <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
            <circle cx={12} cy={8} r={4} stroke="#17171b" strokeWidth={2} />
            <path
              d="M4.5 20.5c1.3-3.4 4.1-5 7.5-5s6.2 1.6 7.5 5"
              stroke="#17171b"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
          <span style={actionLabelStyle}>העולם של {name}</span>
        </div>
      </div>
      <div style={bottomGlowStyle} />
    </>
  );
}
