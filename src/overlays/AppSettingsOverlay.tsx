import { useEffect, useState, type CSSProperties } from 'react';
import { auth } from '@/api/data';
import { displayName } from '@/api/format';
import { GUIDELINES_MAX, SUMMARY_STYLES, loadMyPrefs, saveMyPrefs, type SummaryStyle } from '@/api/prefs';

// Ported from the design mock (lines 472-501, "APP SETTINGS OVERLAY"), then
// extended (Task W6) with a real, editable profile + preferences section —
// see .superpowers/sdd/2026-07-25-dror-base44-import/task-w6-brief.md. Two
// controller-resolved additions predate that task and stay: the privacy row
// expands (the mock only shows a static chevron) and a "התנתקות" row sits
// below it. The mock's "התראות" toggle is gone — nothing implements
// notifications, and a toggle that does nothing is a lie to the user
// (explicit founder ruling; do not "fix" it by wiring a fake preference).
interface AppSettingsOverlayProps {
  user: { email: string; full_name?: string } | null;
  onClose: () => void;
  showToast: (text: string) => void;
}

const PRIVACY_TEXT =
  'הנתונים שלך מבודדים ברמת הפלטפורמה — כל מטפל/ת רואה אך ורק את המטופלים, הפגישות והמסמכים שיצר/ה. דרור אינו מאמן מודלים על תוכן קליני.';

const GUIDELINES_PLACEHOLDER =
  'למשל: לכתוב בלשון נקבה, להימנע ממונחים אבחנתיים, לסיים כל סיכום בהמלצה אחת';

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
  top: 'calc(var(--top-inset) + 64px)',
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

// The card now holds more than a screenful (profile + preferences + the
// settings rows below) — bounded maxHeight + its own scroll, rather than
// clipping against (or pushing past) the safe areas.
const cardStyle: CSSProperties = {
  position: 'absolute',
  left: 22,
  right: 22,
  top: 'calc(var(--top-inset) + 130px)',
  maxHeight: 'calc(100% - var(--top-inset) - var(--bottom-inset) - 170px)',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
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

// Profile block — the mock's account-chip aesthetic (gradient avatar-initial
// + name + role), sized up since this is now the settings screen's own
// editable identity, not just a small footer chip.
const profileRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: 14,
  borderRadius: 20,
  background: '#faf8fa',
  marginBottom: 18,
};

const avatarStyle: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: '50%',
  background: 'linear-gradient(135deg,#6B71F6,#A9B9F9)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  fontSize: 21,
  fontWeight: 700,
  flex: 'none',
};

const profileNameStyle: CSSProperties = { fontSize: 17, fontWeight: 600, color: '#17171b' };
const profileTitleStyle: CSSProperties = { fontSize: 13, color: '#9a9ca1', marginTop: 2 };
const profileEmailStyle: CSSProperties = { fontSize: 12, color: '#9a9ca1', marginTop: 3 };

const fieldLabelStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: '#6d6f74',
  marginBottom: 6,
  marginTop: 14,
};

// fontSize 16 on both the inputs and the textarea below: iOS Safari zooms
// the viewport on focus of any field under 16px. The viewport meta tag
// already locks pinch/double-tap zoom (index.html), but this is the
// per-field belt-and-suspenders the task brief asks to keep anyway.
const inputStyle: CSSProperties = {
  width: '100%',
  height: 46,
  border: 'none',
  outline: 'none',
  background: '#f6f5f7',
  borderRadius: 14,
  fontSize: 16,
  color: '#17171b',
  padding: '0 15px',
  textAlign: 'right',
  boxSizing: 'border-box',
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: '#17171b',
  textAlign: 'center',
  marginTop: 26,
};

const sectionDescStyle: CSSProperties = {
  fontSize: 12.5,
  color: '#9a9ca1',
  textAlign: 'center',
  marginTop: 4,
  lineHeight: 1.5,
};

const guidelinesTextareaStyle: CSSProperties = {
  marginTop: 12,
  width: '100%',
  height: 110,
  border: 'none',
  outline: 'none',
  background: '#f6f5f7',
  borderRadius: 18,
  resize: 'none',
  fontSize: 16,
  lineHeight: 1.6,
  color: '#17171b',
  padding: '14px 16px',
  textAlign: 'right',
  boxSizing: 'border-box',
};

const pillsRowStyle: CSSProperties = { display: 'flex', gap: 8, marginTop: 10 };

const pillStyle = (selected: boolean): CSSProperties => ({
  flex: 1,
  textAlign: 'center',
  padding: '10px 4px',
  borderRadius: 999,
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
  boxSizing: 'border-box',
  background: selected ? '#17171b' : 'transparent',
  color: selected ? '#ffffff' : '#6d6f74',
  border: selected ? '1px solid #17171b' : '1px solid #9a9ca1',
});

const saveBtnStyle: CSSProperties = {
  marginTop: 16,
  width: '100%',
  height: 50,
  border: 'none',
  borderRadius: 999,
  background: '#17171b',
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};

const dividerStyle: CSSProperties = { height: 1, background: '#efeef1', margin: '20px 6px 8px' };

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

export default function AppSettingsOverlay({ user, onClose, showToast }: AppSettingsOverlayProps) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [displayNameField, setDisplayNameField] = useState('');
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [guidelines, setGuidelines] = useState('');
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle | ''>('');
  const [saving, setSaving] = useState(false);

  // Falls back to the auth full_name/email (displayName() already does that
  // fallback chain) whenever no prefs have been saved yet — both before the
  // load below resolves, and permanently if the therapist never sets one.
  const shownName = displayNameField.trim() || displayName(user);
  const shownTitle = professionalTitle.trim();

  // Loaded once when the overlay mounts. While the request is in flight the
  // fields already render the auth-fallback state set above — there is no
  // separate spinner/loading branch, so there is nothing to jump.
  useEffect(() => {
    let alive = true;
    loadMyPrefs()
      .then((prefs) => {
        if (!alive || !prefs) return;
        setDisplayNameField(prefs.display_name);
        setProfessionalTitle(prefs.professional_title);
        setGuidelines(prefs.guidelines);
        setSummaryStyle(prefs.summary_style);
      })
      .catch(() => {
        // A failed load just leaves the auth-fallback fields in place — the
        // therapist can still fill them in and save normally.
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await auth.logout();
    } finally {
      window.location.reload();
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveMyPrefs({
        display_name: displayNameField,
        professional_title: professionalTitle,
        guidelines,
        summary_style: summaryStyle,
      });
      showToast('ההעדפות נשמרו');
      onClose();
    } catch {
      showToast('לא הצלחנו לשמור את ההעדפות');
    } finally {
      setSaving(false);
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

        <div style={profileRowStyle}>
          <div style={avatarStyle}>{shownName.charAt(0)}</div>
          <div>
            <div style={profileNameStyle}>{shownName}</div>
            {shownTitle && <div style={profileTitleStyle}>{shownTitle}</div>}
            <div style={profileEmailStyle}>{user?.email}</div>
          </div>
        </div>

        <div style={fieldLabelStyle}>שם תצוגה</div>
        <input
          dir="rtl"
          value={displayNameField}
          onChange={(e) => setDisplayNameField(e.target.value)}
          placeholder="איך לפנות אליך?"
          style={inputStyle}
        />

        <div style={fieldLabelStyle}>תואר מקצועי</div>
        <input
          dir="rtl"
          value={professionalTitle}
          onChange={(e) => setProfessionalTitle(e.target.value)}
          placeholder="למשל: פסיכולוגית קלינית"
          style={inputStyle}
        />

        <div style={sectionTitleStyle}>מה שדרור צריך לדעת עליך</div>
        <div style={sectionDescStyle}>
          ההנחיות האלה מעצבות איך דרור כותב סיכומים ומסמכים בשמך —
          <br />
          הן גוברות על ברירת המחדל שלו.
        </div>
        <textarea
          dir="rtl"
          placeholder={GUIDELINES_PLACEHOLDER}
          value={guidelines}
          maxLength={GUIDELINES_MAX}
          onChange={(e) => setGuidelines(e.target.value)}
          style={guidelinesTextareaStyle}
        />
        <div style={pillsRowStyle}>
          {SUMMARY_STYLES.map((style) => (
            <div key={style} onClick={() => setSummaryStyle(style)} style={pillStyle(summaryStyle === style)}>
              {style}
            </div>
          ))}
        </div>

        <button type="button" onClick={handleSave} disabled={saving} className="pressable" style={saveBtnStyle}>
          {saving ? 'שומר…' : 'שמירה'}
        </button>

        <div style={dividerStyle} />

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
