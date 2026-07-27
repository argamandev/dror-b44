import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Screen } from '@/state/useAppState';
import { useDictation } from '@/hooks/useDictation';
import { fullName } from '@/api/format';
import type { Patient } from '@/api/data';
import { uploadPrivateDoc, createPatientDoc, type UploadedDoc } from '@/api/docs';
import { checkDocFile, type DocFileRejection } from '@/api/docFile';
import type { ChatDoc } from '@/state/docPrefix';
import ActionSheet, { type SheetRow } from '@/components/ActionSheet';

// Ported verbatim from the design mock (lines 200-218). Visible on every
// screen except 'draft' (caller decides whether to render it at all).
// Send dispatches to the real Dror agent via `onSend` (state.sendChat); the
// screen tells us whether this is a home (general) send or a patient send.
interface ChatBarProps {
  screen: Screen;
  activePatientName: string | null;
  onOpenRecord: () => void;
  onSend: (text: string, fromHome: boolean, doc?: ChatDoc | null) => void;
  /** Every patient of the therapist — the picker list for a general-chat upload. */
  patients: Patient[];
  /**
   * The patient this chat is scoped to ('' for a general/home chat), derived
   * once in useAppState with the same rule sendChat uses (deriveChatScope) so
   * an uploaded document can never land on a different patient than the one
   * the conversation is actually about.
   */
  scopePatientId: string;
  /** True while a reply is in flight — blocks new sends but keeps the input editable. */
  disabled?: boolean;
  /** App-level compact toast — used for dictation failures (Task W5.4: mic errors, transcription failures). */
  showToast: (text: string) => void;
  /**
   * True whenever ANY overlay is open (record, voice, search, menu,
   * settings/patient-context, flow, app settings) — ChatBar stays mounted
   * underneath every one of them, so this is what stops an active dictation
   * from running invisibly behind a full-screen overlay (fix round 1,
   * Important 3). Not scoped to individual overlays: `state.overlay !== null`
   * covers every entry uniformly, with no per-overlay special-casing.
   */
  overlayOpen: boolean;
}

// The bar's own height, shared with the chip that floats just above it.
const BAR_HEIGHT = 105;

const barStyle: CSSProperties = {
  position: 'absolute',
  left: 15,
  right: 15,
  // --chatbar-bottom (tokens.css) is max(44px, safe-area-inset-bottom): the
  // mock's 44px margin normally, widened to the home-indicator inset if that
  // is ever larger, so the bar never floats over the indicator (Task W5.8).
  // Grows by --kb-inset (useKeyboardInset.ts) on top of that so the iOS
  // on-screen keyboard — which doesn't shrink the layout viewport — never
  // covers the bar; the transition below makes it glide with the keyboard
  // instead of jumping.
  bottom: 'calc(var(--chatbar-bottom) + var(--kb-inset, 0px))',
  height: BAR_HEIGHT,
  zIndex: 6,
  background: '#ffffff',
  borderRadius: 26,
  boxShadow: '0 10px 30px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)',
  padding: '15px 16px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  boxSizing: 'border-box',
  transition: 'bottom 0.2s ease',
};

const inputStyle: CSSProperties = {
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 15,
  color: '#17171b',
  width: '100%',
  textAlign: 'right',
};

const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const leftIconsStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14 };
const iconBtn: CSSProperties = { width: 24, height: 24, cursor: 'pointer' };

// Task W5.4: while dictation is listening/recording, the mic button pulses
// in accent indigo — reuses base.css's existing drBreathe keyframe (already
// used for VoiceOverlay's orb halo) rather than introducing a new animation.
const micBtnActive: CSSProperties = { ...iconBtn, animation: 'drBreathe 1.6s ease-in-out infinite' };
// Transcription in flight (recorded engine only) — a subtle busy state; there
// is nothing left to toggle until it resolves.
const micBtnPending: CSSProperties = { ...iconBtn, opacity: 0.5, pointerEvents: 'none' };
const sendBtn: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: '#17171b',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const sendBtnDisabled: CSSProperties = {
  ...sendBtn,
  opacity: 0.4,
  cursor: 'default',
  pointerEvents: 'none',
};

// Task W5.6 — the document chip: upload progress, the "saved with X"
// confirmation, or a document held for this conversation only. It floats just
// above the bar (never inside it — the bar's height is fixed by the mock) and
// rides the same keyboard inset, so it can't collide with the input's own
// states (including W5.4's 'מתמלל…' placeholder).
const chipWrapStyle: CSSProperties = {
  position: 'absolute',
  left: 15,
  right: 15,
  bottom: `calc(var(--chatbar-bottom) + var(--kb-inset, 0px) + ${BAR_HEIGHT + 8}px)`,
  zIndex: 6,
  display: 'flex',
  justifyContent: 'flex-end',
  transition: 'bottom 0.2s ease',
  pointerEvents: 'none',
};

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  maxWidth: '100%',
  padding: '7px 14px',
  borderRadius: 999,
  background: '#ffffff',
  boxShadow: '0 6px 18px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)',
  fontSize: 13,
  color: '#17171b',
  animation: 'drRise 0.2s ease',
  pointerEvents: 'auto',
};

const chipTextStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// Padding + matching negative margin: a finger-sized tap target around a
// 13px glyph, without inflating the chip itself.
const chipRemoveStyle: CSSProperties = {
  display: 'flex',
  cursor: 'pointer',
  flex: 'none',
  padding: 6,
  margin: -6,
};

// Only the file kinds a therapist actually photographs or receives.
const FILE_ACCEPT = '.pdf,image/*';

const CHAT_ONLY_KEY = '__chat_only__';

const UPLOAD_ERROR = 'העלאת המסמך לא הצליחה, נסו שוב';
const SAVE_ERROR = 'שגיאה בשמירה, נסו שוב';
// Honest: the file IS stored (privately) — only its content couldn't be read.
const EXTRACT_FAILED = 'המסמך נשמר, אך לא הצלחנו לקרוא את תוכנו';
const EXTRACT_FAILED_CHAT = 'לא הצלחנו לקרוא את תוכן המסמך — אין מה לצרף לשיחה';

// Why a picked file was refused before it ever reached private storage.
const REJECTION_TOAST: Record<DocFileRejection, string> = {
  type: 'אפשר להעלות קובץ PDF או תמונה בלבד',
  size: 'הקובץ גדול מדי — אפשר להעלות עד 20MB',
  empty: 'הקובץ ריק, נסו לבחור אותו שוב',
};

const STAGE_LABEL: Record<'uploading' | 'reading' | 'saving', string> = {
  uploading: 'מעלה…',
  reading: 'קורא את המסמך…',
  saving: 'שומר…',
};

// The + used to open the recording overlay directly (W5.4 and earlier). W5.6
// makes it the upload entry point, so recording moves here — still one tap
// from the same button, never removed.
const ADD_ROWS: SheetRow[] = [
  { key: 'doc', label: 'העלאת מסמך', sub: 'PDF או תמונה' },
  { key: 'record', label: 'הקלטת פגישה' },
];

export default function ChatBar({
  screen,
  activePatientName,
  onOpenRecord,
  onSend,
  patients,
  scopePatientId,
  disabled = false,
  showToast,
  overlayOpen,
}: ChatBarProps) {
  const [text, setText] = useState('');
  // Read by useDictation's async callbacks (a recognition event, a
  // transcription round-trip) so they always append onto the CURRENT input
  // value rather than whatever it was when dictation started.
  const textRef = useRef(text);
  textRef.current = text;

  // Task W5.4 — dictation into this input, separate from the orb's voice
  // conversation (VoiceOverlay/useVoiceChat, opened from Home's orb only).
  const dictation = useDictation({
    getValue: () => textRef.current,
    setValue: setText,
    onError: showToast,
  });

  // Fix round 1 (Important 3): any overlay opening (record/voice/search/
  // menu/settings/patient-context/flow — everything that shares `state.overlay`)
  // must not leave this mic listening invisibly underneath it. 'drop' — not
  // the default 'commit' — since the user didn't consciously end their own
  // dictation; nothing captured so far should surface later either.
  useEffect(() => {
    if (overlayOpen) dictation.stop('drop');
    // dictation.stop is a fresh function every render (not memoized) — only
    // react to overlayOpen actually changing, not to every ChatBar re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayOpen]);

  // ---- Task W5.6: document upload from the + button ----

  const [sheet, setSheet] = useState<null | 'add' | 'assign'>(null);
  const [stage, setStage] = useState<null | 'uploading' | 'reading' | 'saving'>(null);
  // Document attached to this conversation only (never persisted) — carried
  // into the next message by composeDocMessage (src/state/docPrefix.ts).
  const [chatDoc, setChatDoc] = useState<ChatDoc | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // A finished upload waiting for the therapist to say who it belongs to.
  const pendingUploadRef = useRef<UploadedDoc | null>(null);
  // Invalidates in-flight continuations: bumped when a new upload starts and
  // on unmount, so a slow upload/extract/create can never write state for a
  // ChatBar that has moved on (or is gone — the bar unmounts on the draft
  // screen). Same discipline as useDictation's generation ref (W5.4).
  const uploadGenRef = useRef(0);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      uploadGenRef.current += 1;
      clearTimeout(savedTimer.current);
    },
    []
  );

  const placeholder = dictation.pending
    ? 'מתמלל…'
    : screen === 'home'
      ? 'תיצור לי מסמך אינטייק על @אלון'
      : activePatientName
        ? `על מה אני ו${activePatientName} דיברנו בפגישה הקודמת?`
        : 'כתוב לדרור…';

  const handleChange = (next: string) => {
    setText(next);
    // Fix round 1 (Critical 2): re-anchor onto the manual edit so the next
    // interim/final builds on top of it instead of clobbering it.
    if (dictation.active) dictation.syncAnchor(next);
  };

  const handleSend = () => {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    // Fix round 1 (Critical 1): 'drop', not the default 'commit' — a send is
    // not the user consciously ending their own dictation, so nothing
    // captured up to now (a trailing live result, a still-in-flight
    // transcription) may land in the input after this message is gone.
    dictation.stop('drop');
    // Task W5.6: a document held "רק לשיחה הזאת" rides along with this one
    // message and is then released, whether or not the send succeeds — it is
    // conversational context, not a queued attachment.
    onSend(trimmed, screen === 'home', chatDoc);
    setChatDoc(null);
    setText('');
  };

  const confirmSaved = (patientName: string) => {
    setSavedNote(`נשמר אצל ${patientName}`);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedNote(null), 2600);
  };

  const attachToPatient = async (upload: UploadedDoc, patient: Patient, gen: number) => {
    setStage('saving');
    try {
      await createPatientDoc({
        patient_id: patient.id,
        title: upload.title,
        file_uri: upload.fileUri,
        extracted_text: upload.text,
        doc_date: new Date().toISOString(),
      });
    } catch {
      if (uploadGenRef.current !== gen) return;
      setStage(null);
      showToast(SAVE_ERROR);
      return;
    }
    if (uploadGenRef.current !== gen) return;
    setStage(null);
    if (upload.extractionFailed) showToast(EXTRACT_FAILED);
    confirmSaved(fullName(patient));
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    // The picker's accept= is advisory (Android/desktop offer "All files"), so
    // the real gate is here — nothing unsupported or oversized ever reaches
    // private storage (review round 1, Important 2).
    const rejection = checkDocFile(file);
    if (rejection) {
      showToast(REJECTION_TOAST[rejection]);
      return;
    }
    // Bumping the generation supersedes any upload still in flight: its
    // continuations all return early, so a second pick can never race the
    // first into the chip — or into a PatientDoc record.
    const gen = (uploadGenRef.current += 1);
    pendingUploadRef.current = null;

    let upload: UploadedDoc;
    try {
      upload = await uploadPrivateDoc(file, (s) => {
        if (uploadGenRef.current === gen) setStage(s);
      });
    } catch {
      if (uploadGenRef.current !== gen) return;
      setStage(null);
      showToast(UPLOAD_ERROR);
      return;
    }
    if (uploadGenRef.current !== gen) return;

    // In a patient-scoped chat the document belongs to that patient, full stop.
    const scoped = scopePatientId ? patients.find((p) => p.id === scopePatientId) : undefined;
    if (scoped) {
      await attachToPatient(upload, scoped, gen);
      return;
    }
    // General chat: ask who it belongs to (or nobody — just this conversation).
    setStage(null);
    pendingUploadRef.current = upload;
    // The picker covers the bar just like the add sheet did, and dictation may
    // have been restarted while the upload ran — same 'commit' teardown.
    dictation.stop('commit');
    setSheet('assign');
  };

  const handleAddPick = (key: string) => {
    setSheet(null);
    if (key === 'record') {
      onOpenRecord();
      return;
    }
    // Opening the OS file picker from inside the click handler keeps it a
    // direct consequence of the tap (Safari refuses a detached .click()).
    fileInputRef.current?.click();
  };

  const handleAssignPick = (key: string) => {
    setSheet(null);
    const upload = pendingUploadRef.current;
    pendingUploadRef.current = null;
    if (!upload) return;

    if (key === CHAT_ONLY_KEY) {
      if (!upload.text) {
        showToast(EXTRACT_FAILED_CHAT);
        return;
      }
      setChatDoc({ title: upload.title, text: upload.text });
      return;
    }
    const patient = patients.find((p) => p.id === key);
    if (!patient) return;
    attachToPatient(upload, patient, (uploadGenRef.current += 1));
  };

  // Dismissing the picker drops the upload: nothing is recorded against a
  // patient, and the private file stays unreferenced.
  const handleSheetClose = () => {
    setSheet(null);
    pendingUploadRef.current = null;
  };

  const openAddSheet = () => {
    // The sheet covers the input; 'commit' (not 'drop') so anything already
    // dictated is kept in the box rather than silently lost.
    dictation.stop('commit');
    setSheet('add');
  };

  const assignRows: SheetRow[] = [
    { key: CHAT_ONLY_KEY, label: 'רק לשיחה הזאת', sub: 'לא יישמר אצל מטופל' },
    ...patients.map((p) => ({ key: p.id, label: fullName(p) })),
  ];

  const chip = stage
    ? { text: STAGE_LABEL[stage], removable: false }
    : savedNote
      ? { text: savedNote, removable: false }
      : chatDoc
        ? { text: chatDoc.title, removable: true }
        : null;

  return (
    <>
      {/* The sheets are siblings of the bar, not children: they are absolutely
          positioned against the same app layer the bar sits in. */}
      {sheet === 'add' && (
        <ActionSheet
          title="מה להוסיף?"
          rows={ADD_ROWS}
          onPick={handleAddPick}
          onClose={handleSheetClose}
        />
      )}
      {sheet === 'assign' && (
        <ActionSheet
          title="למי שייך המסמך?"
          rows={assignRows}
          onPick={handleAssignPick}
          onClose={handleSheetClose}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset first, so picking the same file twice in a row still fires.
          e.target.value = '';
          handleFile(file);
        }}
        style={{ display: 'none' }}
      />

      {chip && (
        <div style={chipWrapStyle}>
          <div dir="rtl" style={chipStyle}>
            <span style={chipTextStyle}>{chip.text}</span>
            {chip.removable && (
              <span onClick={() => setChatDoc(null)} title="הסרה" style={chipRemoveStyle}>
                <svg viewBox="0 0 24 24" fill="none" width={13} height={13}>
                  <path d="M6 6l12 12M18 6L6 18" stroke="#9a9ca1" strokeWidth={2.4} strokeLinecap="round" />
                </svg>
              </span>
            )}
          </div>
        </div>
      )}

      <div style={barStyle}>
        <input
          dir="rtl"
          placeholder={placeholder}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          style={inputStyle}
        />
        <div dir="ltr" style={rowStyle}>
          <div style={leftIconsStyle}>
            {/* Task W5.6: + is now "add something to this conversation" — a
                document upload, or the session recording it used to open
                directly (kept one tap away as the sheet's second row). */}
            <div onClick={openAddSheet} title="הוספה" className="pressable" style={iconBtn}>
              <svg viewBox="0 0 24 24" fill="none" width={24} height={24}>
                <path d="M12 5v14M5 12h14" stroke="#17171b" strokeWidth={2} strokeLinecap="round" />
              </svg>
            </div>
            {/* Task W5.4: dictation into the input — tap speaks Hebrew into the
                text, tap again stops. Separate from the orb's voice
                conversation (Home's center orb → VoiceOverlay), which this
                button never opens. */}
            <div
              onClick={dictation.toggle}
              title={dictation.active ? 'עצירת הכתבה' : 'הכתבה קולית'}
              className="pressable"
              style={dictation.pending ? micBtnPending : dictation.active ? micBtnActive : iconBtn}
            >
              <svg viewBox="0 0 24 24" fill="none" width={24} height={24}>
                <rect
                  x={8}
                  y={2}
                  width={8}
                  height={13}
                  rx={4}
                  stroke={dictation.active ? '#6B71F6' : '#17171b'}
                  strokeWidth={2}
                />
                <path
                  d="M5 11a7 7 0 0014 0"
                  stroke={dictation.active ? '#6B71F6' : '#17171b'}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <path
                  d="M12 18v3"
                  stroke={dictation.active ? '#6B71F6' : '#17171b'}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
          <div
            onClick={disabled ? undefined : handleSend}
            title="שליחה"
            aria-disabled={disabled}
            className="pressable"
            style={disabled ? sendBtnDisabled : sendBtn}
          >
            <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
              <path
                d="M12 19V5M12 5l-6 6M12 5l6 6"
                stroke="#ffffff"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}
