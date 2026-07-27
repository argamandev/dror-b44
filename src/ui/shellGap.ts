// The white block, third and final round — measured off the founder's
// screenshots (27.7) rather than reasoned about.
//
// On his installed PWA the layout viewport is 873px tall on a 932px screen.
// The missing 59px is EXACTLY safe-area-inset-top: with the black-translucent
// status-bar style iOS draws the web view from y=0 (which is why the gradient
// reaches the clock — the look we want) but never grows the viewport, so the
// space it borrowed at the top is handed back as dead canvas at the bottom.
//
// Nothing in the page can lay out there. `height:100%`, `100dvh` and `100vh`
// all measured the same 873 — they all report the layout viewport, and that
// is the thing that is wrong. The only lever left is to measure the shortfall
// at runtime and let the shell overflow the viewport by it: a position:fixed
// element is allowed to PAINT past the viewport edge, it simply can't scroll
// there — which is precisely what a non-scrolling app shell wants.
//
// Applied to <body> (base.css), so #root, AppFrame, every screen's
// `inset:0` background layer, the overlay scrims and the bottom-anchored
// ChatBar all inherit the correction from one place.

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
