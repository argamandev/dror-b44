import type { CSSProperties } from 'react';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { getMicGuidance } from '@/hooks/micCopy';

// Ported from the design mock (lines 280-297 for the layout, 713-723 for the
// state semantics), updated for the Dawn Break v2 mock which drops the
// "תדבר עם דרור על הכל." title and rotating caption entirely — pure orb
// presence. The mock's voicePhase toggle (listening/speaking on a 5s timer)
// is replaced by the real speech-to-speech loop in useVoiceChat; the extra
// "live" line under the (now title-less) text block (last heard user text)
// is new this task — not in the mock — added per controller resolution 4 to
// help demo credibility.
interface VoiceOverlayProps {
  /**
   * Patient this conversation is scoped to; omit for a general conversation.
   * Home's orb (`onOrbClick` in App.tsx) is the only entry point to this
   * overlay this week, and it always opens a general conversation — so this
   * is always undefined in practice today. Kept as a prop (rather than
   * hard-coded) so a future patient-context entry point can pass one without
   * touching this file.
   */
  patientId?: string;
  onClose: () => void;
  /** App-level toast — the voice loop raises one only when a transcript fails (Task W5.3). */
  showToast: (text: string) => void;
}

// Task W5.3: no longer "Chrome only" — a device without SpeechRecognition now
// records and transcribes server-side instead. This caption is left for the
// genuinely last case: no voice input engine of any kind (no MediaRecorder, or
// no getUserMedia at all).
const UNSUPPORTED_CAPTION = 'שיחה קולית אינה זמינה בדפדפן הזה';
// Wave 4 Issue C: iOS Safari fires 'service-not-allowed' when Siri/Dictation
// is unavailable even though mic permission is granted — a distinct message
// from the mic-error guidance below (getMicGuidance), since the fix (and the
// user's mental model) is completely different: this isn't a permission problem.
const SPEECH_UNAVAILABLE_CAPTION =
  'זיהוי דיבור אינו זמין במכשיר הזה — באייפון ודאו שההכתבה מופעלת (הגדרות ← כללי ← מקלדת ← הפעלת הכתבה), או כתבו לדרור בצ\'אט';

const backdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 20,
  background:
    'radial-gradient(115% 62% at 50% 106%, rgba(107,113,246,0.6) 0%, rgba(107,113,246,0.34) 26%, rgba(169,185,249,0.14) 44%, rgba(23,23,27,0.92) 68%, rgba(10,10,12,0.97) 100%), rgba(12,12,14,0.9)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  animation: 'drFade 0.45s ease',
};

const closeBtnStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--top-inset) + 64px)',
  right: 20,
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  zIndex: 3,
};

const contentStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 44,
  // inset:0 keeps the backdrop full-bleed; the insets pad this content box so
  // the orb stays centred in the *visible* area (Task W5.8).
  paddingTop: 'var(--top-inset)',
  paddingBottom: 'calc(var(--bottom-inset) + 70px)',
  animation: 'drRise 0.55s ease',
};

// cursor:pointer is not only the visual affordance for "tap me to finish
// talking" (W5.3 review I2) — iOS Safari's click delegation to a plain <div>
// is unreliable without it, and this is the only manual way to end a turn.
const orbWrapStyle: CSSProperties = { position: 'relative', cursor: 'pointer' };

const haloStyle: CSSProperties = {
  position: 'absolute',
  inset: -46,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(107,113,246,0.35) 0%, rgba(107,113,246,0) 70%)',
  animation: 'drBreathe 4.5s ease-in-out infinite',
};

const textWrapStyle: CSSProperties = { textAlign: 'center' };
const captionStyle: CSSProperties = {
  fontSize: 14,
  color: 'rgba(255,255,255,0.55)',
  marginTop: 10,
  animation: 'drFade 0.6s ease',
};

// Small, muted, capped at two lines — a hint of what Dror heard, not a
// transcript UI.
const liveTextStyle: CSSProperties = {
  fontSize: 12.5,
  color: 'rgba(255,255,255,0.55)',
  marginTop: 14,
  maxWidth: 260,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  lineHeight: 1.5,
};

// -- mic-error guidance (Task W5.2) --
const micHeadlineStyle: CSSProperties = {
  fontFamily: 'Calibri,Assistant,sans-serif',
  fontSize: 15.5,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.9)',
  marginTop: 10,
  animation: 'drFade 0.6s ease',
};
const micStepsStyle: CSSProperties = {
  marginTop: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  maxWidth: 280,
  marginLeft: 'auto',
  marginRight: 'auto',
};
const micStepRowStyle: CSSProperties = { fontSize: 12.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 };
const micRetryBtnStyle: CSSProperties = {
  marginTop: 18,
  height: 44,
  padding: '0 26px',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.12)',
  color: '#ffffff',
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
};

export default function VoiceOverlay({ patientId, onClose, showToast }: VoiceOverlayProps) {
  const voice = useVoiceChat({ patientId, showToast });

  const handleClose = () => {
    voice.stop();
    onClose();
  };

  // dror-orb only distinguishes idle/listening/thinking — thinking and
  // speaking share the "thinking" visual (controller resolution 4).
  const orbState = voice.phase === 'listening' ? 'listening' : 'thinking';

  // v2 mock drops the title + rotating caption entirely — pure orb presence.
  // Only functional notices survive: unsupported-browser / mic-error (Task
  // W5.2: rendered separately below with classified headline+steps+retry,
  // not a single caption) / speech-service-unavailable text, and (controller
  // resolution 4) the last-heard-user-text line.
  const notice = !voice.supported ? UNSUPPORTED_CAPTION : voice.speechUnavailable ? SPEECH_UNAVAILABLE_CAPTION : null;
  const showLive =
    voice.supported && !voice.micErrorKind && !voice.speechUnavailable && voice.lastUserText.trim().length > 0;
  // Task W5.3 requirement 4: a quiet state hint under the orb (מקשיב… /
  // חושב… / עונה…) so the loop is legible — on the recorded engine there are
  // no interim words appearing to show that something is happening.
  const showPhaseCaption = voice.supported && !voice.micErrorKind && !voice.speechUnavailable;

  return (
    <div style={backdropStyle}>
      <div onClick={handleClose} title="חזרה לבית" style={closeBtnStyle}>
        <svg viewBox="0 0 24 24" fill="none" width={20} height={20}>
          <path d="M9 6l6 6-6 6" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div style={contentStyle}>
        {/* Tapping the orb ends the utterance now (recorded engine); on the
            live engine the recognizer still decides, and this is inert. */}
        <div onClick={voice.endUtterance} style={orbWrapStyle}>
          <div style={haloStyle} />
          <dror-orb size="210" state={orbState} />
        </div>
        <div style={textWrapStyle}>
          {voice.micErrorKind ? (
            <>
              <div style={micHeadlineStyle}>{getMicGuidance(voice.micErrorKind).headline}</div>
              <div style={micStepsStyle}>
                {getMicGuidance(voice.micErrorKind).steps.map((step, i) => (
                  <div key={i} style={micStepRowStyle}>
                    {step}
                  </div>
                ))}
              </div>
              <button type="button" onClick={voice.retryMic} className="pressable" style={micRetryBtnStyle}>
                ניסיון חוזר
              </button>
            </>
          ) : (
            <>
              {notice && <div style={captionStyle}>{notice}</div>}
              {showPhaseCaption && <div style={captionStyle}>{voice.caption}</div>}
              {showLive && (
                <div dir="rtl" style={liveTextStyle}>
                  {voice.lastUserText}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
