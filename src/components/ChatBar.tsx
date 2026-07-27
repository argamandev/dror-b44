import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Screen } from '@/state/useAppState';
import { useDictation } from '@/hooks/useDictation';

// Ported verbatim from the design mock (lines 200-218). Visible on every
// screen except 'draft' (caller decides whether to render it at all).
// Send dispatches to the real Dror agent via `onSend` (state.sendChat); the
// screen tells us whether this is a home (general) send or a patient send.
interface ChatBarProps {
  screen: Screen;
  activePatientName: string | null;
  onOpenRecord: () => void;
  onSend: (text: string, fromHome: boolean) => void;
  /** True while a reply is in flight — blocks new sends but keeps the input editable. */
  disabled?: boolean;
  /** App-level compact toast — used for dictation failures (Task W5.4: mic errors, transcription failures). */
  showToast: (text: string) => void;
  /**
   * True whenever ANY overlay is open (record, voice, search, menu,
   * settings/patient-context, flow, app settings) — ChatBar stays mounted
   * underneath every one of them, so this is what stops an active dictation
   * from running invisibly behind a full-screen overlay (fix round 1,
   * Important 3). Not scoped to individual overlays: `state.overlay !== null`
   * covers every entry uniformly, with no per-overlay special-casing.
   */
  overlayOpen: boolean;
}

const barStyle: CSSProperties = {
  position: 'absolute',
  left: 15,
  right: 15,
  // --chatbar-bottom (tokens.css) is max(44px, safe-area-inset-bottom): the
  // mock's 44px margin normally, widened to the home-indicator inset if that
  // is ever larger, so the bar never floats over the indicator (Task W5.8).
  // Grows by --kb-inset (useKeyboardInset.ts) on top of that so the iOS
  // on-screen keyboard — which doesn't shrink the layout viewport — never
  // covers the bar; the transition below makes it glide with the keyboard
  // instead of jumping.
  bottom: 'calc(var(--chatbar-bottom) + var(--kb-inset, 0px))',
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
  transition: 'bottom 0.2s ease',
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

// Task W5.4: while dictation is listening/recording, the mic button pulses
// in accent indigo — reuses base.css's existing drBreathe keyframe (already
// used for VoiceOverlay's orb halo) rather than introducing a new animation.
const micBtnActive: CSSProperties = { ...iconBtn, animation: 'drBreathe 1.6s ease-in-out infinite' };
// Transcription in flight (recorded engine only) — a subtle busy state; there
// is nothing left to toggle until it resolves.
const micBtnPending: CSSProperties = { ...iconBtn, opacity: 0.5, pointerEvents: 'none' };
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

const sendBtnDisabled: CSSProperties = {
  ...sendBtn,
  opacity: 0.4,
  cursor: 'default',
  pointerEvents: 'none',
};

export default function ChatBar({
  screen,
  activePatientName,
  onOpenRecord,
  onSend,
  disabled = false,
  showToast,
  overlayOpen,
}: ChatBarProps) {
  const [text, setText] = useState('');
  // Read by useDictation's async callbacks (a recognition event, a
  // transcription round-trip) so they always append onto the CURRENT input
  // value rather than whatever it was when dictation started.
  const textRef = useRef(text);
  textRef.current = text;

  // Task W5.4 — dictation into this input, separate from the orb's voice
  // conversation (VoiceOverlay/useVoiceChat, opened from Home's orb only).
  const dictation = useDictation({
    getValue: () => textRef.current,
    setValue: setText,
    onError: showToast,
  });

  // Fix round 1 (Important 3): any overlay opening (record/voice/search/
  // menu/settings/patient-context/flow — everything that shares `state.overlay`)
  // must not leave this mic listening invisibly underneath it. 'drop' — not
  // the default 'commit' — since the user didn't consciously end their own
  // dictation; nothing captured so far should surface later either.
  useEffect(() => {
    if (overlayOpen) dictation.stop('drop');
    // dictation.stop is a fresh function every render (not memoized) — only
    // react to overlayOpen actually changing, not to every ChatBar re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayOpen]);

  const placeholder = dictation.pending
    ? 'מתמלל…'
    : screen === 'home'
      ? 'תיצור לי מסמך אינטייק על @אלון'
      : activePatientName
        ? `על מה אני ו${activePatientName} דיברנו בפגישה הקודמת?`
        : 'כתוב לדרור…';

  const handleChange = (next: string) => {
    setText(next);
    // Fix round 1 (Critical 2): re-anchor onto the manual edit so the next
    // interim/final builds on top of it instead of clobbering it.
    if (dictation.active) dictation.syncAnchor(next);
  };

  const handleSend = () => {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    // Fix round 1 (Critical 1): 'drop', not the default 'commit' — a send is
    // not the user consciously ending their own dictation, so nothing
    // captured up to now (a trailing live result, a still-in-flight
    // transcription) may land in the input after this message is gone.
    dictation.stop('drop');
    onSend(trimmed, screen === 'home');
    setText('');
  };

  return (
    <div style={barStyle}>
      <input
        dir="rtl"
        placeholder={placeholder}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
          }
        }}
        style={inputStyle}
      />
      <div dir="ltr" style={rowStyle}>
        <div style={leftIconsStyle}>
          <div onClick={onOpenRecord} title="הוספה" className="pressable" style={iconBtn}>
            <svg viewBox="0 0 24 24" fill="none" width={24} height={24}>
              <path d="M12 5v14M5 12h14" stroke="#17171b" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </div>
          {/* Task W5.4: dictation into the input — tap speaks Hebrew into the
              text, tap again stops. Separate from the orb's voice
              conversation (Home's center orb → VoiceOverlay), which this
              button never opens. */}
          <div
            onClick={dictation.toggle}
            title={dictation.active ? 'עצירת הכתבה' : 'הכתבה קולית'}
            className="pressable"
            style={dictation.pending ? micBtnPending : dictation.active ? micBtnActive : iconBtn}
          >
            <svg viewBox="0 0 24 24" fill="none" width={24} height={24}>
              <rect
                x={8}
                y={2}
                width={8}
                height={13}
                rx={4}
                stroke={dictation.active ? '#6B71F6' : '#17171b'}
                strokeWidth={2}
              />
              <path
                d="M5 11a7 7 0 0014 0"
                stroke={dictation.active ? '#6B71F6' : '#17171b'}
                strokeWidth={2}
                strokeLinecap="round"
              />
              <path
                d="M12 18v3"
                stroke={dictation.active ? '#6B71F6' : '#17171b'}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
        <div
          onClick={disabled ? undefined : handleSend}
          title="שליחה"
          aria-disabled={disabled}
          className="pressable"
          style={disabled ? sendBtnDisabled : sendBtn}
        >
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
