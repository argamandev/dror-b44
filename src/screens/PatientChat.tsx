import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ChatMsg } from '@/api/data';
import { renderAssistantText } from '@/ui/richText';
import { useStreamedText } from '@/hooks/useStreamedText';
import TypingDots from '@/components/TypingDots';

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

// Enter animation for every row (message or thinking indicator). Applied via
// `animation` on the row itself — since rows are append-only and keyed by
// index (never remounted on re-render), it plays once on arrival and never
// replays for older messages.
const ENTER_ANIM = 'drRise 0.22s ease';

const drorRowStyle: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', animation: ENTER_ANIM };
const userRowStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-start', animation: ENTER_ANIM };

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

const thinkingRowStyle: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', animation: ENTER_ANIM };

export default function PatientChat({ title, messages, thinking, onBack }: PatientChatProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // Which message index is the newest Dror reply — the ONLY one that
  // simulated-streams; every older message (and the thinking row's own
  // orb+dots) renders/plays its enter animation once and stays put. Tracked
  // in component state rather than derived on every render so an older
  // reply that already finished streaming doesn't restart when a later
  // message is appended.
  //
  // Detecting "a new message was appended" by array length alone isn't
  // enough: this screen stays mounted (never remounts) when the therapist
  // switches from a live conversation to a DIFFERENT, already-saved chat via
  // the menu's history list — that swap is also a `messages` prop change,
  // just not an append. So a genuine append is recognized structurally: the
  // previous array's elements must all still be present, in place, at the
  // front of the new one (message objects are never recreated in place —
  // sendChat only ever spreads the old array plus one new entry). Anything
  // else (a wholesale different chat loaded) clears streaming instead of
  // simulate-streaming a historical reply that already fully "arrived".
  const [streamIndex, setStreamIndex] = useState<number | null>(null);
  const prevMessagesRef = useRef(messages);

  useEffect(() => {
    const prev = prevMessagesRef.current;
    if (messages !== prev) {
      const isAppend = messages.length > prev.length && prev.every((m, idx) => m === messages[idx]);
      if (isAppend) {
        const lastIdx = messages.length - 1;
        if (messages[lastIdx]?.role === 'dror') setStreamIndex(lastIdx);
      } else {
        setStreamIndex(null);
      }
      prevMessagesRef.current = messages;
    }
  }, [messages]);

  const streamText = streamIndex !== null ? messages[streamIndex]?.text ?? '' : '';
  const { shown: streamedShown } = useStreamedText(streamText, streamIndex !== null);

  // ChatGPT parity: smooth-scroll to the bottom on message count change, the
  // thinking indicator toggling, and every streaming reveal tick — pinning
  // the view to the bottom for the whole duration of a streamed reply.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, thinking, streamedShown.length]);

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
              <div data-selectable style={drorBubbleStyle}>
                {renderAssistantText(i === streamIndex ? streamedShown : m.text)}
              </div>
            </div>
          ) : (
            <div key={i} style={userRowStyle}>
              <div data-selectable style={userBubbleStyle}>{m.text}</div>
            </div>
          )
        )}
        {thinking && (
          <div style={thinkingRowStyle}>
            <dror-orb size="26" state="thinking" style={orbSlotStyle} />
            <TypingDots />
          </div>
        )}
      </div>
    </>
  );
}
