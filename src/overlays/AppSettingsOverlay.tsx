import { useState, type CSSProperties } from 'react';
import { auth } from '@/api/data';
import { displayName } from '@/api/format';

// Ported verbatim from the design mock (lines 472-501, "APP SETTINGS
// OVERLAY"), plus two controller-resolved additions not in the mock: the
// privacy row expands (mock only shows a static chevron) and a "התנתקות"
// row was added below it.
interface AppSettingsOverlayProps {
  user: { email: string; full_name?: string } | null;
  onClose: () => void;
}

const PRIVACY_TEXT =
  'הנתונים שלך מבודדים ברמת הפלטפורמה — כל מטפל/ת רואה אך ורק את המטופלים, הפגישות והמסמכים שיצר/ה. התוכן הקליני אינו משמש לאימון מודלים.';

const backdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 20,
  background: 'rgba(23,23,27,0.55)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  animation: 'drFade 0.25s ease',
};

const closeBtnStyle: CSSProperties = {
  position: 'absolute',
  top: 64,
  right: 20,
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.14)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  zIndex: 3,
};

const cardStyle: CSSProperties = {
  position: 'absolute',
  left: 22,
  right: 22,
  top: 130,
  background: '#ffffff',
  borderRadius: 32,
  padding: '24px 20px',
  boxShadow: '0 30px 60px rgba(0,0,0,0.3)',
  animation: 'drRise 0.35s ease',
};

const titleStyle: CSSProperties = {
  fontFamily: "'Frank Ruhl Libre',serif",
  fontSize: 21,
  fontWeight: 500,
  color: '#17171b',
  textAlign: 'center',
  marginBottom: 14,
};

const identityRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 12,
  borderRadius: 16,
  background: '#faf8fa',
  marginBottom: 6,
};

const avatarStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: 'linear-gradient(135deg,#ee5a50,#d0b1ca)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  fontSize: 15,
  fontWeight: 700,
  flex: 'none',
};

const identityNameStyle: CSSProperties = { fontSize: 15, fontWeight: 600, color: '#17171b' };
const identityRoleStyle: CSSProperties = { fontSize: 12.5, color: '#9a9ca1' };

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 12px',
  borderRadius: 16,
  cursor: 'pointer',
};

const rowLabelStyle: CSSProperties = { fontSize: 15, fontWeight: 500, color: '#17171b' };
const rowValueStyle: CSSProperties = { fontSize: 13.5, color: '#9a9ca1' };

const toggleWrapStyle: CSSProperties = {
  width: 44,
  height: 26,
  borderRadius: 999,
  background: '#17171b',
  position: 'relative',
  flex: 'none',
};

const toggleKnobStyle: CSSProperties = {
  position: 'absolute',
  top: 3,
  left: 3,
  width: 20,
  height: 20,
  borderRadius: '50%',
  background: '#fff',
};

const chevronStyle = (open: boolean): CSSProperties => ({
  transform: open ? 'rotate(-90deg)' : 'none',
  transition: 'transform 0.2s ease',
});

const privacyTextStyle: CSSProperties = {
  padding: '0 12px 14px',
  fontSize: 13,
  color: '#6d6f74',
  lineHeight: 1.6,
  textAlign: 'right',
};

const logoutRowStyle: CSSProperties = {
  ...rowStyle,
  justifyContent: 'flex-start',
  marginTop: 6,
};

const logoutLabelStyle: CSSProperties = { fontSize: 15, fontWeight: 500, color: '#c0392b' };

export default function AppSettingsOverlay({ user, onClose }: AppSettingsOverlayProps) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const name = displayName(user);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await auth.logout();
    } finally {
      window.location.reload();
    }
  };

  return (
    <div style={backdropStyle}>
      <div onClick={onClose} style={closeBtnStyle}>
        <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
          <path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>
      <div style={cardStyle}>
        <div style={titleStyle}>הגדרות</div>
        <div style={identityRowStyle}>
          <div style={avatarStyle}>{name.charAt(0)}</div>
          <div>
            <div style={identityNameStyle}>{name}</div>
            <div style={identityRoleStyle}>פסיכולוג/ית</div>
          </div>
        </div>
        <div style={rowStyle}>
          <span style={rowLabelStyle}>התראות</span>
          <div style={toggleWrapStyle}>
            <div style={toggleKnobStyle} />
          </div>
        </div>
        <div style={rowStyle}>
          <span style={rowLabelStyle}>שפה</span>
          <span style={rowValueStyle}>עברית</span>
        </div>
        <div onClick={() => setPrivacyOpen((v) => !v)} style={rowStyle}>
          <span style={rowLabelStyle}>פרטיות ואבטחה</span>
          <svg viewBox="0 0 24 24" fill="none" width={16} height={16} style={chevronStyle(privacyOpen)}>
            <path d="M15 6l-6 6 6 6" stroke="#9a9ca1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {privacyOpen && <div style={privacyTextStyle}>{PRIVACY_TEXT}</div>}
        <div onClick={handleLogout} style={logoutRowStyle}>
          <span style={logoutLabelStyle}>התנתקות</span>
        </div>
      </div>
    </div>
  );
}
