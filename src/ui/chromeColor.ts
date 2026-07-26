import type { Overlay, Screen } from '@/state/useAppState';

// Wave 4 Issue A ("dynamic chrome blending"): the founder's iPhone screenshot
// showed a light band above Home's gradient under the status bar, and
// finger-drag revealed more of it. Locking the document from scrolling at
// all (src/styles/base.css: html,body position:fixed) removes the
// rubber-band that exposed it, but the status bar itself is still a FIXED
// color (index.html's <meta name="theme-color"> + iOS reading the page's own
// background-color) that doesn't match every screen's own top-of-viewport
// tone. This module keeps both in sync with whatever's actually on screen.

/** 0-255 RGB channels plus a 0-1 alpha — the semi-transparent "foreground"
 * being laid over an opaque background in `blendOver`. */
export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function channelToHex(n: number): string {
  const clamped = Math.round(Math.min(255, Math.max(0, n)));
  return clamped.toString(16).padStart(2, '0');
}

/**
 * Standard "source-over" alpha compositing: lays `fgRgba` on top of the
 * opaque `bgHex` color and returns the resulting opaque color as a lowercase
 * hex string (e.g. "#6b71f6"). Pure function, no DOM access — trivially
 * unit-testable (see chromeColor.test.ts).
 *
 *   result_channel = fg_channel * a + bg_channel * (1 - a)
 */
export function blendOver(fgRgba: RgbaColor, bgHex: string): string {
  const bg = hexToRgb(bgHex);
  const a = Math.min(1, Math.max(0, fgRgba.a));
  const r = fgRgba.r * a + bg.r * (1 - a);
  const g = fgRgba.g * a + bg.g * (1 - a);
  const b = fgRgba.b * a + bg.b * (1 - a);
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}

// The one pseudo-"screen" that isn't part of useAppState's Screen union:
// App.tsx renders Login (and the pre-auth loading spinner) before any
// `useAppState` exists at all.
export type ChromeScreen = Screen | 'login';

interface ScreenColorSpec {
  fg: RgbaColor;
  bg: string;
}

// Per-screen top-of-viewport color, derived from each screen's own top
// gradient definition (component + the line the gradient/opacity lives on).
// Where a hero div's gradient is centered ABOVE its own box (Profile/World/
// PatientChat/DraftEditor all use a `radial-gradient(... at 50% <negative>%,
// ...)`), the true pixel-exact color at y=0 is technically an interpolation
// between the gradient's first two stops, not the raw 0%-stop color — but
// reproducing that geometry precisely here would be fragile (it'd silently
// go stale the moment a designer nudges a gradient's center/stops) for a
// value that only needs to be "close enough" to avoid a visible seam. So,
// consistently across every screen below: we take the gradient's PEAK
// (strongest/first) color stop, using either that stop's own alpha (when
// the hero div has no separate wrapping opacity) or the wrapping div's own
// `opacity` (when it has one) as the effective alpha, composited over the
// screen's flat fallback/base background color.
const SCREEN_COLOR_SPECS: Record<ChromeScreen, ScreenColorSpec> = {
  // Home (Home.tsx bgStyle -> var(--grad-hero), tokens.css): the hero
  // gradient's peak stop is rgba(107,113,246,1) — fully opaque, so
  // blendOver returns it untouched regardless of bg. This is also the
  // <meta name="theme-color"> index.html already ships by default.
  home: { fg: { r: 107, g: 113, b: 246, a: 1 }, bg: '#faf8fa' },
  // Profile.tsx heroStyle (~line 27): radial-gradient(... at 50% -42%, ...)
  // peak stop rgba(107,113,246,0.96), no wrapping opacity, over its own
  // #faf8fa fallback.
  profile: { fg: { r: 107, g: 113, b: 246, a: 0.96 }, bg: '#faf8fa' },
  // PatientChat.tsx glowStyle (~line 27): radial-gradient(... at 50% -50%,
  // ...) peak stop rgba(107,113,246,0.5), over the screen's flat #fbfafb
  // background (bgStyle).
  chat: { fg: { r: 107, g: 113, b: 246, a: 0.5 }, bg: '#fbfafb' },
  // World.tsx heroStyle (~line 19-26) wraps its gradient in `opacity: 0.35`;
  // per the method above we take that wrapper opacity as the effective
  // alpha (the gradient's own 0.95 first-stop alpha is close enough to
  // opaque that the wrapper dominates), over the screen's own #faf8fa.
  world: { fg: { r: 107, g: 113, b: 246, a: 0.35 }, bg: '#faf8fa' },
  // DraftEditor.tsx heroStyle (~line 25-34) likewise wraps its gradient in
  // `opacity: 0.45` — same treatment as World — over the editor's own
  // #fbfafb (wrapStyle).
  draft: { fg: { r: 107, g: 113, b: 246, a: 0.45 }, bg: '#fbfafb' },
  // Login (outside AppFrame) and the pre-auth loading spinner (AppFrame with
  // no screen content yet) are both flat var(--bg-warm) — alpha 1 so
  // blendOver just returns it untouched.
  login: { fg: { r: 250, g: 248, b: 250, a: 1 }, bg: '#faf8fa' },
};

// Every dark, full-bleed overlay (SearchOverlay, PatientContextOverlay
// ['settings'], AppSettingsOverlay ['appSettings'], FlowOverlay, RecordOverlay,
// MenuDrawer) renders its `rgba(23,23,27,0.5-0.62)` backdrop across the
// ENTIRE viewport (position:absolute; inset:0) with its actual card/panel
// content positioned lower down (top:120-150px) — so at y=0, under the
// status bar, what's showing is always that dark backdrop over whatever
// screen sits behind it. The exact backdrop alpha varies slightly per
// overlay (0.45 for the menu, 0.55 for most, 0.62 for RecordOverlay) and the
// screen behind it varies too — per the spec, a single flat approximation
// stands in for all of them rather than a combinatorial per-overlay,
// per-screen table. Derivation: rgba(23,23,27,0.55) blended over a
// mid-tone screen backdrop rounds to roughly this — dark, faintly cool grey.
const OVERLAY_DARK = '#4a4a52';

// VoiceOverlay.tsx backdropStyle: a radial-gradient centered at (50%, 106%)
// — i.e. BELOW the box — fading through rgba(23,23,27,0.92) at 68% to
// rgba(10,10,12,0.97) at 100%, over a rgba(12,12,14,0.9) fallback. The top
// of the viewport sits far past the gradient's far edge from that
// below-box center, so it saturates to (at least) the last stop: a
// near-opaque near-black. rgba(10,10,12,0.97) composited over anything
// lands within a channel or two of #0c0c0e either way.
const VOICE_DARK = '#0c0c0e';

/** Computes the top-of-viewport color for a given (screen, overlay) pair — pure, no DOM access. */
export function computeChromeColor(screen: ChromeScreen, overlay: Overlay | null): string {
  if (overlay === 'voice') return VOICE_DARK;
  if (overlay) return OVERLAY_DARK;
  const spec = SCREEN_COLOR_SPECS[screen];
  return blendOver(spec.fg, spec.bg);
}

/**
 * Applies the current top-of-viewport color to BOTH the document background
 * (so any residual sliver around the app frame matches instead of showing
 * html's flat --bg-warm) and the <meta name="theme-color"> tag (so iOS
 * Safari's status bar tints to match). Call from an effect watching
 * (screen, overlay, authed) in App.tsx.
 */
export function setChromeColor(screen: ChromeScreen, overlay: Overlay | null): void {
  if (typeof document === 'undefined') return;
  const color = computeChromeColor(screen, overlay);
  document.documentElement.style.backgroundColor = color;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', color);
}
