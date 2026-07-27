import type { CSSProperties } from 'react';

const toastStyle: CSSProperties = {
  position: 'absolute',
  left: 30,
  right: 30,
  // Sits above the ChatBar, tracking wherever the bar's bottom edge lands
  // (Task W5.8) rather than hard-coding the 44px it used to assume.
  bottom: 'calc(var(--chatbar-bottom) + 126px)',
  // Above every overlay (they sit at zIndex 20, the menu drawer included).
  // Task W5.9 put the app's screens and overlays inside a layer that slides
  // 86% of the column to the left while the drawer is open, so the toast is
  // rendered OUTSIDE that layer (App.tsx, beside <MenuDrawer>) — otherwise a
  // failure raised while the drawer is open (refreshChats runs on every open)
  // would paint ~370px off-screen and expire unseen after its 2.8s.
  zIndex: 25,
  background: '#17171b',
  color: '#ffffff',
  borderRadius: 999,
  padding: '13px 22px',
  fontSize: 13.5,
  textAlign: 'center',
  boxShadow: '0 14px 34px rgba(0,0,0,0.3)',
  animation: 'drRise 0.3s ease',
};

export default function Toast({ text }: { text: string }) {
  return <div style={toastStyle}>{text}</div>;
}
