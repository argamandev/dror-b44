import { useState, type CSSProperties } from 'react';
import { updatePatientNotes, type Patient } from '@/api/data';
import { fullName } from '@/api/format';

// Ported verbatim from the design mock (lines 457-470, "PATIENT SETTINGS").
interface PatientContextOverlayProps {
  patient: Patient;
  onClose: () => void;
  onSaved: () => void;
  showToast: (text: string) => void;
}

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

const cardStyle: CSSProperties = {
  position: 'absolute',
  left: 22,
  right: 22,
  top: 150,
  background: '#ffffff',
  borderRadius: 32,
  padding: '26px 24px',
  boxShadow: '0 30px 60px rgba(0,0,0,0.3)',
  animation: 'drRise 0.35s ease',
};

const titleStyle: CSSProperties = {
  fontFamily: "'Frank Ruhl Libre',serif",
  fontSize: 21,
  fontWeight: 500,
  color: '#17171b',
  textAlign: 'center',
};

const subtitleStyle: CSSProperties = {
  fontSize: 13,
  color: '#9a9ca1',
  textAlign: 'center',
  marginTop: 5,
  lineHeight: 1.5,
};

const textareaStyle: CSSProperties = {
  marginTop: 16,
  width: '100%',
  height: 150,
  border: 'none',
  outline: 'none',
  background: '#f6f5f7',
  borderRadius: 18,
  resize: 'none',
  fontSize: 14.5,
  lineHeight: 1.7,
  color: '#17171b',
  padding: '16px 18px',
  textAlign: 'right',
  boxSizing: 'border-box',
};

const saveBtnStyle: CSSProperties = {
  marginTop: 14,
  width: '100%',
  height: 52,
  border: 'none',
  borderRadius: 999,
  background: '#17171b',
  color: '#fff',
  fontSize: 15.5,
  fontWeight: 600,
  cursor: 'pointer',
};

export default function PatientContextOverlay({ patient, onClose, onSaved, showToast }: PatientContextOverlayProps) {
  const [text, setText] = useState(patient.context_notes);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updatePatientNotes(patient.id, text);
      onSaved();
    } catch {
      showToast('שגיאה בשמירה, נסו שוב');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={backdropStyle}>
      <div onClick={onClose} style={closeBtnStyle}>
        <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
          <path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>
      <div style={cardStyle}>
        <div style={titleStyle}>הקשר על {fullName(patient)}</div>
        <div style={subtitleStyle}>
          תצפיות והערות חופשיות שמכוונות את דרור
          <br />
          בסיכומים ובמסמכים של המטופל הזה
        </div>
        <textarea
          dir="rtl"
          placeholder="למשל: רגיש לניסוחים ישירים, להעדיף שפה עדינה…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={textareaStyle}
        />
        <button type="button" onClick={handleSave} disabled={busy} className="pressable" style={saveBtnStyle}>
          שמירה
        </button>
      </div>
    </div>
  );
}
