import { useEffect, type CSSProperties } from 'react';
import type { Chat } from '@/api/data';

// Task W5.9 — the side menu rebuilt in the STRUCTURAL aesthetic of ChatGPT's
// iOS drawer, translated to Dror (Dawn Break palette, Hebrew, RTL). What was
// borrowed is the shape, not the colors:
//
//   wordmark + circular search button   ->  "דרור" + the existing SearchOverlay
//   icon nav rows                       ->  שיחה חדשה / המטופלים שלי
//   "Recents" + plain-text list         ->  אחרונות + the Chat entities in state
//   pinned pill CTA + circular gear     ->  accent "שיחה חדשה" + AppSettingsOverlay
//   app pushed aside, rounded + dimmed  ->  App.tsx's push layer (mirrored: the
//                                           panel enters from the RIGHT, the app
//                                           peeks on the LEFT)
//
// The drawer stays MOUNTED and animates off `open` with transform/opacity
// transitions instead of the drFade/drSlideIn keyframes: it is paired with a
// push effect on the whole app content layer that has to run in reverse on
// close too, and a mount-only keyframe would leave the drawer vanishing
// instantly while the app glided back. Same 0.28s ease as drSlideIn, so the
// motion language is unchanged — only its direction is now reversible.
//
// Task W5.8 rules hold: the panel's BACKGROUND spans the full physical height
// (top:0 -> bottom:0) so it paints under the status bar and the home
// indicator; the safe areas are spent on the CONTENT via the inset tokens,
// and env() never appears here.

/** Panel width as a % of the app column — the remainder is the app peek. */
export const DRAWER_WIDTH_PCT = 86;

/** Open/close duration, matching the drSlideIn keyframe this replaces. */
const MOTION = '0.28s ease';

const INK = '#17171b';

// Warm ivory back-layer with a whisper of the dawn glow at its top corner —
// the same gradient family every screen opens with, at a fraction of the
// strength, so the drawer reads as the surface BENEATH the app rather than a
// foreign panel. (chromeColor.ts approximates this top tone for the status bar.)
const PANEL_BG =
  'radial-gradient(118% 58% at 82% -8%, rgba(107,113,246,0.20) 0%, rgba(169,185,249,0.15) 32%, rgba(240,228,232,0.12) 56%, rgba(246,217,196,0.07) 76%, rgba(246,217,196,0) 90%), #FBF6EF';

interface MenuDrawerProps {
  open: boolean;
  chats: Chat[];
  onClose: () => void;
  onRefreshChats: () => Promise<void>;
  onNewChat: () => void;
  /** SearchOverlay — the app's patient directory (search / open / create). */
  onOpenSearch: () => void;
  onOpenChat: (chat: Chat) => void;
  onOpenSettings: () => void;
}

const wrapStyle = (open: boolean): CSSProperties => ({
  position: 'absolute',
  inset: 0,
  zIndex: 20,
  // Mounted at all times so the panel can slide BOTH ways; inert when closed.
  pointerEvents: open ? 'auto' : 'none',
});

// Dims the peeking app (the panel itself is opaque and painted on top, so it
// stays undimmed — ChatGPT's exact relationship) and is the tap-to-close target.
const scrimStyle = (open: boolean): CSSProperties => ({
  position: 'absolute',
  inset: 0,
  background: 'rgba(23,23,27,0.42)',
  opacity: open ? 1 : 0,
  transition: `opacity ${MOTION}`,
});

const panelStyle = (open: boolean): CSSProperties => ({
  position: 'absolute',
  top: 0,
  bottom: 0,
  right: 0,
  width: `${DRAWER_WIDTH_PCT}%`,
  background: PANEL_BG,
  // The shadow fades with the panel rather than being switched on/off: a
  // static one would smear 60px of darkness back into the app's right edge
  // while the panel sits parked off-screen at translateX(100%).
  boxShadow: open ? '-26px 0 60px rgba(23,23,27,0.26)' : '-26px 0 60px rgba(23,23,27,0)',
  transform: open ? 'translateX(0)' : 'translateX(100%)',
  transition: `transform ${MOTION}, box-shadow ${MOTION}`,
  display: 'flex',
  flexDirection: 'column',
  padding: 'calc(var(--top-inset) + 58px) 0 0',
  boxSizing: 'border-box',
});

const headerStyle: CSSProperties = {
  flex: 'none',
  padding: '0 20px 4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

// Same face/weight as the login wordmark — Frank Ruhl Libre 500, ink.
const wordmarkStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontWeight: 500,
  fontSize: 26,
  lineHeight: 1,
  color: 'var(--ink)',
  letterSpacing: '0.5px',
};

const roundBtnStyle = (size: number): CSSProperties => ({
  width: size,
  height: size,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.72)',
  boxShadow: '0 1px 2px rgba(23,23,27,0.05), 0 0 0 1px rgba(23,23,27,0.05)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flex: 'none',
});

const navStyle: CSSProperties = { flex: 'none', padding: '14px 10px 2px' };

const navRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 13,
  padding: '12px 12px',
  borderRadius: 15,
  cursor: 'pointer',
};

const navLabelStyle: CSSProperties = { fontSize: 15.5, fontWeight: 600, color: 'var(--ink)' };

const sectionLabelStyle: CSSProperties = {
  flex: 'none',
  margin: '16px 22px 6px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--faint)',
  letterSpacing: '0.02em',
};

// minHeight:0 so this flex child may actually shrink and scroll instead of
// pushing the pinned footer off the bottom of the panel.
const recentsStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '0 10px 12px',
};

const chatRowStyle: CSSProperties = { padding: '10px 12px', borderRadius: 13, cursor: 'pointer' };

const chatTitleStyle: CSSProperties = {
  fontSize: 14.5,
  color: 'var(--text)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const emptyStyle: CSSProperties = { padding: '6px 12px', fontSize: 13.5, color: 'var(--faint)' };

const footerStyle: CSSProperties = {
  flex: 'none',
  borderTop: '1px solid rgba(23,23,27,0.06)',
  padding: '14px 18px calc(var(--bottom-inset) + 22px)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const pillStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 48,
  borderRadius: 999,
  background: 'var(--accent)',
  color: '#ffffff',
  boxShadow: '0 10px 22px rgba(107,113,246,0.28)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 9,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};

interface IconProps {
  size?: number;
  color?: string;
}

function IconSearch({ size = 18, color = INK }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true">
      <circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2} />
      <path d="M21 21L16.5 16.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function IconCompose({ size = 19, color = INK }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true">
      <path
        d="M4 20l1.2-4.2L16.6 4.4a2 2 0 012.9 0l0.1 0.1a2 2 0 010 2.9L8.2 18.8 4 20z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPatients({ size = 19, color = INK }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true">
      <circle cx={9} cy={7.8} r={3.5} stroke={color} strokeWidth={2} />
      <path
        d="M2.9 19.6c0-3.3 2.7-5.3 6.1-5.3s6.1 2 6.1 5.3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path d="M16.4 4.9a3.4 3.4 0 010 5.8" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <path d="M18.2 14.6c1.9.7 2.9 2.3 2.9 4.7" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function IconGear({ size = 19, color = INK }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true">
      <path d="M12 8.6a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8z" stroke={color} strokeWidth={1.8} />
      <path
        d="M19.4 12a7.4 7.4 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 00-2.1-1.2L14.5 3h-4l-.4 2.7a7.5 7.5 0 00-2.1 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 000 2.4l-2 1.5 2 3.4 2.3-1c.64.5 1.35.9 2.1 1.2l.4 2.7h4l.4-2.7a7.5 7.5 0 002.1-1.2l2.3 1 2-3.4-2-1.5c.07-.4.1-.8.1-1.2z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MenuDrawer({
  open,
  chats,
  onClose,
  onRefreshChats,
  onNewChat,
  onOpenSearch,
  onOpenChat,
  onOpenSettings,
}: MenuDrawerProps) {
  useEffect(() => {
    // Refresh once per open — onRefreshChats (state.refreshChats) is a stable
    // useCallback and already catches its own errors (toasts on failure).
    if (open) onRefreshChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div style={wrapStyle(open)} role="dialog" aria-label="תפריט" aria-hidden={!open}>
      <div onClick={onClose} style={scrimStyle(open)} />
      <div style={panelStyle(open)}>
        <div style={headerStyle}>
          <div style={wordmarkStyle}>דרור</div>
          <div onClick={onOpenSearch} title="חיפוש" className="pressable" style={roundBtnStyle(38)}>
            <IconSearch />
          </div>
        </div>

        <div style={navStyle}>
          <div onClick={onNewChat} className="pressable" style={navRowStyle}>
            <IconCompose />
            <span style={navLabelStyle}>שיחה חדשה</span>
          </div>
          {/* SearchOverlay is the app's patient directory — search, open a
              file, or create a new one — so it is what "my patients" opens. */}
          <div onClick={onOpenSearch} className="pressable" style={navRowStyle}>
            <IconPatients />
            <span style={navLabelStyle}>המטופלים שלי</span>
          </div>
        </div>

        <div style={sectionLabelStyle}>אחרונות</div>
        {/* chats arrive from state already ordered '-updated_date' (data.ts
            listChats) — most recent first, no extra fetching or sorting here. */}
        <div className="scroll-touch" style={recentsStyle}>
          {chats.length === 0 ? (
            <div style={emptyStyle}>עדיין אין שיחות</div>
          ) : (
            chats.map((c) => (
              <div key={c.id} onClick={() => onOpenChat(c)} className="pressable" style={chatRowStyle}>
                <div style={chatTitleStyle}>{c.title}</div>
              </div>
            ))
          )}
        </div>

        <div style={footerStyle}>
          <div onClick={onNewChat} className="pressable" style={pillStyle}>
            <IconCompose size={18} color="#ffffff" />
            <span>שיחה חדשה</span>
          </div>
          <div onClick={onOpenSettings} title="הגדרות" className="pressable" style={roundBtnStyle(48)}>
            <IconGear size={20} />
          </div>
        </div>
      </div>
    </div>
  );
}
