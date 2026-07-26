import type { CSSProperties } from 'react';

// ChatGPT-style typing indicator: three small dots pulsing in sequence.
// Replaces the old "דרור חושב…" text row in PatientChat's thinking row (the
// small `dror-orb size=26 state=thinking` avatar next to it stays).

const wrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  paddingTop: 6,
};

const dotStyle = (delay: string): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'var(--faint)',
  animation: 'drDots 1.2s ease-in-out infinite',
  animationDelay: delay,
});

export default function TypingDots() {
  return (
    <div style={wrapStyle} role="status" aria-label="דרור חושב">
      <div style={dotStyle('0s')} />
      <div style={dotStyle('0.15s')} />
      <div style={dotStyle('0.3s')} />
    </div>
  );
}
