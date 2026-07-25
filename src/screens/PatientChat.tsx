import { useEffect, useRef, type CSSProperties } from 'react';
import type { ChatMsg } from '@/api/data';
import { renderAssistantText } from '@/ui/richText';

// Ported verbatim from the design mock (lines 142-171, "PATIENT CHAT"), with the
// bubble/row styles from the mock's renderVals (lines 677-683). Used for both a
// patient conversation (title "שיחה על <name>") and a general one ("שיחה עם דרור").
interface PatientChatProps {
  title: string;
  messages: ChatMsg[];
  thinking: boolean;
  onBack: () => void;
}

const bgStyle: CSSProperties = { position: 'absolute', inset: 0, zIndex: 0, background: '#fbfafb' };

const glowStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 210,
  zIndex: 1,
  background:
    'radial-gradient(130% 120% at 50% -50%, rgba(107,113,246,0.5) 0%, rgba(169,185,249,0.42) 38%, rgba(240,228,232,0.3) 62%, rgba(246,217,196,0.16) 80%, rgba(246,217,196,0) 100%)',
};

const topRowStyle: CSSProperties = {
  position: 'absolute',
  top: 66,
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
  top: 74,
  left: 70,
  right: 70,
  textAlign: 'center',
  zIndex: 4,
};

const titleStyle: CSSProperties = {
  fontFamily: "'Frank Ruhl Libre',serif",
  fontSize: 20,
  fontWeight: 500,
  color: '#17171b',
};

const listStyle: CSSProperties = {
  position: 'absolute',
  top: 130,
  bottom: 168,
  left: 20,
  right: 20,
  zIndex: 4,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: '8px 4px',
};

const drorRowStyle: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start' };
const userRowStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-start' };

const drorBubbleStyle: CSSProperties = {
  fontSize: 14.5,
  lineHeight: 1.7,
  color: '#2b2b30',
  maxWidth: '86%',
  whiteSpace: 'pre-wrap',
};

const userBubbleStyle: CSSProperties = {
  background: '#17171b',
  color: '#ffffff',
  fontSize: 14.5,
  lineHeight: 1.6,
  padding: '11px 16px',
  borderRadius: '20px 20px 20px 6px',
  maxWidth: '78%',
  whiteSpace: 'pre-wrap',
};

const orbSlotStyle: CSSProperties = { flex: 'none', marginTop: 2 };

const thinkingRowStyle: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start' };
const thinkingTextStyle: CSSProperties = { fontSize: 14, color: '#9a9ca1', paddingTop: 4 };

export default function PatientChat({ title, messages, thinking, onBack }: PatientChatProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest message / thinking row in view as the conversation grows.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  return (
    <>
      <div style={bgStyle} />
      <div style={glowStyle} />
      <div dir="ltr" style={topRowStyle}>
        <div style={{ width: 44 }} />
        <div onClick={onBack} title="חזרה לפרופיל" style={backBtnStyle}>
          <svg viewBox="0 0 24 24" fill="none" width={24} height={24}>
            <path d="M9 6l6 6-6 6" stroke="#17171b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div style={titleWrapStyle}>
        <div style={titleStyle}>{title}</div>
      </div>
      <div ref={listRef} style={listStyle}>
        {messages.map((m, i) =>
          m.role === 'dror' ? (
            <div key={i} style={drorRowStyle}>
              <dror-orb size="26" state="idle" style={orbSlotStyle} />
              <div style={drorBubbleStyle}>{renderAssistantText(m.text)}</div>
            </div>
          ) : (
            <div key={i} style={userRowStyle}>
              <div style={userBubbleStyle}>{m.text}</div>
            </div>
          )
        )}
        {thinking && (
          <div style={thinkingRowStyle}>
            <dror-orb size="26" state="thinking" style={orbSlotStyle} />
            <div style={thinkingTextStyle}>דרור חושב…</div>
          </div>
        )}
      </div>
    </>
  );
}
