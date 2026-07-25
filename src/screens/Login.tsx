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
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-warm)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 26px',
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
            inputMode="numeric"
            placeholder="קוד אימות"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            style={inputStyle}
            required
          />
          <button type="submit" disabled={busy} style={buttonStyle}>
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
            type="email"
            placeholder="אימייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
          />
          <input
            dir="rtl"
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
          />
          <button type="submit" disabled={busy} style={buttonStyle}>
            {mode === 'login' ? 'כניסה' : 'הרשמה'}
          </button>
        </form>
      )}

      {error && (
        <div style={{ marginTop: 16, fontSize: 13.5, color: 'var(--coral)', textAlign: 'center' }}>
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
