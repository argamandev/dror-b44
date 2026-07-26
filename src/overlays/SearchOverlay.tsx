import { useState, type CSSProperties } from 'react';
import { createPatient, type Patient } from '@/api/data';
import { fullName } from '@/api/format';

// Ported verbatim from the design mock (lines 299-333). Rows show
// "פתיחת תיק" instead of a session count to avoid N+1 entry loads for the
// list (the real count lives on Profile, loaded once for the active patient).
interface SearchOverlayProps {
  patients: Patient[];
  onClose: () => void;
  onOpenPatient: (id: string) => void;
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

const panelStyle: CSSProperties = {
  position: 'absolute',
  left: 26,
  right: 26,
  top: 150,
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
  maxHeight: 300,
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

export default function SearchOverlay({ patients, onClose, onOpenPatient, showToast }: SearchOverlayProps) {
  const [q, setQ] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);

  const typed = q.trim().length > 0;
  const results = typed ? patients.filter((p) => fullName(p).includes(q.trim())) : [];
  const noMatch = typed && results.length === 0;

  const handleCreate = async () => {
    if (busy || (!first.trim() && !last.trim())) return;
    setBusy(true);
    try {
      const created = await createPatient(first.trim(), last.trim());
      onOpenPatient(created.id);
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
      <div style={panelStyle}>
        <div style={titleStyle}>חיפוש מטופל</div>
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
              <div key={p.id} onClick={() => onOpenPatient(p.id)} className="pressable" style={rowStyle}>
                <span style={rowNameStyle}>{fullName(p)}</span>
                <span style={rowSubStyle}>פתיחת תיק</span>
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
                <button type="button" onClick={handleCreate} disabled={busy} className="pressable" style={addBtnStyle}>
                  יצירת פרופיל מטופל
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
