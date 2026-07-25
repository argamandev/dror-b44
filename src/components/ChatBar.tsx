import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Screen } from '@/state/useAppState';

// Ported verbatim from the design mock (lines 200-218). Visible on every
// screen except 'draft' (caller decides whether to render it at all).
// Send behavior is a stub this task (mirrors mock lines 692-696): it just
// pulses the home orb. Real send wiring arrives in Task 7.
interface ChatBarProps {
  screen: Screen;
  activePatientName: string | null;
  onOpenRecord: () => void;
  setHomeOrb: (s: 'idle' | 'thinking') => void;
}

const barStyle: CSSProperties = {
  position: 'absolute',
  left: 15,
  right: 15,
  bottom: 44,
  height: 105,
  zIndex: 6,
  background: '#ffffff',
  borderRadius: 26,
  boxShadow: '0 10px 30px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)',
  padding: '15px 16px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  boxSizing: 'border-box',
};

const inputStyle: CSSProperties = {
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 15,
  color: '#17171b',
  width: '100%',
  textAlign: 'right',
};

const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const leftIconsStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14 };
const iconBtn: CSSProperties = { width: 24, height: 24, cursor: 'pointer' };
const sendBtn: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: '#17171b',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

export default function ChatBar({ screen, activePatientName, onOpenRecord, setHomeOrb }: ChatBarProps) {
  const [text, setText] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const placeholder =
    screen === 'home'
      ? 'תיצור לי מסמך אינטייק על @אלון'
      : `על מה אני ו${activePatientName ?? ''} דיברנו בפגישה הקודמת?`;

  const handleSend = () => {
    setText('');
    setHomeOrb('thinking');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHomeOrb('idle'), 2600);
  };

  return (
    <div style={barStyle}>
      <input
        dir="rtl"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={inputStyle}
      />
      <div dir="ltr" style={rowStyle}>
        <div style={leftIconsStyle}>
          <div title="הוספה" style={iconBtn}>
            <svg viewBox="0 0 24 24" fill="none" width={24} height={24}>
              <path d="M12 5v14M5 12h14" stroke="#17171b" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </div>
          <div onClick={onOpenRecord} title="הקלטה" style={iconBtn}>
            <svg viewBox="0 0 24 24" fill="none" width={24} height={24}>
              <rect x={8} y={2} width={8} height={13} rx={4} stroke="#17171b" strokeWidth={2} />
              <path d="M5 11a7 7 0 0014 0" stroke="#17171b" strokeWidth={2} strokeLinecap="round" />
              <path d="M12 18v3" stroke="#17171b" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <div onClick={handleSend} title="שליחה" style={sendBtn}>
          <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
            <path
              d="M12 19V5M12 5l-6 6M12 5l6 6"
              stroke="#ffffff"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
