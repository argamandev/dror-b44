import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { auth } from '@/api/data';
import { fullName } from '@/api/format';
import Login from '@/screens/Login';
import Home from '@/screens/Home';
import AppFrame from '@/components/AppFrame';
import ChatBar from '@/components/ChatBar';
import Toast from '@/components/Toast';
import { useAppState } from '@/state/useAppState';

type User = { email: string; full_name?: string };

const taglineStyle: CSSProperties = {
  position: 'absolute',
  bottom: 20,
  left: 0,
  right: 0,
  textAlign: 'center',
  fontFamily: "-apple-system,'SF Pro Text','Helvetica Neue',sans-serif",
  fontSize: 10.5,
  fontWeight: 300,
  letterSpacing: '0.03em',
  color: '#b3b5ba',
  zIndex: 4,
};

const homeIndicatorStyle: CSSProperties = {
  position: 'absolute',
  bottom: 8,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 134,
  height: 5,
  borderRadius: 3,
  background: '#1c1c1e',
  zIndex: 7,
};

const placeholderWrapStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 18,
};

const placeholderBtnStyle: CSSProperties = {
  height: 46,
  padding: '0 26px',
  border: 'none',
  outline: 'none',
  borderRadius: 999,
  background: 'var(--ink)',
  color: '#ffffff',
  fontSize: 14.5,
  fontWeight: 600,
  cursor: 'pointer',
};

// Screens not yet built (Task 5 replaces this with the real markup) — keeps
// the state machine's navigation targets real without dead code paths.
function ScreenPlaceholder({ onHome }: { onHome: () => void }) {
  return (
    <div style={placeholderWrapStyle}>
      <div style={{ fontSize: 16, color: 'var(--muted)' }}>בקרוב</div>
      <button type="button" onClick={onHome} style={placeholderBtnStyle}>
        חזרה לבית
      </button>
    </div>
  );
}

function AuthedApp() {
  const state = useAppState();

  // Overlays aren't built yet (Tasks 5+). The state machine plumbing
  // (open/close) is real; until real overlay UI exists, opening one just
  // surfaces a toast and closes itself again.
  useEffect(() => {
    if (state.overlay) {
      state.showToast('בקרוב');
      state.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.overlay]);

  const showChatBar = state.screen !== 'draft';

  return (
    <AppFrame>
      {state.screen === 'home' ? (
        <Home
          homeOrb={state.homeOrb}
          onSearch={() => state.open('search')}
          onRecord={() => state.open('record')}
          onMenu={() => state.open('menu')}
          onOrbClick={() => state.open('voice')}
        />
      ) : (
        <ScreenPlaceholder onHome={() => state.go('home')} />
      )}

      {state.toast && <Toast text={state.toast} />}

      {showChatBar && (
        <ChatBar
          screen={state.screen}
          activePatientName={state.activePatient ? fullName(state.activePatient) : null}
          onOpenRecord={() => state.open('record')}
          setHomeOrb={state.setHomeOrb}
        />
      )}

      <div dir="ltr" style={taglineStyle}>
        The first AI assistant for Israeli psychologists.
      </div>
      <div style={homeIndicatorStyle} />
    </AppFrame>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const me = await auth.me();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div
        dir="rtl"
        lang="he"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-warm)',
        }}
      >
        <dror-orb size="80" state="thinking" />
      </div>
    );
  }

  if (!user) {
    return <Login onAuthed={refresh} />;
  }

  return <AuthedApp />;
}
