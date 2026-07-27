import type { CSSProperties } from 'react';

// Home's icon row: search on one side, menu on the other.
// Ported from the design mock (lines 53-65) — Dawn Break recolors
// the icons to #17171b (v2 diff), row keeps dir="ltr" per the mock so icon
// order matches the source design regardless of the app's RTL direction.
// The mock's record mic was dropped: session recording starts from the orb.
interface TopBarProps {
  onSearch: () => void;
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

export default function TopBar({ onSearch, onMenu }: TopBarProps) {
  return (
    <div dir="ltr" style={rowStyle}>
      <div onClick={onSearch} className="pressable" style={iconBtn}>
        <svg viewBox="0 0 24 24" fill="none" width={28} height={28}>
          <circle cx={11} cy={11} r={7} stroke="#17171b" strokeWidth={2} />
          <path d="M21 21L16.5 16.5" stroke="#17171b" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>
      <div onClick={onMenu} className="pressable" style={menuBtn}>
        <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
          <path d="M3 6h18M3 12h18M3 18h18" stroke="#17171b" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
