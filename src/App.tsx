import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { auth } from '@/api/data';
import { fullName } from '@/api/format';
import Login from '@/screens/Login';
import Home from '@/screens/Home';
import Profile from '@/screens/Profile';
import World from '@/screens/World';
import DraftEditor from '@/screens/DraftEditor';
import SearchOverlay from '@/overlays/SearchOverlay';
import PatientContextOverlay from '@/overlays/PatientContextOverlay';
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

// Overlays not built until later tasks — opening one just surfaces a toast
// and closes itself again. 'search' and 'settings' are real (this task) and
// excluded here.
const PLACEHOLDER_OVERLAYS = new Set(['menu', 'record', 'voice', 'flow', 'appSettings']);

function AuthedApp() {
  const state = useAppState();

  useEffect(() => {
    if (state.overlay && PLACEHOLDER_OVERLAYS.has(state.overlay)) {
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
      ) : state.screen === 'profile' && state.activePatient ? (
        <Profile
          patient={state.activePatient}
          sessionCount={state.activeSessionCount}
          onOpenSettings={() => state.open('settings')}
          onGoHome={() => state.go('home')}
          onOpenFlow={() => state.open('flow')}
          onGoWorld={() => state.go('world')}
        />
      ) : state.screen === 'world' && state.activePatient ? (
        <World
          patient={state.activePatient}
          sessionCount={state.activeSessionCount}
          entries={state.entries}
          onGoProfile={() => state.go('profile')}
          onOpenEntry={(entry) => {
            state.setDraft({
              id: entry.id,
              type: entry.type === 'doc' ? 'doc' : 'summary',
              patientId: state.activePatient!.id,
              date: entry.entry_date,
              title: entry.title,
              body: entry.type === 'rec' ? entry.transcript || entry.body : entry.body,
            });
            state.go('draft');
          }}
        />
      ) : state.screen === 'draft' && state.draft ? (
        <DraftEditor
          draft={state.draft}
          onBodyChange={(body) => state.setDraft((d) => (d ? { ...d, body } : d))}
          onClose={() => {
            state.go('profile');
            state.setDraft(null);
          }}
          onSave={(asDraft) => state.saveDraft(asDraft)}
        />
      ) : (
        <ScreenPlaceholder onHome={() => state.go('home')} />
      )}

      {state.toast && <Toast text={state.toast} />}

      {state.overlay === 'search' && (
        <SearchOverlay
          patients={state.patients}
          onClose={() => state.close()}
          onOpenPatient={async (id) => {
            await state.refreshPatients();
            await state.openPatient(id);
            state.close();
          }}
          showToast={state.showToast}
        />
      )}

      {state.overlay === 'settings' && state.activePatient && (
        <PatientContextOverlay
          patient={state.activePatient}
          onClose={() => state.close()}
          onSaved={async () => {
            await state.refreshPatients();
            state.close();
          }}
          showToast={state.showToast}
        />
      )}

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
      <AppFrame>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <dror-orb size="80" state="thinking" />
        </div>
      </AppFrame>
    );
  }

  if (!user) {
    return <Login onAuthed={refresh} />;
  }

  return <AuthedApp />;
}
