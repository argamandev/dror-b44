import { useState, type CSSProperties, type FormEvent } from 'react';
import { auth } from '@/api/data';

type Mode = 'login' | 'signup' | 'otp';

const inputStyle: CSSProperties = {
  width: '100%',
  border: 'none',
  outline: 'none',
  background: '#ffffff',
  borderRadius: 18,
  padding: '15px 18px',
  fontSize: 15.5,
  color: 'var(--ink)',
  boxShadow: '0 14px 34px rgba(0,0,0,0.10)',
  textAlign: 'right',
};

const buttonStyle: CSSProperties = {
  width: '100%',
  height: 52,
  border: 'none',
  outline: 'none',
  borderRadius: 999,
  background: 'var(--ink)',
  color: '#ffffff',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
};

const dividerStyle: CSSProperties = {
  width: '100%',
  maxWidth: 340,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginTop: 18,
};

const dividerLineStyle: CSSProperties = {
  flex: 1,
  height: 1,
  background: '#e4e2e6',
};

const googleButtonStyle: CSSProperties = {
  width: '100%',
  maxWidth: 340,
  height: 52,
  border: '1px solid #d8d6db',
  outline: 'none',
  borderRadius: 999,
  background: '#ffffff',
  color: 'var(--ink)',
  fontSize: 15.5,
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
};

// Standard 4-color Google "G" mark, inline so no external image request is needed.
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await auth.login(email, password);
      onAuthed();
    } catch {
      setError('ההתחברות נכשלה, נסו שוב');
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await auth.register(email, password);
      setMode('otp');
    } catch {
      setError('ההרשמה נכשלה, נסו שוב');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await auth.verifyOtp(email, otp);
      await auth.login(email, password);
      onAuthed();
    } catch {
      setError('הקוד שגוי, נסו שוב');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      dir="rtl"
      lang="he"
      className="scroll-touch"
      style={{
        // Login renders outside AppFrame, so it's the one screen not
        // confined to that component's own overflow:hidden box — with the
        // document itself locked (Wave 4 Issue A: html/body are now
        // position:fixed;overflow:hidden), Login must be its own bounded
        // scroll container (height, not minHeight, + overflowY:auto) so
        // content that doesn't fit a short viewport (e.g. with the error
        // message showing) can still be reached instead of being clipped
        // with no way to scroll to it.
        height: '100dvh',
        overflowY: 'auto',
        background: 'var(--bg-warm)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // Task W5.8: the background (and the scroll box) spans the full
        // 100dvh so it paints under the status bar and home indicator; the
        // safe areas are spent on this padding so the form never lands under
        // either.
        padding: 'calc(var(--top-inset) + 32px) 26px calc(var(--bottom-inset) + 32px)',
        boxSizing: 'border-box',
      }}
    >
      <dror-orb size="120" state="idle" />

      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 500,
          fontSize: 42,
          color: 'var(--ink)',
          marginTop: 18,
          animation: 'drRise 0.5s ease',
        }}
      >
        דרור
      </div>

      <div
        style={{
          fontSize: 14,
          color: 'var(--muted)',
          marginTop: 6,
          marginBottom: 36,
          textAlign: 'center',
          animation: 'drFade 0.6s ease',
        }}
      >
        החופש להתרכז במטופל
      </div>

      {mode === 'otp' ? (
        <form
          onSubmit={handleVerifyOtp}
          style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <div style={{ fontSize: 14.5, color: 'var(--text)', textAlign: 'center', marginBottom: 6 }}>
            שלחנו קוד אימות למייל
          </div>
          <input
            dir="rtl"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="קוד אימות"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            style={inputStyle}
            required
          />
          <button type="submit" disabled={busy} className="pressable" style={buttonStyle}>
            אימות
          </button>
        </form>
      ) : (
        <form
          onSubmit={mode === 'login' ? handleLogin : handleSignup}
          style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <input
            dir="rtl"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="אימייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
          />
          <input
            dir="rtl"
            name="password"
            type="password"
            // Tells the password manager which of the two it is looking at, so a
            // login offers the saved password and a signup offers to save a new one.
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="סיסמה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
          />
          <button type="submit" disabled={busy} className="pressable" style={buttonStyle}>
            {mode === 'login' ? 'כניסה' : 'הרשמה'}
          </button>
        </form>
      )}

      {mode !== 'otp' && (
        <>
          <div style={dividerStyle}>
            <div style={dividerLineStyle} />
            <span style={{ color: 'var(--faint)', fontSize: 13 }}>או</span>
            <div style={dividerLineStyle} />
          </div>
          <button type="button" onClick={() => auth.loginWithGoogle()} className="pressable" style={googleButtonStyle}>
            <GoogleIcon />
            כניסה עם Google
          </button>
        </>
      )}

      {error && (
        <div style={{ marginTop: 16, fontSize: 13.5, color: 'var(--accent)', textAlign: 'center' }}>
          {error}
        </div>
      )}

      {mode !== 'otp' && (
        <button
          type="button"
          onClick={() => {
            setError('');
            setMode(mode === 'login' ? 'signup' : 'login');
          }}
          style={{
            marginTop: 22,
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            fontSize: 13.5,
            cursor: 'pointer',
          }}
        >
          {mode === 'login' ? 'עדיין אין לך חשבון? הרשמה' : 'כבר יש לך חשבון? כניסה'}
        </button>
      )}
    </div>
  );
}
