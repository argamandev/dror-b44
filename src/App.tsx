import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { auth } from '@/api/data';
import { unlockAudio } from '@/api/audioUnlock';
import { fullName } from '@/api/format';
import Login from '@/screens/Login';
import Home from '@/screens/Home';
import Profile from '@/screens/Profile';
import World from '@/screens/World';
import PatientChat from '@/screens/PatientChat';
import DraftEditor from '@/screens/DraftEditor';
import SearchOverlay from '@/overlays/SearchOverlay';
import PatientContextOverlay from '@/overlays/PatientContextOverlay';
import MenuDrawer, { DRAWER_WIDTH_PCT } from '@/overlays/MenuDrawer';
import AppSettingsOverlay from '@/overlays/AppSettingsOverlay';
import FlowOverlay from '@/overlays/FlowOverlay';
import RecordOverlay from '@/overlays/RecordOverlay';
import VoiceOverlay from '@/overlays/VoiceOverlay';
import AppFrame from '@/components/AppFrame';
import ChatBar from '@/components/ChatBar';
import Toast from '@/components/Toast';
import { useAppState } from '@/state/useAppState';
import { setChromeColor } from '@/ui/chromeColor';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

type User = { email: string; full_name?: string };

// The tagline and the mock home-indicator pill below are preview-only chrome:
// they sell the "phone" look when the app is viewed as a page, and both are
// hidden once installed (className="preview-only", see base.css). Their
// offsets therefore stay bare numbers — they are only ever laid out with the
// safe-area insets at 0.
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

// Task W5.9 — the ChatGPT-style "app peek" push effect. Everything the app
// renders (screens, toast, the other overlays, the ChatBar) lives inside this
// one layer so it can be slid aside as a single card when the menu drawer
// opens; the drawer itself is the only sibling, and sits above it (zIndex 20)
// so its scrim dims the peeking app while its own opaque panel does not.
//
// RTL mirror of ChatGPT: the drawer enters from the RIGHT, so the app travels
// LEFT by exactly the drawer's width — its right edge lands flush against the
// drawer's left edge, leaving the remaining ~14% of the column visible as the
// peek. The large radius (clipped by overflow:hidden) is what turns the app
// into a card; the shadow that separates it from the drawer is cast by the
// drawer panel itself.
//
// zIndex here is what guarantees this is a stacking context in BOTH states, so
// the screens' own zIndex values (0-20) stay contained even while `transform`
// is 'none' — and leaving it at 'none' when closed keeps the layer out of the
// way of descendants' containing blocks and backdrop-filters entirely.
// The background makes the card opaque no matter which screen is inside, so
// the drawer can never show through from underneath.
const pushLayerStyle = (pushed: boolean): CSSProperties => ({
  position: 'absolute',
  inset: 0,
  zIndex: 15,
  overflow: 'hidden',
  background: 'var(--bg-warm)',
  borderRadius: pushed ? 30 : 0,
  transform: pushed ? `translateX(-${DRAWER_WIDTH_PCT}%)` : 'none',
  // Same duration/curve as the drawer panel's own slide, so the two read as
  // one gesture (matches the drSlideIn keyframe it is coordinated with).
  transition: 'transform 0.28s ease, border-radius 0.28s ease',
});

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

// Fallback for an unreachable combination of screen/state (e.g. 'profile' or
// 'world' without an activePatient) — every real screen is built; this just
// keeps the state machine's navigation targets total without dead code paths.
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

function AuthedApp({ user }: { user: User }) {
  const state = useAppState();

  const showChatBar = state.screen !== 'draft';
  // Drives both halves of the drawer gesture: the panel's slide-in and the
  // app content layer's slide-aside (see pushLayerStyle above).
  const menuOpen = state.overlay === 'menu';

  // Wave 4 Issue A: keeps the document background + <meta name="theme-color">
  // in sync with whatever's actually at the top of the current screen/overlay,
  // so the iOS status bar (and any residual sliver around the app frame)
  // never shows a mismatched flat color.
  useEffect(() => {
    setChromeColor(state.screen, state.overlay);
  }, [state.screen, state.overlay]);

  return (
    <AppFrame>
      <div style={pushLayerStyle(menuOpen)}>
        {/* Wave 4 Issue B: keyed on `screen` alone (not overlay/toast/chat
            state) so switching screens fades in instead of hard-swapping,
            while unrelated state updates (a new chat message, the toast
            popping up, chatThinking toggling) re-render this same div in
            place — no key change, no remount, no re-triggered animation. */}
        <div key={state.screen} style={{ animation: 'drFade 0.18s ease' }}>
          {state.screen === 'home' ? (
            <Home
              homeOrb={state.homeOrb}
              onSearch={() => state.open('search')}
              onRecord={() => state.open('record')}
              onMenu={() => state.open('menu')}
              onOrbClick={() => {
                // Task W5.3: iOS only lets audio start from inside a user
                // gesture, and by the time Dror has a reply to speak we are
                // several awaits away from this tap. Priming the shared audio
                // element + AudioContext here, synchronously, before opening
                // the overlay, is what makes the voice loop audible on iPhone.
                unlockAudio();
                state.open('voice');
              }}
            />
          ) : state.screen === 'profile' && state.activePatient ? (
            <Profile
              patient={state.activePatient}
              sessionCount={state.activeSessionCount}
              onOpenSettings={() => state.open('settings')}
              onGoHome={() => state.go('home')}
              onOpenFlow={(type) => state.openFlow(type)}
              onGoWorld={() => state.go('world')}
            />
          ) : state.screen === 'world' && state.activePatient ? (
            <World
              patient={state.activePatient}
              sessionCount={state.activeSessionCount}
              entries={state.entries}
              onGoProfile={() => state.go('profile')}
              onOpenEntry={(entry) => {
                state.setDraft(
                  {
                    id: entry.id,
                    type: entry.type === 'doc' ? 'doc' : 'summary',
                    patientId: state.activePatient!.id,
                    date: entry.entry_date,
                    title: entry.title,
                    body: entry.type === 'rec' ? entry.transcript || entry.body : entry.body,
                  },
                  'world'
                );
                state.go('draft');
              }}
            />
          ) : state.screen === 'chat' ? (
            <PatientChat
              title={
                state.activeChat.patientId && state.activePatient
                  ? `שיחה על ${fullName(state.activePatient)}`
                  : 'שיחה עם דרור'
              }
              messages={state.activeChat.messages}
              thinking={state.chatThinking}
              onBack={state.leaveChat}
            />
          ) : state.screen === 'draft' && state.draft ? (
            <DraftEditor
              draft={state.draft}
              draftFrom={state.draftFrom}
              onBodyChange={(body) => state.setDraft((d) => (d ? { ...d, body } : d))}
              onClose={() => state.closeDraft()}
              onSave={(asDraft) => state.saveDraft(asDraft)}
            />
          ) : (
            <ScreenPlaceholder onHome={() => state.go('home')} />
          )}
        </div>

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

        {state.overlay === 'appSettings' && <AppSettingsOverlay user={user} onClose={() => state.close()} />}

        {state.overlay === 'flow' && state.activePatient && (
          <FlowOverlay
            flowType={state.flowType}
            patient={state.activePatient}
            sessionCount={state.activeSessionCount}
            onClose={() => state.close()}
            onDraftReady={({ title, body }) => {
              state.setDraft({
                id: null,
                type: state.flowType,
                patientId: state.activePatient!.id,
                date: new Date().toISOString(),
                title,
                body,
              });
              state.close();
              state.go('draft');
            }}
            showToast={state.showToast}
          />
        )}

        {state.overlay === 'record' && (
          <RecordOverlay
            patients={state.patients}
            onClose={() => state.close()}
            refreshPatients={state.refreshPatients}
            openPatient={state.openPatient}
            setDraft={state.setDraft}
            goDraft={() => state.go('draft')}
            showToast={state.showToast}
          />
        )}

        {state.overlay === 'voice' && (
          <VoiceOverlay
            patientId={undefined}
            showToast={state.showToast}
            onClose={() => {
              // Mirrors the design mock's goHomeClose (line 726) — voice is
              // only ever opened from Home this week, so closing it always
              // returns there.
              state.go('home');
              state.close();
            }}
          />
        )}

        {showChatBar && (
          <ChatBar
            screen={state.screen}
            activePatientName={state.activePatient ? fullName(state.activePatient) : null}
            onOpenRecord={() => state.open('record')}
            onSend={state.sendChat}
            disabled={state.chatThinking}
            showToast={state.showToast}
            overlayOpen={state.overlay !== null}
          />
        )}

        <div dir="ltr" className="preview-only" style={taglineStyle}>
          The first AI assistant for Israeli psychologists.
        </div>
        <div className="preview-only" style={homeIndicatorStyle} />
      </div>

      {/* Outside the push layer, and the only thing above it: the drawer is
          the surface the app slides aside to reveal. It stays mounted so the
          panel can animate BOTH ways in step with the push (see MenuDrawer). */}
      <MenuDrawer
        open={menuOpen}
        chats={state.chats}
        onClose={() => state.close()}
        onRefreshChats={state.refreshChats}
        onNewChat={() => {
          state.close();
          state.newChat();
        }}
        onOpenSearch={() => state.open('search')}
        onOpenChat={(chat) => {
          state.close();
          state.openChat(chat);
        }}
        onOpenSettings={() => state.open('appSettings')}
      />

      {/* Outside the push layer too, and above everything (Toast.tsx zIndex
          25): a toast must stay on screen wherever it is raised from. Inside
          the layer it would ride the drawer's 86% slide off to the left —
          and the drawer's own open triggers refreshChats, whose failure path
          is a toast. */}
      {state.toast && <Toast text={state.toast} />}
    </AppFrame>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Mounted once here so it's active across every state this component can
  // render — the loading spinner, Login, and AuthedApp — rather than
  // scoped to any one of them.
  useKeyboardInset();

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

  // Wave 4 Issue A: pre-auth (loading spinner or Login) is always the flat
  // warm background — AuthedApp's own effect takes over the moment `user`
  // is set and it mounts.
  useEffect(() => {
    if (!user) setChromeColor('login', null);
  }, [user]);

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

  return <AuthedApp user={user} />;
}
