import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createChat,
  createEntry,
  listChats,
  listEntries,
  listPatients,
  updateChat,
  updateEntry,
  type Chat,
  type ChatMsg,
  type Entry,
  type Patient,
} from '@/api/data';
import { askDror } from '@/api/ai';
import { fullName, sessionCount } from '@/api/format';
import { deriveChatScope, type LiveChatLike } from '@/state/chatScope';

export type Screen = 'home' | 'profile' | 'world' | 'chat' | 'draft';
export type Overlay = null | 'menu' | 'search' | 'record' | 'voice' | 'flow' | 'settings' | 'appSettings';

export interface Draft {
  id: string | null;
  type: 'summary' | 'doc';
  patientId: string;
  date: string;
  title: string;
  body: string;
}

// The live conversation the 'chat' screen renders. `id` is our Chat entity
// (the MenuDrawer history record); `conversationId` is the resumable Base44
// agent conversation. `patientId` is '' for a general (home) chat.
export interface ActiveChat {
  id: string | null;
  conversationId: string | null;
  patientId: string;
  messages: ChatMsg[];
}

const EMPTY_CHAT: ActiveChat = { id: null, conversationId: null, patientId: '', messages: [] };

const LOAD_ERROR = 'שגיאה בטעינה, נסו לרענן';
const SAVE_ERROR = 'שגיאה בשמירה, נסו שוב';
const ASK_ERROR = 'דרור לא הצליח לענות, נסו שוב';

// Single source of truth for screen/overlay/data state. Mirrors the design
// mock's state machine (mock lines 562-590, transitions around 653-730).
export function useAppState() {
  const [screen, setScreen] = useState<Screen>('home');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [flowType, setFlowType] = useState<Draft['type']>('summary');
  const [toast, setToast] = useState<string | null>(null);
  const [homeOrb, setHomeOrb] = useState<'idle' | 'thinking'>('idle');
  const [activeChat, setActiveChat] = useState<ActiveChat>(EMPTY_CHAT);
  const [chatThinking, setChatThinking] = useState(false);

  // Mirrors activeId synchronously so refreshEntries() can read the current
  // patient right after openPatient/saveDraft change it, without waiting for
  // a re-render to flow the new value back through the closure.
  const activeIdRef = useRef<string | null>(null);
  // Same idea for the live chat — sendChat reads/continues it across awaits.
  const activeChatRef = useRef<ActiveChat>(EMPTY_CHAT);
  // Mirrors chatThinking synchronously so sendChat can guard against a second
  // send firing while an agent reply is still in flight (state updates aren't
  // visible mid-closure across the awaits in the first send).
  const chatThinkingRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setActiveIdBoth = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const setActiveChatBoth = useCallback((c: ActiveChat) => {
    activeChatRef.current = c;
    setActiveChat(c);
  }, []);

  const setChatThinkingBoth = useCallback((v: boolean) => {
    chatThinkingRef.current = v;
    setChatThinking(v);
  }, []);

  const showToast = useCallback((text: string) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const refreshPatients = useCallback(async () => {
    try {
      setPatients(await listPatients());
    } catch {
      showToast(LOAD_ERROR);
    }
  }, [showToast]);

  const refreshChats = useCallback(async () => {
    try {
      setChats(await listChats());
    } catch {
      showToast(LOAD_ERROR);
    }
  }, [showToast]);

  const refreshEntries = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) {
      setEntries([]);
      return;
    }
    try {
      const result = await listEntries(id);
      if (activeIdRef.current !== id) return;
      setEntries(result);
    } catch {
      showToast(LOAD_ERROR);
    }
  }, [showToast]);

  useEffect(() => {
    refreshPatients();
    refreshChats();
    // Load-on-mount only — refreshPatients/refreshChats are stable (useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback((s: Screen) => setScreen(s), []);
  const open = useCallback((o: Overlay) => setOverlay(o), []);
  const close = useCallback(() => setOverlay(null), []);

  // Profile's two "יצירת..." buttons both open the flow overlay, differing
  // only in which path it starts on (mock's startFlow, line 669).
  const openFlow = useCallback(
    (type: Draft['type']) => {
      setFlowType(type);
      setOverlay('flow');
    },
    []
  );

  const openPatient = useCallback(
    async (id: string) => {
      setActiveIdBoth(id);
      // Opening a patient's world starts a fresh conversational context, the
      // same way the mock's goProfile clears chatMsgs (mock line 727).
      setActiveChatBoth(EMPTY_CHAT);
      setChatThinkingBoth(false);
      await refreshEntries();
      setScreen('profile');
    },
    [setActiveIdBoth, setActiveChatBoth, refreshEntries]
  );

  const saveDraft = useCallback(
    async (asDraft: boolean) => {
      if (!draft) return;
      const title = asDraft && !draft.title.includes('(טיוטה)') ? `${draft.title} (טיוטה)` : draft.title;
      try {
        if (draft.id) {
          await updateEntry(draft.id, { body: draft.body, title, is_draft: asDraft });
        } else {
          await createEntry({
            patient_id: draft.patientId,
            type: draft.type,
            title,
            entry_date: draft.date,
            body: draft.body,
            is_draft: asDraft,
            duration_seconds: 0,
            transcript: '',
          });
        }
      } catch {
        showToast(SAVE_ERROR);
        return;
      }
      const p = patients.find((pt) => pt.id === draft.patientId);
      setActiveIdBoth(draft.patientId);
      setDraft(null);
      setScreen('profile');
      showToast((asDraft ? 'הטיוטה נשמרה בעולם של ' : 'המסמך נשמר בעולם של ') + (p ? fullName(p) : ''));
      await refreshEntries();
    },
    [draft, patients, showToast, setActiveIdBoth, refreshEntries]
  );

  // Send a message to the Dror agent. `fromHome` is passed by the ChatBar (which
  // knows the current screen): a home send stays on Home with the orb thinking
  // until the reply lands, then opens the general chat; a patient send opens the
  // chat immediately with a thinking bubble. Mirrors mock sendChat (lines 690-704)
  // but the reply is the real agent, and each exchange is persisted as a Chat.
  const sendChat = useCallback(
    async (raw: string, fromHome: boolean) => {
      // Concurrent-send guard: while a reply is in flight, sends are inert.
      // Uses the ref (not the `chatThinking` state) because state updates
      // from the in-flight send aren't visible in this closure until a
      // re-render — the ref is written synchronously below and on resolve.
      if (chatThinkingRef.current) return;

      const text = raw.trim();
      if (!text) return;

      // Engage the guard for BOTH branches — a home send is just as capable of
      // racing a second send (and a second agent conversation, since no
      // conversationId exists yet) as a patient/chat-screen send is. homeOrb
      // still separately drives the Home orb's own thinking visual below.
      setChatThinkingBoth(true);

      // The live chat on screen (if any) is the source of truth for scope —
      // follow-ups always continue that chat, regardless of a leftover
      // activeId from a previously-viewed patient. Only a brand-new chat
      // (nothing live yet) falls back to fromHome/activeId.
      const cur = activeChatRef.current;
      const live: LiveChatLike = { patientId: cur.patientId, started: !!(cur.id || cur.messages.length) };
      const patientId = deriveChatScope(fromHome, live, activeIdRef.current);
      const patient = patients.find((p) => p.id === patientId) ?? null;
      const patientName = patient ? fullName(patient) : undefined;
      const userMsg: ChatMsg = { role: 'user', text, ts: new Date().toISOString() };

      // Continuing the open conversation is exactly the "live" case above —
      // deriveChatScope already guarantees patientId === cur.patientId then.
      const continuing = live.started;
      const base: ActiveChat = continuing ? cur : { ...EMPTY_CHAT, patientId };
      const withUser: ActiveChat = { ...base, messages: [...base.messages, userMsg] };
      setActiveChatBoth(withUser);

      if (fromHome) {
        setHomeOrb('thinking');
      } else {
        setScreen('chat');
      }

      let answer: string;
      let conversationId: string;
      try {
        const res = await askDror({
          message: text,
          patientId: patientId || undefined,
          patientName,
          conversationId: withUser.conversationId || undefined,
        });
        answer = res.answer;
        conversationId = res.conversationId;
      } catch {
        setHomeOrb('idle');
        setChatThinkingBoth(false);
        setScreen('chat'); // keep the user's message visible even on failure
        showToast(ASK_ERROR);
        return;
      }

      setHomeOrb('idle');
      setChatThinkingBoth(false);

      // Stale guard: if the user navigated away or switched chats while the
      // agent was thinking, don't yank them back — just persist the exchange.
      const stale = activeChatRef.current !== withUser;

      const drorMsg: ChatMsg = { role: 'dror', text: answer, ts: new Date().toISOString() };
      const shown: ActiveChat = {
        ...withUser,
        conversationId,
        messages: [...withUser.messages, drorMsg],
      };
      if (!stale) {
        setActiveChatBoth(shown);
        setScreen('chat');
        // The agent may have created a draft Entry (action request). Refresh this
        // patient's entries so the new draft shows up in their World.
        if (patientId) refreshEntries();
      }

      // Persist to our Chat entity (the MenuDrawer history record). Non-fatal:
      // the reply is already on screen if this fails.
      try {
        if (shown.id) {
          await updateChat(shown.id, { messages: shown.messages, conversation_id: conversationId });
        } else {
          const created = await createChat({
            title: text.slice(0, 40),
            patient_id: patientId,
            conversation_id: conversationId,
            messages: shown.messages,
          });
          // Only adopt the new id into live state if the user is still here.
          if (!stale && activeChatRef.current === shown) setActiveChatBoth({ ...shown, id: created.id });
        }
        await refreshChats();
      } catch {
        showToast(SAVE_ERROR);
      }
    },
    [patients, setActiveChatBoth, setChatThinkingBoth, setHomeOrb, showToast, refreshChats, refreshEntries]
  );

  // Open a chat from the MenuDrawer history: load its messages, resume its agent
  // conversation, and restore patient context so the header + chat bar work.
  const openChat = useCallback(
    async (chat: Chat) => {
      const patientId = chat.patient_id || '';
      if (patientId) {
        setActiveIdBoth(patientId);
        await refreshEntries();
      } else {
        setActiveIdBoth(null);
      }
      setActiveChatBoth({
        id: chat.id,
        conversationId: chat.conversation_id || null,
        patientId,
        messages: chat.messages ?? [],
      });
      setChatThinkingBoth(false);
      setScreen('chat');
    },
    [setActiveIdBoth, setActiveChatBoth, refreshEntries]
  );

  // Leave the chat screen (back arrow): return to the patient's profile, or Home
  // for a general chat, clearing the conversation (mock goProfile, line 727).
  const leaveChat = useCallback(() => {
    const pid = activeChatRef.current.patientId;
    setActiveChatBoth(EMPTY_CHAT);
    setChatThinkingBoth(false);
    setScreen(pid && activeIdRef.current ? 'profile' : 'home');
  }, [setActiveChatBoth]);

  // "שיחה חדשה" from the menu: drop any open chat and go Home.
  const newChat = useCallback(() => {
    setActiveChatBoth(EMPTY_CHAT);
    setChatThinkingBoth(false);
    setActiveIdBoth(null);
    setScreen('home');
  }, [setActiveChatBoth, setActiveIdBoth]);

  const activePatient = patients.find((p) => p.id === activeId) ?? null;
  const activeSessionCount = sessionCount(entries);

  return {
    screen,
    overlay,
    activeId,
    patients,
    entries,
    chats,
    draft,
    flowType,
    toast,
    activePatient,
    activeSessionCount,
    homeOrb,
    setHomeOrb,
    activeChat,
    chatThinking,
    go,
    open,
    close,
    openFlow,
    openPatient,
    refreshPatients,
    refreshEntries,
    refreshChats,
    setDraft,
    showToast,
    saveDraft,
    sendChat,
    openChat,
    leaveChat,
    newChat,
  };
}
