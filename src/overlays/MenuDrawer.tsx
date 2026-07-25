import { useEffect, useState, type CSSProperties } from 'react';
import type { Chat, Patient } from '@/api/data';
import { displayName, fullName } from '@/api/format';

// Ported verbatim from the design mock (lines 503-552, "MENU SIDEBAR
// (ChatGPT-style)"). menuQ/chatFilter are local UI state — they reset to
// defaults naturally on every open since the component remounts each time
// the overlay opens (mirrors the mock's openMenu reset, line 706).
interface MenuDrawerProps {
  user: { email: string; full_name?: string } | null;
  chats: Chat[];
  patients: Patient[];
  onClose: () => void;
  onRefreshChats: () => Promise<void>;
  onNewChat: () => void;
  onOpenSearch: () => void;
  onOpenChat: (chat: Chat) => void;
  onOpenSettings: () => void;
}

const wrapStyle: CSSProperties = { position: 'absolute', inset: 0, zIndex: 20 };

const backdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(23,23,27,0.45)',
  animation: 'drFade 0.25s ease',
};

const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  right: 0,
  width: '82%',
  background: '#f9f8f9',
  boxShadow: '-20px 0 50px rgba(0,0,0,0.25)',
  animation: 'drSlideIn 0.28s ease',
  display: 'flex',
  flexDirection: 'column',
  padding: '64px 0 0',
  boxSizing: 'border-box',
};

const searchRowStyle: CSSProperties = {
  padding: '0 16px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const searchWrapStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: '#efedf0',
  borderRadius: 999,
  padding: '10px 16px',
};

const searchInputStyle: CSSProperties = {
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 14.5,
  color: '#17171b',
  width: '100%',
  textAlign: 'right',
};

const closeBtnStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flex: 'none',
};

const bodyStyle: CSSProperties = { flex: 1, overflowY: 'auto', padding: '0 10px 16px' };

const actionRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 12,
  borderRadius: 14,
  cursor: 'pointer',
};

const actionLabelStyle: CSSProperties = { fontSize: 15.5, fontWeight: 600, color: '#17171b' };

const sectionLabelStyle: CSSProperties = {
  margin: '16px 12px 8px',
  fontSize: 12,
  fontWeight: 700,
  color: '#9a9ca1',
};

const filtersRowStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  padding: '0 12px 8px',
};

const chatRowStyle: CSSProperties = { padding: '11px 12px', borderRadius: 14, cursor: 'pointer' };

const chatTitleStyle: CSSProperties = {
  fontSize: 14.5,
  color: '#17171b',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const footerStyle: CSSProperties = {
  borderTop: '1px solid #ebe9ec',
  padding: '12px 16px 26px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const identityWrapStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 };

const avatarStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: 'linear-gradient(135deg,#6B71F6,#A9B9F9)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  fontSize: 14,
  fontWeight: 700,
  flex: 'none',
};

const identityNameStyle: CSSProperties = { fontSize: 14.5, fontWeight: 600, color: '#17171b' };
const identityRoleStyle: CSSProperties = { fontSize: 12, color: '#9a9ca1' };

const settingsBtnStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flex: 'none',
};

function pillStyle(on: boolean): CSSProperties {
  return {
    padding: '6px 14px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    ...(on ? { background: '#17171b', color: '#ffffff' } : { background: '#efedf0', color: '#6d6f74' }),
  };
}

export default function MenuDrawer({
  user,
  chats,
  patients,
  onClose,
  onRefreshChats,
  onNewChat,
  onOpenSearch,
  onOpenChat,
  onOpenSettings,
}: MenuDrawerProps) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    onRefreshChats();
    // Refresh once per open — onRefreshChats (state.refreshChats) is a stable
    // useCallback and already catches its own errors (toasts on failure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = displayName(user);
  const filters: { label: string; v: string }[] = [
    { label: 'הכל', v: 'all' },
    ...patients.map((p) => ({ label: fullName(p), v: p.id })),
  ];
  const visibleChats = chats.filter(
    (c) => (filter === 'all' || c.patient_id === filter) && c.title.includes(q.trim())
  );

  return (
    <div style={wrapStyle}>
      <div onClick={onClose} style={backdropStyle} />
      <div style={panelStyle}>
        <div style={searchRowStyle}>
          <div style={searchWrapStyle}>
            <svg viewBox="0 0 24 24" fill="none" width={17} height={17} style={{ flex: 'none' }}>
              <circle cx={11} cy={11} r={7} stroke="#9a9ca1" strokeWidth={2} />
              <path d="M21 21L16.5 16.5" stroke="#9a9ca1" strokeWidth={2} strokeLinecap="round" />
            </svg>
            <input
              dir="rtl"
              placeholder="חיפוש"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={searchInputStyle}
            />
          </div>
          <div onClick={onClose} style={closeBtnStyle}>
            <svg viewBox="0 0 24 24" fill="none" width={17} height={17}>
              <path d="M6 6l12 12M18 6L6 18" stroke="#17171b" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <div style={bodyStyle}>
          <div onClick={onNewChat} style={actionRowStyle}>
            <svg viewBox="0 0 24 24" fill="none" width={19} height={19} style={{ flex: 'none' }}>
              <path
                d="M4 20l1.2-4.2L16.6 4.4a2 2 0 012.9 0l0.1 0.1a2 2 0 010 2.9L8.2 18.8 4 20z"
                stroke="#17171b"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            </svg>
            <span style={actionLabelStyle}>שיחה חדשה</span>
          </div>
          <div onClick={onOpenSearch} style={actionRowStyle}>
            <svg viewBox="0 0 24 24" fill="none" width={19} height={19} style={{ flex: 'none' }}>
              <circle cx={12} cy={8} r={4} stroke="#17171b" strokeWidth={2} />
              <path
                d="M4.5 20.5c1.3-3.4 4.1-5 7.5-5s6.2 1.6 7.5 5"
                stroke="#17171b"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </svg>
            <span style={actionLabelStyle}>חיפוש מטופלים</span>
          </div>
          <div style={sectionLabelStyle}>שיחות אחרונות</div>
          <div style={filtersRowStyle}>
            {filters.map((f) => (
              <div key={f.v} onClick={() => setFilter(f.v)} style={pillStyle(filter === f.v)}>
                {f.label}
              </div>
            ))}
          </div>
          {visibleChats.map((c) => (
            <div key={c.id} onClick={() => onOpenChat(c)} style={chatRowStyle}>
              <div style={chatTitleStyle}>{c.title}</div>
            </div>
          ))}
        </div>
        <div style={footerStyle}>
          <div style={identityWrapStyle}>
            <div style={avatarStyle}>{name.charAt(0)}</div>
            <div>
              <div style={identityNameStyle}>{name}</div>
              <div style={identityRoleStyle}>פסיכולוג/ית</div>
            </div>
          </div>
          <div onClick={onOpenSettings} title="הגדרות" style={settingsBtnStyle}>
            <svg viewBox="0 0 24 24" fill="none" width={19} height={19}>
              <path d="M12 8.6a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8z" stroke="#17171b" strokeWidth={1.8} />
              <path
                d="M19.4 12a7.4 7.4 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 00-2.1-1.2L14.5 3h-4l-.4 2.7a7.5 7.5 0 00-2.1 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 000 2.4l-2 1.5 2 3.4 2.3-1c.64.5 1.35.9 2.1 1.2l.4 2.7h4l.4-2.7a7.5 7.5 0 002.1-1.2l2.3 1 2-3.4-2-1.5c.07-.4.1-.8.1-1.2z"
                stroke="#17171b"
                strokeWidth={1.8}
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
