import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Patient } from '@/api/data';
import { fullName, fmtTimer } from '@/api/format';
import { summarizeSession } from '@/api/ai';
import { useSessionRecorder } from '@/hooks/useSessionRecorder';

// Ported verbatim from the design mock (lines 335-401 for the summary path,
// 342-352/444-452 for the shared chrome — step dots, back link, generating
// state). This task builds the summary path in full; the doc path (mock
// docS1-3, lines 402-443) is a placeholder panel until Task 9, which will
// slot its own steps in next to the summary ones below without touching this
// shell (backdrop/close/header/dots/back-link/generating already handle both
// `flowType`s).
export type FlowType = 'summary' | 'doc';
type FlowStep = 1 | 2 | 3;
type FlowMethod = 'record' | 'text' | null;

interface FlowOverlayProps {
  flowType: FlowType;
  patient: Patient;
  onClose: () => void;
  onDraftReady: (result: { title: string; body: string }) => void;
  showToast: (text: string) => void;
}

const SUMMARIZE_ERROR = 'דרור לא הצליח לנסח, נסו שוב';

const backdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 20,
  background: 'rgba(23,23,27,0.55)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  animation: 'drFade 0.25s ease',
};

const closeBtnStyle: CSSProperties = {
  position: 'absolute',
  top: 64,
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

const panelStyle: CSSProperties = {
  position: 'absolute',
  left: 26,
  right: 26,
  top: 140,
  animation: 'drRise 0.35s ease',
};

const headerStyle: CSSProperties = { textAlign: 'center' };
const headerTitleStyle: CSSProperties = { fontFamily: 'Calibri,Assistant,sans-serif', fontSize: 23, color: '#ffffff' };
const headerSubStyle: CSSProperties = {
  fontFamily: 'Calibri,Assistant,sans-serif',
  fontSize: 14,
  color: 'rgba(255,255,255,0.6)',
  marginTop: 4,
};
const dotsRowStyle: CSSProperties = { display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 };

function dotStyle(on: boolean): CSSProperties {
  return {
    width: on ? 22 : 6,
    height: 6,
    borderRadius: 3,
    background: on ? '#ffffff' : 'rgba(255,255,255,0.35)',
    transition: 'all 0.25s',
  };
}

const optionsWrapStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 };
const optionCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  background: 'rgba(255,255,255,0.10)',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: 22,
  padding: '18px 20px',
  cursor: 'pointer',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
};
const optionIconStyle: CSSProperties = { flex: 'none' };
const optionTitleStyle: CSSProperties = {
  fontFamily: 'Calibri,Assistant,sans-serif',
  fontSize: 16.5,
  fontWeight: 600,
  color: '#ffffff',
};
const optionSubStyle: CSSProperties = { fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 2 };
const noticeStyle: CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 4 };

const recWrapStyle: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 30 };
const timerStyle: CSSProperties = {
  fontSize: 32,
  fontWeight: 300,
  color: '#ffffff',
  letterSpacing: '0.06em',
  fontVariantNumeric: 'tabular-nums',
};
const recTextStyle: CSSProperties = { fontSize: 14.5, color: 'rgba(255,255,255,0.85)' };
const micErrorTextStyle: CSSProperties = {
  fontSize: 14.5,
  color: 'rgba(255,255,255,0.85)',
  textAlign: 'center',
  lineHeight: 1.6,
  padding: '0 8px',
};
const recControlsStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 };
const toggleBtnStyle: CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.14)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
const runningIndicatorStyle: CSSProperties = { width: 15, height: 15, borderRadius: 3.5, background: '#ffffff' };
const finishBtnStyle: CSSProperties = {
  height: 52,
  padding: '0 32px',
  border: 'none',
  borderRadius: 999,
  background: '#ffffff',
  color: '#17171b',
  fontSize: 15.5,
  fontWeight: 600,
  cursor: 'pointer',
};

const stepWrapStyle: CSSProperties = { marginTop: 26 };
const textareaStyle: CSSProperties = {
  width: '100%',
  height: 160,
  border: 'none',
  outline: 'none',
  background: '#ffffff',
  borderRadius: 20,
  resize: 'none',
  fontSize: 14.5,
  lineHeight: 1.7,
  color: '#17171b',
  padding: '16px 18px',
  textAlign: 'right',
  boxSizing: 'border-box',
  boxShadow: '0 14px 34px rgba(0,0,0,0.25)',
};
const continueBtnStyle: CSSProperties = {
  marginTop: 14,
  width: '100%',
  height: 52,
  border: 'none',
  borderRadius: 999,
  background: '#ffffff',
  color: '#17171b',
  fontSize: 15.5,
  fontWeight: 600,
  cursor: 'pointer',
};
const continueBtnDisabledStyle: CSSProperties = { ...continueBtnStyle, opacity: 0.5, cursor: 'default' };

const guideLabelStyle: CSSProperties = {
  fontFamily: 'Calibri,Assistant,sans-serif',
  fontSize: 15,
  fontWeight: 600,
  color: '#ffffff',
  marginBottom: 10,
  textAlign: 'center',
};
const guideOptionalStyle: CSSProperties = { fontWeight: 400, color: 'rgba(255,255,255,0.6)' };
const guideTextareaStyle: CSSProperties = { ...textareaStyle, height: 120 };

const backLinkStyle: CSSProperties = {
  marginTop: 18,
  textAlign: 'center',
  fontSize: 13.5,
  color: 'rgba(255,255,255,0.6)',
  cursor: 'pointer',
};

const generatingWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 22,
  padding: '60px 0 10px',
};
const generatingTextStyle: CSSProperties = {
  fontFamily: 'Calibri,Assistant,sans-serif',
  fontSize: 16.5,
  fontWeight: 600,
  color: '#ffffff',
};

const docPlaceholderStyle: CSSProperties = { marginTop: 26, textAlign: 'center', fontSize: 15, color: 'rgba(255,255,255,0.75)' };

export default function FlowOverlay({ flowType, patient, onClose, onDraftReady, showToast }: FlowOverlayProps) {
  const name = fullName(patient);
  const recorder = useSessionRecorder();

  const [step, setStep] = useState<FlowStep>(1);
  const [method, setMethod] = useState<FlowMethod>(null);
  const [notes, setNotes] = useState('');
  const [guide, setGuide] = useState('');
  const [generating, setGenerating] = useState(false);

  // Tracks whether the overlay has been closed (via the X or by unmounting)
  // so an in-flight summarizeSession() that resolves afterwards can be
  // dropped silently instead of navigating/toasting on a screen the user
  // already left.
  const closedRef = useRef(false);

  // Safety net: release the mic if the overlay unmounts without going
  // through handleClose/handleFinishRecording (e.g. parent swaps overlays).
  useEffect(() => {
    return () => {
      closedRef.current = true;
      recorder.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isRecordStep2 = step === 2 && method === 'record';
  const isTextStep2 = step === 2 && method === 'text';

  const handlePickRecord = async () => {
    recorder.reset(); // clear any stale transcript/seconds from a prior aborted attempt
    setMethod('record');
    setStep(2);
    await recorder.start();
  };

  const handlePickText = () => {
    recorder.reset(); // clear any abandoned recording transcript so it can't resurface
    setMethod('text');
    setStep(2);
  };

  const handleFinishRecording = async () => {
    await recorder.stop();
    setStep(3);
  };

  const handleContinueFromText = () => setStep(3);

  const handleToggleRecording = () => {
    if (recorder.running) recorder.pause();
    else recorder.resume();
  };

  const handleBack = () => {
    if (generating) return;
    if (step === 2 && method === 'record') {
      recorder.stop().catch(() => {});
      setMethod(null);
    }
    setStep((s) => Math.max(1, s - 1) as FlowStep);
  };

  const handleClose = () => {
    closedRef.current = true;
    recorder.stop().catch(() => {});
    onClose();
  };

  // Strictly scoped to the active method — an abandoned recording's
  // transcript (or leftover typed notes from before a method switch) must
  // never leak in as the source for the other method.
  const source = method === 'record' ? recorder.transcript.trim() : notes.trim();
  const sourceEmpty = !source;

  const handleCreateDraft = async () => {
    if (sourceEmpty || generating) return;
    setGenerating(true);
    try {
      const result = await summarizeSession({ patientId: patient.id, source, guide: guide.trim() });
      if (closedRef.current) return; // overlay closed mid-generate — drop the result silently
      onDraftReady(result);
    } catch {
      if (closedRef.current) return;
      showToast(SUMMARIZE_ERROR);
      setGenerating(false);
    }
  };

  const title = flowType === 'doc' ? 'מסמך רשמי' : 'סיכום פגישה';
  const sub = `עבור ${name}`;
  const backable = !generating && step > 1;

  return (
    <div style={backdropStyle}>
      <div onClick={handleClose} style={closeBtnStyle}>
        <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
          <path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>
      <div style={panelStyle}>
        {!generating && (
          <div style={headerStyle}>
            <div style={headerTitleStyle}>{title}</div>
            <div style={headerSubStyle}>{sub}</div>
            <div dir="rtl" style={dotsRowStyle}>
              {[1, 2, 3].map((n) => (
                <div key={n} style={dotStyle(n === step)} />
              ))}
            </div>
          </div>
        )}

        {!generating && flowType === 'summary' && step === 1 && (
          <div style={optionsWrapStyle}>
            {recorder.supported && (
              <div onClick={handlePickRecord} style={optionCardStyle}>
                <svg viewBox="0 0 24 24" fill="none" width={24} height={24} style={optionIconStyle}>
                  <rect x={8} y={2} width={8} height={13} rx={4} stroke="#fff" strokeWidth={2} />
                  <path d="M5 11a7 7 0 0014 0" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
                  <path d="M12 18v3" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
                </svg>
                <div>
                  <div style={optionTitleStyle}>הקלטת פגישה מלאה / נקודות מהפגישה</div>
                  <div style={optionSubStyle}>דרור מאזין ומסכם</div>
                </div>
              </div>
            )}
            <div onClick={handlePickText} style={optionCardStyle}>
              <svg viewBox="0 0 24 24" fill="none" width={24} height={24} style={optionIconStyle}>
                <path
                  d="M4 20l1.2-4.2L16.6 4.4a2 2 0 012.9 0l0.1 0.1a2 2 0 010 2.9L8.2 18.8 4 20z"
                  stroke="#fff"
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                />
                <path d="M14.5 6.5l3 3" stroke="#fff" strokeWidth={1.8} />
              </svg>
              <div>
                <div style={optionTitleStyle}>כתיבת נקודות מהפגישה</div>
                <div style={optionSubStyle}>רושמים כמה שורות, דרור מנסח</div>
              </div>
            </div>
            {!recorder.supported && <div style={noticeStyle}>הקלטה חיה נתמכת כרגע בכרום</div>}
          </div>
        )}

        {!generating && flowType === 'summary' && isRecordStep2 && (
          <div style={recWrapStyle}>
            {recorder.micError ? (
              <div style={micErrorTextStyle}>
                אין גישה למיקרופון — אפשר לאשר גישה בדפדפן או לחזור ולכתוב נקודות במקום
              </div>
            ) : (
              <>
                <div dir="ltr" style={timerStyle}>
                  {fmtTimer(recorder.seconds)}
                </div>
                <dror-orb size="120" state={recorder.running ? 'listening' : 'idle'} />
                <div style={recTextStyle}>{recorder.running ? 'דרור מקשיב…' : 'ההקלטה מושהית'}</div>
                <div style={recControlsStyle}>
                  <div onClick={handleToggleRecording} style={toggleBtnStyle}>
                    {recorder.running ? (
                      <div style={runningIndicatorStyle} />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" width={19} height={19}>
                        <path d="M8 5.5v13l11-6.5-11-6.5z" fill="#fff" />
                      </svg>
                    )}
                  </div>
                  <button type="button" onClick={handleFinishRecording} style={finishBtnStyle}>
                    סיום הקלטה
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {!generating && flowType === 'summary' && isTextStep2 && (
          <div style={stepWrapStyle}>
            <textarea
              dir="rtl"
              placeholder="נקודות עיקריות מהפגישה…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={textareaStyle}
            />
            <button type="button" onClick={handleContinueFromText} style={continueBtnStyle}>
              המשך
            </button>
          </div>
        )}

        {!generating && flowType === 'summary' && step === 3 && (
          <div style={stepWrapStyle}>
            <div style={guideLabelStyle}>
              הנחיות מיוחדות לדרור <span style={guideOptionalStyle}>(לא חובה)</span>
            </div>
            <textarea
              dir="rtl"
              placeholder="למשל: להדגיש את ההתקדמות בנושא השינה…"
              value={guide}
              onChange={(e) => setGuide(e.target.value)}
              style={guideTextareaStyle}
            />
            <button
              type="button"
              onClick={handleCreateDraft}
              disabled={sourceEmpty}
              style={sourceEmpty ? continueBtnDisabledStyle : continueBtnStyle}
            >
              יצירת טיוטה
            </button>
          </div>
        )}

        {!generating && flowType === 'doc' && <div style={docPlaceholderStyle}>בקרוב</div>}

        {backable && (
          <div onClick={handleBack} style={backLinkStyle}>
            חזרה לשלב הקודם
          </div>
        )}

        {generating && (
          <div style={generatingWrapStyle}>
            <dror-orb size="120" state="thinking" />
            <div style={generatingTextStyle}>דרור מנסח את הטיוטה…</div>
          </div>
        )}
      </div>
    </div>
  );
}
