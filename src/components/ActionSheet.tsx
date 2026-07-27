import type { CSSProperties, ReactNode } from 'react';

// Task W5.6 — the small bottom sheet the ChatBar's + raises: first to choose
// what to add (מסמך / הקלטה), then, for a general chat, to choose who an
// uploaded document belongs to. Deliberately a plain rows list rather than a
// second overlay in the app's `overlay` state machine: it is raised from the
// ChatBar, sits with it at the bottom of the frame, and closes back into it.
//
// Styling follows the app's existing overlays (SearchOverlay/RecordOverlay):
// the same dimmed, blurred backdrop and white rounded panel — anchored to the
// bar's own edges (--chatbar-bottom + --kb-inset) instead of floating mid-screen.

export interface SheetRow {
  key: string;
  label: string;
  /** Muted right-hand hint, e.g. the patient's session context. */
  sub?: string;
  icon?: ReactNode;
}

interface ActionSheetProps {
  title: string;
  rows: SheetRow[];
  onPick: (key: string) => void;
  onClose: () => void;
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

const panelStyle: CSSProperties = {
  position: 'absolute',
  left: 15,
  right: 15,
  bottom: 'calc(var(--chatbar-bottom) + var(--kb-inset, 0px))',
  background: '#ffffff',
  borderRadius: 26,
  boxShadow: '0 10px 30px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)',
  padding: '18px 12px 12px',
  animation: 'drRise 0.28s ease',
};

const titleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#9a9ca1',
  textAlign: 'right',
  padding: '0 14px 10px',
};

const listStyle: CSSProperties = { maxHeight: 300, overflowY: 'auto' };

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '14px',
  borderRadius: 16,
  cursor: 'pointer',
};

const rowLabelWrapStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 };
const rowLabelStyle: CSSProperties = { fontSize: 16, fontWeight: 600, color: '#17171b' };
const rowSubStyle: CSSProperties = { fontSize: 13, color: '#9a9ca1' };

export default function ActionSheet({ title, rows, onPick, onClose }: ActionSheetProps) {
  return (
    <div onClick={onClose} style={backdropStyle}>
      {/* The panel swallows its own taps so a mis-tap between rows doesn't
          close the sheet the therapist just opened. */}
      <div dir="rtl" onClick={(e) => e.stopPropagation()} style={panelStyle}>
        <div style={titleStyle}>{title}</div>
        <div className="scroll-touch" style={listStyle}>
          {rows.map((row) => (
            <div key={row.key} onClick={() => onPick(row.key)} className="pressable" style={rowStyle}>
              <span style={rowLabelWrapStyle}>
                {row.icon}
                <span style={rowLabelStyle}>{row.label}</span>
              </span>
              {row.sub && <span style={rowSubStyle}>{row.sub}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
