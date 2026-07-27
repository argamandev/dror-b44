import type { CSSProperties } from 'react';
import TopBar from '@/components/TopBar';

// Ported verbatim from the design mock (lines 50-72).
interface HomeProps {
  homeOrb: 'idle' | 'thinking';
  onSearch: () => void;
  onMenu: () => void;
  onOrbClick: () => void;
}

const bgStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  background: 'var(--grad-hero), #faf8fa',
};

const centerWrapStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 'calc(var(--top-inset) + 352px)',
  zIndex: 4,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
};

const helloTextStyle: CSSProperties = {
  fontSize: 23,
  color: 'var(--text)',
  fontWeight: 500,
  letterSpacing: '0.1px',
};

const orbWrapStyle: CSSProperties = { cursor: 'pointer', marginTop: 44 };

export default function Home({ homeOrb, onSearch, onMenu, onOrbClick }: HomeProps) {
  return (
    <>
      <div style={bgStyle} />
      <TopBar onSearch={onSearch} onMenu={onMenu} />
      <div style={centerWrapStyle}>
        <div style={helloTextStyle}>איך אני יכול לעזור?</div>
        <div onClick={onOrbClick} style={orbWrapStyle}>
          <dror-orb size="140" state={homeOrb} />
        </div>
      </div>
    </>
  );
}
