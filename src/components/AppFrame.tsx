import type { CSSProperties, ReactNode } from 'react';

// The column every screen lives in. All absolute positioning in the app
// anchors to this element, not the window — keeps the mobile-native app
// frame centered and bounded on wide (desktop) viewports.
//
// Task W5.8: this box spans the FULL physical viewport in standalone mode —
// no safe-area padding here, and none on body either (base.css). That is what
// lets each screen's `position:absolute;inset:0` background layer paint from
// y=0 (under the status bar) to the physical bottom edge (under the home
// indicator), and what puts the frame's bottom-anchored origin on the real
// bottom edge so the ChatBar isn't clipped. The insets are applied by the
// content inside instead, via the tokens in tokens.css.
//
// (The `paddingTop: var(--top-inset)` that used to be here was already inert
// for the screens — absolutely positioned children resolve against the
// containing block's PADDING box, which includes the padding — but it read as
// if the frame handled the inset, and body's padding then applied a second
// one on top of it.)
const frameStyle: CSSProperties = {
  position: 'relative',
  maxWidth: 430,
  margin: '0 auto',
  minHeight: '100dvh',
  overflow: 'hidden',
  background: 'var(--bg-warm)',
  boxShadow: '0 0 60px rgba(0,0,0,0.10)',
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
