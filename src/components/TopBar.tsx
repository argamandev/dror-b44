import type { CSSProperties } from 'react';

// Home's icon row: search + record on one side, menu on the other.
// Ported verbatim from the design mock (lines 53-65) — icons stay white,
// row keeps dir="ltr" per the mock so icon order matches the source design
// regardless of the app's RTL direction.
interface TopBarProps {
  onSearch: () => void;
  onRecord: () => void;
  onMenu: () => void;
}

const rowStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(var(--top-inset) + 66px)',
  left: 24,
  right: 24,
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const iconBtn: CSSProperties = { width: 28, height: 28, cursor: 'pointer' };
const menuBtn: CSSProperties = {
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

export default function TopBar({ onSearch, onRecord, onMenu }: TopBarProps) {
  return (
    <div dir="ltr" style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div onClick={onSearch} style={iconBtn}>
          <svg viewBox="0 0 24 24" fill="none" width={28} height={28}>
            <circle cx={11} cy={11} r={7} stroke="#fff" strokeWidth={2} />
            <path d="M21 21L16.5 16.5" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </div>
        <div onClick={onRecord} style={iconBtn}>
          <svg viewBox="0 0 24 24" fill="none" width={28} height={28}>
            <rect x={8} y={2} width={8} height={13} rx={4} stroke="#fff" strokeWidth={2} />
            <path d="M5 11a7 7 0 0014 0" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
            <path d="M12 18v3" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <div onClick={onMenu} style={menuBtn}>
        <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
          <path d="M3 6h18M3 12h18M3 18h18" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
