import type { CSSProperties } from 'react';
import type { Draft } from '@/state/useAppState';
import { fmtDate } from '@/api/format';

// Ported from the design mock (lines 173-193), plus the v2 diff's dawn hero
// recolor and context-aware close button: a chevron when the draft was
// opened from World (closing returns there), an X otherwise (returns to
// Profile) — mirrors the mock's draftFromWorld/draftFromProfile split.
interface DraftEditorProps {
  draft: Draft;
  draftFrom: 'profile' | 'world';
  onBodyChange: (body: string) => void;
  onClose: () => void;
  onSave: (asDraft: boolean) => void;
}

const wrapStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 8,
  background: '#fbfafb',
  animation: 'drFade 0.25s ease',
};

const heroStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 150,
  opacity: 0.45,
  background:
    'radial-gradient(120% 120% at 50% -55%, rgba(107,113,246,0.9) 0%, rgba(169,185,249,0.75) 40%, rgba(240,228,232,0.5) 65%, rgba(246,217,196,0) 100%)',
};

const closeBtnStyle: CSSProperties = {
  position: 'absolute',
  top: 64,
  right: 20,
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: 'rgba(23,23,27,0.06)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  zIndex: 3,
};

const titleWrapStyle: CSSProperties = {
  position: 'absolute',
  top: 72,
  left: 70,
  right: 70,
  textAlign: 'center',
  zIndex: 2,
};

const titleStyle: CSSProperties = {
  fontFamily: "'Frank Ruhl Libre',serif",
  fontSize: 21,
  fontWeight: 500,
  color: '#17171b',
  lineHeight: 1.25,
};

const dateStyle: CSSProperties = { fontSize: 12.5, color: '#9a9ca1', marginTop: 3 };

const textareaWrapStyle: CSSProperties = {
  position: 'absolute',
  top: 148,
  left: 16,
  right: 16,
  bottom: 118,
  background: '#ffffff',
  borderRadius: 26,
  boxShadow: '0 10px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
  padding: 6,
  zIndex: 2,
};

const textareaStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  resize: 'none',
  fontSize: 14.5,
  lineHeight: 1.75,
  color: '#2b2b30',
  padding: '18px 20px',
  textAlign: 'right',
  boxSizing: 'border-box',
};

const buttonsRowStyle: CSSProperties = {
  position: 'absolute',
  bottom: 44,
  left: 24,
  right: 24,
  zIndex: 2,
  display: 'flex',
  gap: 10,
};

const saveBtnStyle: CSSProperties = {
  flex: 1.4,
  height: 54,
  border: 'none',
  borderRadius: 999,
  background: '#17171b',
  color: '#ffffff',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
};

const saveDraftBtnStyle: CSSProperties = {
  flex: 1,
  height: 54,
  border: '1px solid #d8d6db',
  borderRadius: 999,
  background: '#ffffff',
  color: '#17171b',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};

const footnoteStyle: CSSProperties = {
  position: 'absolute',
  bottom: 18,
  left: 0,
  right: 0,
  textAlign: 'center',
  fontSize: 11,
  color: '#b6b8bd',
};

export default function DraftEditor({ draft, draftFrom, onBodyChange, onClose, onSave }: DraftEditorProps) {
  return (
    <div style={wrapStyle}>
      <div style={heroStyle} />
      <div onClick={onClose} title="חזרה" style={closeBtnStyle}>
        {draftFrom === 'world' ? (
          <svg viewBox="0 0 24 24" fill="none" width={20} height={20}>
            <path d="M9 6l6 6-6 6" stroke="#17171b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
            <path d="M6 6l12 12M18 6L6 18" stroke="#17171b" strokeWidth={2} strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div data-selectable style={titleWrapStyle}>
        <div style={titleStyle}>{draft.title}</div>
        <div dir="ltr" style={dateStyle}>
          {fmtDate(draft.date)}
        </div>
      </div>
      <div style={textareaWrapStyle}>
        <textarea
          dir="rtl"
          value={draft.body}
          onChange={(e) => onBodyChange(e.target.value)}
          style={textareaStyle}
        />
      </div>
      <div style={buttonsRowStyle}>
        <button type="button" onClick={() => onSave(false)} style={saveBtnStyle}>
          שמירה
        </button>
        <button type="button" onClick={() => onSave(true)} style={saveDraftBtnStyle}>
          שמירה כטיוטה
        </button>
      </div>
      <div style={footnoteStyle}>אפשר לערוך את הטקסט ישירות</div>
    </div>
  );
}
