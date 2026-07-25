import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createEntry,
  listChats,
  listEntries,
  listPatients,
  updateEntry,
  type Chat,
  type Entry,
  type Patient,
} from '@/api/data';
import { fullName, sessionCount } from '@/api/format';

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

const LOAD_ERROR = 'שגיאה בטעינה, נסו לרענן';
const SAVE_ERROR = 'שגיאה בשמירה, נסו שוב';

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
  const [toast, setToast] = useState<string | null>(null);
  const [homeOrb, setHomeOrb] = useState<'idle' | 'thinking'>('idle');

  // Mirrors activeId synchronously so refreshEntries() can read the current
  // patient right after openPatient/saveDraft change it, without waiting for
  // a re-render to flow the new value back through the closure.
  const activeIdRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setActiveIdBoth = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
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

  const openPatient = useCallback(
    async (id: string) => {
      setActiveIdBoth(id);
      await refreshEntries();
      setScreen('profile');
    },
    [setActiveIdBoth, refreshEntries]
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
    toast,
    activePatient,
    activeSessionCount,
    homeOrb,
    setHomeOrb,
    go,
    open,
    close,
    openPatient,
    refreshPatients,
    refreshEntries,
    refreshChats,
    setDraft,
    showToast,
    saveDraft,
  };
}
