import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createEntry, createPatient, type Patient } from '@/api/data';
import { fullName, fmtTimer } from '@/api/format';
import {
  useSessionRecorder,
  TRANSCRIPT_UNAVAILABLE_NOTICE,
  TRANSCRIBING_NOTICE,
  RECORDED_TRANSCRIPTION_FAILED_TOAST,
} from '@/hooks/useSessionRecorder';
import { getMicGuidance } from '@/hooks/micCopy';

// Ported verbatim from the design mock (lines 224-278, semantics 709/731-752).
// Recording starts the instant the overlay opens (mock's openRecord, line
// 709) — there is no method choice like FlowOverlay's step 1. "סיום" stops
// the recorder and moves to an assign-to-patient phase that mirrors
// SearchOverlay's search/inline-create UI almost exactly; the row sub-label
// here is "שיוך ההקלטה" rather than a session count, since patient session
// counts aren't loaded for this list (avoids an N+1 load just for a label).
// Assigning (existing or freshly-created patient) saves the recording as a
// `rec` Entry, then — when there is a transcript to work from — hands it to
// the patient's own summary flow (FlowOverlay, seeded at its guide step), so
// a recording started from the home orb ends in exactly the same structured
// summary as one started from the patient's profile, through the same code.
// An empty transcript (unsupported browser, or a mic error that still got
// assigned) just saves the entry and returns to the profile.
type RecordPhase = 'rec' | 'assign';

interface RecordOverlayProps {
  patients: Patient[];
  onClose: () => void;
  refreshPatients: () => Promise<void>;
  openPatient: (id: string) => Promise<void>;
  /** Opens the patient's summary flow with the recorded transcript as its source. */
  startSummaryFlow: (source: string) => void;
  showToast: (text: string) => void;
}

const SAVE_ERROR = 'שגיאה בשמירה, נסו שוב';

const backdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 20,
  background: 'rgba(23,23,27,0.62)',
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

// -- rec phase --
const statusTextStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--top-inset) + 124px)',
  left: 36,
  right: 36,
  textAlign: 'center',
  fontSize: 15.5,
  lineHeight: 1.6,
  color: 'rgba(255,255,255,0.92)',
  fontWeight: 400,
  animation: 'drRise 0.35s ease',
  zIndex: 2,
};

const recContentStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 34,
  // inset:0 keeps the backdrop full-bleed; the insets pad this content box so
  // the timer/controls stay centred in the *visible* area (Task W5.8).
  paddingTop: 'var(--top-inset)',
  paddingBottom: 'calc(var(--bottom-inset) + 60px)',
  animation: 'drRise 0.35s ease',
};

const timerStyle: CSSProperties = {
  fontSize: 36,
  fontWeight: 300,
  color: '#ffffff',
  letterSpacing: '0.06em',
  fontVariantNumeric: 'tabular-nums',
};

const controlsRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 };
const toggleBtnStyle: CSSProperties = {
  width: 58,
  height: 58,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.14)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
const pausedIndicatorStyle: CSSProperties = { width: 18, height: 18, borderRadius: 4, background: '#ffffff' };
const finishBtnStyle: CSSProperties = {
  height: 58,
  padding: '0 34px',
  border: 'none',
  borderRadius: 999,
  background: '#ffffff',
  color: '#17171b',
  fontSize: 16.5,
  fontWeight: 600,
  cursor: 'pointer',
};

const micErrorWrapStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 40px',
};
const micErrorContentStyle: CSSProperties = { textAlign: 'center', maxWidth: 320 };
const micErrorHeadlineStyle: CSSProperties = {
  fontFamily: 'Calibri,Assistant,sans-serif',
  fontSize: 17,
  fontWeight: 600,
  color: '#ffffff',
  lineHeight: 1.5,
};
const micErrorStepsStyle: CSSProperties = { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 };
const micErrorStepRowStyle: CSSProperties = {
  fontSize: 14,
  color: 'rgba(255,255,255,0.75)',
  lineHeight: 1.5,
};
const micRetryBtnStyle: CSSProperties = {
  marginTop: 22,
  height: 46,
  padding: '0 28px',
  border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.14)',
  color: '#ffffff',
  fontSize: 14.5,
  fontWeight: 600,
  cursor: 'pointer',
};
// Wave 4 Issue C: small, muted, non-blocking — recording continues underneath it.
const transcriptUnavailableTextStyle: CSSProperties = {
  fontSize: 12.5,
  color: 'rgba(255,255,255,0.55)',
  textAlign: 'center',
  lineHeight: 1.5,
  padding: '0 24px',
};

// -- assign phase (mirrors SearchOverlay's panel almost exactly) --
const panelStyle: CSSProperties = {
  position: 'absolute',
  left: 26,
  right: 26,
  top: 'calc(var(--top-inset) + 150px)',
  animation: 'drRise 0.35s ease',
};

const titleStyle: CSSProperties = {
  fontFamily: 'Calibri,Assistant,sans-serif',
  fontSize: 22,
  fontWeight: 400,
  color: '#ffffff',
  textAlign: 'center',
};

const inputWrapStyle: CSSProperties = {
  marginTop: 20,
  background: '#ffffff',
  borderRadius: 18,
  padding: '13px 18px',
  boxShadow: '0 14px 34px rgba(0,0,0,0.25)',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const inputStyle: CSSProperties = {
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 15.5,
  color: '#17171b',
  width: '100%',
  textAlign: 'right',
};

const resultsWrapStyle: CSSProperties = {
  marginTop: 10,
  background: '#ffffff',
  borderRadius: 22,
  padding: 8,
  boxShadow: '0 14px 34px rgba(0,0,0,0.25)',
  maxHeight: 280,
  overflowY: 'auto',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '13px 14px',
  borderRadius: 14,
  cursor: 'pointer',
};

const rowNameStyle: CSSProperties = { fontSize: 16, fontWeight: 600, color: '#17171b' };
const rowSubStyle: CSSProperties = { fontSize: 13, color: '#9a9ca1' };

const noMatchWrapStyle: CSSProperties = { padding: '10px 14px 12px' };
const noMatchLabelStyle: CSSProperties = { fontSize: 13.5, color: '#9a9ca1', marginBottom: 10 };
const addRowStyle: CSSProperties = { display: 'flex', gap: 8 };
const addInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: 'none',
  outline: 'none',
  background: '#f5f4f6',
  borderRadius: 14,
  padding: '12px 14px',
  fontSize: 14.5,
  color: '#17171b',
  textAlign: 'right',
};
const addBtnStyle: CSSProperties = {
  marginTop: 10,
  width: '100%',
  height: 48,
  border: 'none',
  borderRadius: 999,
  background: '#17171b',
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};

// -- transcribing state (mirrors FlowOverlay's generating panel) --
const generatingWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 22,
  padding: '60px 0 10px',
  marginTop: 140,
};
const generatingTextStyle: CSSProperties = {
  fontFamily: 'Calibri,Assistant,sans-serif',
  fontSize: 16.5,
  fontWeight: 600,
  color: '#ffffff',
};

export default function RecordOverlay({
  patients,
  onClose,
  refreshPatients,
  openPatient,
  startSummaryFlow,
  showToast,
}: RecordOverlayProps) {
  const recorder = useSessionRecorder();

  const [phase, setPhase] = useState<RecordPhase>('rec');
  const [saved, setSaved] = useState<{ seconds: number; transcript: string }>({ seconds: 0, transcript: '' });
  const [q, setQ] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);

  // Tracks whether the overlay has been closed (X or unmount) so an in-flight
  // summarizeSession() (or a slow createEntry) that resolves afterwards can be
  // dropped silently instead of navigating/toasting on a screen the user
  // already left — the rec Entry itself is already saved by then, only the
  // local navigation/toast is what gets dropped. Mirrors FlowOverlay's pattern.
  const closedRef = useRef(false);
  // Guards recorder.start() against StrictMode's dev-only double-invoke of
  // this mount effect (setup->cleanup->setup) — without it, two concurrent
  // getUserMedia calls would each open a mic stream, and the second would
  // silently overwrite the recorder hook's stream ref, leaking the first
  // stream's mic access forever (never stopped).
  const startedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    if (!startedRef.current) {
      startedRef.current = true;
      // If the overlay is closed (X, or unmount) while getUserMedia's
      // permission prompt is still pending, handleClose's recorder.stop()
      // is a no-op (the stream/recorder/recognition refs are still null at
      // that point) — start() then resolves afterwards on this orphaned
      // instance and opens a live mic with nothing left to stop it. Checking
      // closedRef once start() settles closes that window immediately.
      recorder
        .start()
        .then(() => {
          if (closedRef.current) recorder.stop().catch(() => {});
        })
        .catch(() => {});
    }
    return () => {
      closedRef.current = true;
      recorder.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = () => {
    if (recorder.running) recorder.pause();
    else recorder.resume();
  };

  const handleFinish = async () => {
    const result = await recorder.stop();
    if (closedRef.current) return;
    if (result.transcriptionFailed) showToast(RECORDED_TRANSCRIPTION_FAILED_TOAST);
    setSaved(result);
    setPhase('assign');
  };

  const handleClose = () => {
    closedRef.current = true;
    recorder.stop().catch(() => {});
    onClose();
  };

  // Re-requests getUserMedia without reopening the overlay — e.g. once the
  // therapist has flipped an iOS system toggle back on. Mirrors the mount
  // effect's own start() call, including the same orphaned-overlay guard.
  const handleRetryMic = () => {
    recorder
      .start()
      .then(() => {
        if (closedRef.current) recorder.stop().catch(() => {});
      })
      .catch(() => {});
  };

  // Shared by both assign paths (picking an existing result, or creating a
  // new patient inline) — saves the rec Entry, then offers the bonus
  // auto-summary when there's a transcript to work from.
  const finishAssign = async (patient: Patient) => {
    setBusy(true);
    const { seconds, transcript } = saved;
    try {
      await createEntry({
        patient_id: patient.id,
        type: 'rec',
        title: 'הקלטת פגישה',
        entry_date: new Date().toISOString(),
        body: 'הקלטה באורך ' + fmtTimer(seconds),
        is_draft: false,
        duration_seconds: seconds,
        transcript,
      });
    } catch {
      if (closedRef.current) return;
      showToast(SAVE_ERROR);
      setBusy(false);
      return;
    }

    if (closedRef.current) return;

    // Make the patient active, then continue in their own summary flow — the
    // drafting itself lives there and only there, so both entry points share
    // one implementation and one result. A recording that produced no text
    // continues there too (on the notes step), rather than dead-ending as a
    // saved recording with no summary.
    showToast('ההקלטה נשמרה בעולם של ' + fullName(patient));
    await openPatient(patient.id);
    if (closedRef.current) return;
    startSummaryFlow(transcript);
  };

  const handleAssignExisting = (patient: Patient) => {
    if (busy) return;
    finishAssign(patient);
  };

  const handleCreateAndAssign = async () => {
    if (busy || (!first.trim() && !last.trim())) return;
    setBusy(true);
    try {
      const created = await createPatient(first.trim(), last.trim());
      await refreshPatients();
      if (closedRef.current) return;
      await finishAssign(created);
    } catch {
      if (closedRef.current) return;
      showToast(SAVE_ERROR);
      setBusy(false);
    }
  };

  const typed = q.trim().length > 0;
  const results = typed ? patients.filter((p) => fullName(p).includes(q.trim())) : [];
  const noMatch = typed && results.length === 0;

  return (
    <div style={backdropStyle}>
      <div onClick={handleClose} style={closeBtnStyle}>
        <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
          <path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>

      {phase === 'rec' &&
        (recorder.transcribing ? (
          <div style={generatingWrapStyle}>
            <dror-orb size="120" state="thinking" />
            <div style={generatingTextStyle}>{TRANSCRIBING_NOTICE}</div>
          </div>
        ) : recorder.micErrorKind ? (
          <div style={micErrorWrapStyle}>
            <div style={micErrorContentStyle}>
              <div style={micErrorHeadlineStyle}>{getMicGuidance(recorder.micErrorKind).headline}</div>
              <div style={micErrorStepsStyle}>
                {getMicGuidance(recorder.micErrorKind).steps.map((step, i) => (
                  <div key={i} style={micErrorStepRowStyle}>
                    {step}
                  </div>
                ))}
              </div>
              {recorder.micErrorKind !== 'unsupported' && (
                <button type="button" onClick={handleRetryMic} className="pressable" style={micRetryBtnStyle}>
                  ניסיון חוזר
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div style={statusTextStyle}>
              {recorder.running
                ? 'הקלטת הפגישה החלה. לאחר סיומה נתאים אותה למטופל הייעודי.'
                : 'ההקלטה מושהית'}
            </div>
            <div style={recContentStyle}>
              <div dir="ltr" style={timerStyle}>
                {fmtTimer(recorder.seconds)}
              </div>
              <dror-orb size="150" state={recorder.running ? 'listening' : 'idle'} />
              {recorder.transcriptUnavailable && (
                <div style={transcriptUnavailableTextStyle}>{TRANSCRIPT_UNAVAILABLE_NOTICE}</div>
              )}
              <div style={controlsRowStyle}>
                <div onClick={handleToggle} style={toggleBtnStyle}>
                  {recorder.running ? (
                    <div style={pausedIndicatorStyle} />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
                      <path d="M8 5.5v13l11-6.5-11-6.5z" fill="#ffffff" />
                    </svg>
                  )}
                </div>
                <button type="button" onClick={handleFinish} className="pressable" style={finishBtnStyle}>
                  סיום
                </button>
              </div>
            </div>
          </>
        ))}

      {phase === 'assign' && (
        <div style={panelStyle}>
          <div style={titleStyle}>לאיזה מטופל לשייך את ההקלטה?</div>
          <div style={inputWrapStyle}>
            <svg viewBox="0 0 24 24" fill="none" width={18} height={18} style={{ flex: 'none' }}>
              <circle cx={11} cy={11} r={7} stroke="#9a9ca1" strokeWidth={2} />
              <path d="M21 21L16.5 16.5" stroke="#9a9ca1" strokeWidth={2} strokeLinecap="round" />
            </svg>
            <input
              dir="rtl"
              placeholder="חיפוש מטופל…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={inputStyle}
            />
          </div>
          {typed && (
            <div className="scroll-touch" style={resultsWrapStyle}>
              {results.map((p) => (
                <div key={p.id} onClick={() => handleAssignExisting(p)} className="pressable" style={rowStyle}>
                  <span style={rowNameStyle}>{fullName(p)}</span>
                  <span style={rowSubStyle}>שיוך ההקלטה</span>
                </div>
              ))}
              {noMatch && (
                <div style={noMatchWrapStyle}>
                  <div style={noMatchLabelStyle}>לא נמצא מטופל — אפשר להוסיף חדש:</div>
                  <div style={addRowStyle}>
                    <input
                      dir="rtl"
                      placeholder="שם פרטי"
                      value={first}
                      onChange={(e) => setFirst(e.target.value)}
                      style={addInputStyle}
                    />
                    <input
                      dir="rtl"
                      placeholder="שם משפחה"
                      value={last}
                      onChange={(e) => setLast(e.target.value)}
                      style={addInputStyle}
                    />
                  </div>
                  <button type="button" onClick={handleCreateAndAssign} disabled={busy} className="pressable" style={addBtnStyle}>
                    הוספת מטופל ושיוך
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
