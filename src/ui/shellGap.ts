// The white block, third and final round — measured off the founder's
// screenshots (27.7) rather than reasoned about.
//
// On his installed PWA the layout viewport is 873px tall on a 932px screen.
// The missing 59px is EXACTLY safe-area-inset-top: with the black-translucent
// status-bar style iOS draws the web view from y=0 (which is why the gradient
// reaches the clock — the look we want) but never grows the viewport, so the
// space it borrowed at the top is handed back as dead canvas at the bottom.
//
// `height:100%`, `100dvh` and `100vh` all measured the same 873 — every unit
// reports the layout viewport, and the layout viewport is the thing that is
// wrong. Growing the shell past it was tried and measured too: the ChatBar
// then LAID OUT correctly (top edge at 932-44-105) but painted only down to
// 873, its bottom 14px cut off. iOS renders backgrounds into that strip and
// clips content out of it.
//
// So the strip is not space the app can use — it can only be coloured. The
// measurement below is what lets the app treat it as a physical edge it does
// not own: --chatbar-bottom (tokens.css) lifts the bottom-anchored UI clear
// of it, Profile's bottom glow ends above it, and chromeColor.ts paints it —
// via body's background, the one thing that does reach — to match the bottom
// edge of whatever surface is on screen, so the two read as one surface.

/** What the fix needs to know about the window — injected so it stays pure. */
export interface ViewportMetrics {
  /** Whether the app is running as an installed PWA. */
  standalone: boolean;
  /** Physical screen height in CSS px (window.screen.height). */
  screenHeight: number;
  /** Layout viewport height in CSS px (window.innerHeight). */
  innerHeight: number;
}

// A status bar is ~44-62px tall across the iPhone line. Anything larger is not
// this bug — it is a browser toolbar, a landscape rotation, or a device we
// have not seen — and the app must NOT paint under those, so we correct
// nothing rather than push the ChatBar off the bottom of the screen.
const MAX_GAP = 80;

/**
 * How far the app shell must overflow the layout viewport to reach the
 * physical bottom edge. 0 whenever we are not certain, which leaves the
 * layout exactly as the browser laid it out.
 */
export function shellGap({ standalone, screenHeight, innerHeight }: ViewportMetrics): number {
  // Only the installed app has the quirk. In a browser the same subtraction
  // measures the toolbars, which are real chrome sitting over real pixels —
  // painting under them would hide the ChatBar instead of revealing it.
  if (!standalone) return 0;
  const gap = Math.round(screenHeight - innerHeight);
  if (!Number.isFinite(gap) || gap <= 0 || gap > MAX_GAP) return 0;
  return gap;
}

/** Reads the live window and publishes the result as --shell-gap. */
export function applyShellGap(): void {
  if (typeof window === 'undefined') return;
  const gap = shellGap({
    standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    screenHeight: window.screen?.height ?? 0,
    innerHeight: window.innerHeight,
  });
  document.documentElement.style.setProperty('--shell-gap', `${gap}px`);
}
