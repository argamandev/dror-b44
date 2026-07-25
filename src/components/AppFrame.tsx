import type { CSSProperties, ReactNode } from 'react';

// The column every screen lives in. All absolute positioning in the app
// anchors to this element, not the window — keeps the mobile-native app
// frame centered and bounded on wide (desktop) viewports.
const frameStyle: CSSProperties = {
  position: 'relative',
  maxWidth: 430,
  margin: '0 auto',
  minHeight: '100dvh',
  overflow: 'hidden',
  background: 'var(--bg-warm)',
  boxShadow: '0 0 60px rgba(0,0,0,0.10)',
  paddingTop: 'var(--top-inset)',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-sans)',
  color: 'var(--text)',
};

export default function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" lang="he" style={frameStyle}>
      {children}
    </div>
  );
}
