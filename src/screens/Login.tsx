import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { auth } from '@/api/data';
import { setChromeColor } from '@/ui/chromeColor';

// Ported from the design project's `Dror Login.dc.html` (Claude Design
// 652f2491) — the app's entry page. That file is a phone MOCKUP: its bezel,
// dynamic island, 9:41 status bar and home-indicator pill are all chrome the
// real device draws itself, so none of them are ported. Everything inside the
// screen is, with two structural changes:
//
//  - the mock positions every block absolutely inside a fixed 401x838 screen;
//    here the same blocks flow in a column, so the layout survives a 375pt SE
//    and a 440pt Pro Max alike, and the safe-area tokens (tokens.css) take the
//    place of the mock's hard-coded 112 / 44 offsets.
//  - it has no OTP step and no error states. Both are real here, and are
//    built out of the same card/pill vocabulary as the rest of the screen.

type Mode = 'login' | 'signup' | 'otp';

// The whole window. Login is the one screen rendered OUTSIDE AppFrame, so it
// carries its own copy of that component's column geometry (below) — and it
// has to be its own bounded scroll container, because html/body are pinned
// (base.css, Wave 4 Issue A) and nothing else here scrolls. Without the
// explicit height + overflowY, a short viewport (or the keyboard, or an error
// line) would clip content with no way to reach it.
const rootStyle: CSSProperties = {
  height: '100dvh',
  overflowY: 'auto',
  background: 'var(--bg-warm)',
};

// AppFrame's column, mirrored: same max width, same centring, same shadow, so
// signing in on a desktop browser doesn't visibly change the app's shape.
const columnStyle: CSSProperties = {
  position: 'relative',
  maxWidth: 430,
  minHeight: '100%',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 0 60px rgba(0,0,0,0.10)',
};

// The mock's own hero gradient — deliberately NOT var(--grad-hero); see the
// token's definition in tokens.css for why the entry page gets its own. Its
// PEAK stop is identical, which is what chromeColor.ts reads for the status bar.
const heroStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  pointerEvents: 'none',
  background: 'var(--grad-hero-login), #faf8fa',
};

// The dawn glow rising from the bottom edge. Lifted by --shell-gap for the
// same reason Profile's is (Profile.tsx ~line 129): on a device that withholds
// a strip below the shell, ending the glow at the seam would put a live
// gradient against the flat colour chromeColor.ts paints the strip with, and
// the two would never agree. Lifting it leaves the frame's last rows at the
// flat #faf8fa the strip already is, so they meet as one surface.
const bottomGlowStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 'var(--shell-gap, 0px)',
  height: 240,
  zIndex: 0,
  pointerEvents: 'none',
  background:
    'radial-gradient(120% 100% at 50% 112%, rgba(169,185,249,0.4) 0%, rgba(240,228,232,0.3) 42%, rgba(246,217,196,0.16) 66%, rgba(246,217,196,0) 100%)',
};

// The mock puts the brand block at y=112 with its status bar occupying 0-54,
// i.e. 58px of clear air below the bar — so the top padding is that 58, plus
// whatever the device's status bar actually costs. At the bottom, the mock's
// 44px is measured from the PHYSICAL edge, which on a shell-gap device is
// below the layout viewport entirely; subtracting the gap keeps the last line
// the same distance from that edge, with a floor so it never touches the seam.
const contentStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding:
    'calc(var(--top-inset) + 58px) 26px max(14px, calc(var(--bottom-inset) + 10px - var(--shell-gap, 0px)))',
  boxSizing: 'border-box',
};

const orbWrapStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const haloStyle: CSSProperties = {
  position: 'absolute',
  inset: -30,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(107,113,246,0.22) 0%, rgba(107,113,246,0) 70%)',
  animation: 'drBreathe 5s ease-in-out infinite',
  pointerEvents: 'none',
};

const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 34,
  fontWeight: 500,
  color: 'var(--ink)',
  marginTop: 22,
  letterSpacing: '0.01em',
};

const sublineStyle: CSSProperties = {
  fontSize: 14,
  color: '#5f6068',
  marginTop: 5,
  letterSpacing: '0.01em',
};

const formStyle: CSSProperties = {
  width: '100%',
  maxWidth: 352,
  marginTop: 46,
  display: 'flex',
  flexDirection: 'column',
  gap: 11,
};

// The frosted field card the whole screen is built from: white at 78% over the
// gradient, hairline ring instead of a border, blurred so the dawn colours
// still read through it.
const cardStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.78)',
  borderRadius: 20,
  boxShadow: '0 1px 2px rgba(23,23,27,0.04), 0 0 0 1px rgba(23,23,27,0.05)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  padding: '13px 18px 14px',
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#8d8f96',
  letterSpacing: '0.04em',
};

// 16px is also the smallest size iOS will not zoom into on focus.
const fieldInputStyle: CSSProperties = {
  marginTop: 3,
  width: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 16,
  color: 'var(--ink)',
  textAlign: 'right',
  padding: 0,
};

const revealStyle: CSSProperties = {
  flex: 'none',
  border: 'none',
  background: 'none',
  padding: '0 0 2px',
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--accent)',
  cursor: 'pointer',
};

const forgotRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-start',
  marginTop: 1,
};

const forgotStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  fontSize: 12.5,
  color: '#7c7e85',
  cursor: 'pointer',
};

const ctaStyle: CSSProperties = {
  marginTop: 6,
  height: 56,
  border: 'none',
  outline: 'none',
  borderRadius: 999,
  background: 'var(--ink)',
  color: '#ffffff',
  fontSize: 16.5,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 12px 26px -12px rgba(23,23,27,0.7)',
};

const dividerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  margin: '14px 2px 2px',
};

const dividerLineStyle: CSSProperties = { flex: 1, height: 1, background: 'rgba(23,23,27,0.10)' };

const googleStyle: CSSProperties = {
  height: 54,
  border: 'none',
  outline: 'none',
  borderRadius: 999,
  background: '#ffffff',
  color: 'var(--ink)',
  fontSize: 15.5,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 0 0 1px rgba(23,23,27,0.07)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
};

const messageStyle = (isError: boolean): CSSProperties => ({
  marginTop: 14,
  fontSize: 13,
  textAlign: 'center',
  color: isError ? 'var(--accent)' : '#6d6f76',
});

const footerStyle: CSSProperties = {
  marginTop: 26,
  fontSize: 13.5,
  color: '#6d6f76',
  textAlign: 'center',
};

const footerLinkStyle: CSSProperties = {
  font: 'inherit',
  fontWeight: 600,
  color: 'var(--ink)',
  background: 'none',
  border: 'none',
  padding: '0 0 1px',
  borderBottom: '1px solid rgba(107,113,246,0.35)',
  cursor: 'pointer',
};

const assistantLineStyle: CSSProperties = {
  marginTop: 24,
  fontFamily: "-apple-system,'SF Pro Text','Helvetica Neue',sans-serif",
  fontSize: 10.5,
  fontWeight: 300,
  letterSpacing: '0.03em',
  color: '#a9abb1',
  textAlign: 'center',
};

// Covers the layout viewport rather than the column, so the blur has nothing
// to leak around on a desktop window. chromeColor's 'signingIn' entry paints
// the strip below it to match.
const signingInStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 20,
  background:
    'radial-gradient(115% 62% at 50% 106%, rgba(107,113,246,0.5) 0%, rgba(107,113,246,0.3) 26%, rgba(169,185,249,0.12) 44%, rgba(23,23,27,0.92) 68%, rgba(10,10,12,0.97) 100%), rgba(12,12,14,0.92)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  animation: 'drFade 0.35s ease',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 30,
  paddingBottom: 60,
};

// Standard 4-color Google "G" mark, inline so no external image request is needed.
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flex: 'none' }}>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.581C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // The signing-in veil covers the layout viewport, but not the strip below it
  // (src/ui/shellGap.ts) — only body's background reaches there. Without this
  // the strip would stay the login screen's near-white while the screen itself
  // goes almost black. App.tsx's own effect is keyed on `user`, which does not
  // change while this screen is busy, so the two never fight.
  useEffect(() => {
    setChromeColor(busy ? 'signingIn' : 'login', null);
  }, [busy]);

  const run = async (fn: () => Promise<void>, failure: string) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await fn();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      run(async () => {
        await auth.login(email, password);
        onAuthed();
      }, 'ההתחברות נכשלה, נסו שוב');
    } else if (mode === 'signup') {
      run(async () => {
        await auth.register(email, password);
        setMode('otp');
      }, 'ההרשמה נכשלה, נסו שוב');
    } else {
      run(async () => {
        await auth.verifyOtp(email, otp);
        await auth.login(email, password);
        onAuthed();
      }, 'הקוד שגוי, נסו שוב');
    }
  };

  // Base44 owns the rest of the reset flow (the emailed token link and the page
  // that takes the new password), so all this screen can do is send the mail
  // and say so.
  const handleForgot = () => {
    if (!email) {
      setNotice('');
      setError('הזינו אימייל ונשלח אליו קישור לאיפוס');
      return;
    }
    run(async () => {
      await auth.requestPasswordReset(email);
      setNotice('שלחנו קישור לאיפוס סיסמה לאימייל');
    }, 'לא הצלחנו לשלוח קישור לאיפוס');
  };

  const toggleMode = () => {
    setError('');
    setNotice('');
    setMode(mode === 'login' ? 'signup' : 'login');
  };

  const ctaLabel = mode === 'login' ? 'כניסה' : mode === 'signup' ? 'יצירת חשבון' : 'אימות';

  return (
    <div dir="rtl" lang="he" className="scroll-touch" style={rootStyle}>
      <div style={columnStyle}>
        <div style={heroStyle} />
        <div style={bottomGlowStyle} />

        <div style={contentStyle}>
          <div style={orbWrapStyle}>
            <div style={haloStyle} />
            <dror-orb size="104" state={busy ? 'thinking' : 'idle'} />
          </div>
          <div style={titleStyle}>דרור</div>
          <div style={sublineStyle}>החופש להתרכז במטופל</div>

          <form onSubmit={handleSubmit} style={formStyle}>
            {mode === 'otp' ? (
              <>
                <div style={{ ...sublineStyle, marginTop: 0, textAlign: 'center' }}>
                  שלחנו קוד אימות לאימייל
                </div>
                <div style={cardStyle}>
                  <div style={fieldLabelStyle}>קוד אימות</div>
                  <input
                    dir="rtl"
                    name="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    style={fieldInputStyle}
                    required
                  />
                </div>
              </>
            ) : (
              <>
                <div style={cardStyle}>
                  <div style={fieldLabelStyle}>אימייל</div>
                  <input
                    dir="rtl"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="dana@clinic.co.il"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={fieldInputStyle}
                    required
                  />
                </div>

                <div style={{ ...cardStyle, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={fieldLabelStyle}>סיסמה</div>
                    <input
                      dir="rtl"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      // Tells the password manager which of the two it is looking at, so a
                      // login offers the saved password and a signup offers to save a new one.
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={fieldInputStyle}
                      required
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    style={revealStyle}
                  >
                    {showPassword ? 'הסתר' : 'הצג'}
                  </button>
                </div>

                <div style={forgotRowStyle}>
                  <button type="button" onClick={handleForgot} style={forgotStyle}>
                    שכחתי סיסמה
                  </button>
                </div>
              </>
            )}

            <button type="submit" disabled={busy} className="pressable" style={ctaStyle}>
              {ctaLabel}
            </button>

            {mode !== 'otp' && (
              <>
                <div dir="ltr" style={dividerStyle}>
                  <div style={dividerLineStyle} />
                  <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>או</span>
                  <div style={dividerLineStyle} />
                </div>
                <button
                  type="button"
                  onClick={() => auth.loginWithGoogle()}
                  className="pressable"
                  style={googleStyle}
                >
                  <GoogleIcon />
                  <span>המשך עם Google</span>
                </button>
              </>
            )}
          </form>

          {(error || notice) && <div style={messageStyle(!!error)}>{error || notice}</div>}

          {mode !== 'otp' && (
            <div style={footerStyle}>
              {mode === 'signup' ? 'יש לך כבר חשבון?' : 'עדיין אין לך חשבון?'}{' '}
              <button type="button" onClick={toggleMode} style={footerLinkStyle}>
                {mode === 'signup' ? 'כניסה' : 'הרשמה'}
              </button>
            </div>
          )}

          <div style={{ flex: 1, minHeight: 24 }} />

          <div dir="ltr" style={assistantLineStyle}>
            Dror is an AI assistant connected to your patients context.
          </div>
        </div>
      </div>

      {busy && (
        <div style={signingInStyle}>
          <dror-orb size="150" state="thinking" />
          <div style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.9)' }}>רגע, מתחברים…</div>
        </div>
      )}
    </div>
  );
}
