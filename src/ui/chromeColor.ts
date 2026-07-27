import type { Overlay, Screen } from '@/state/useAppState';

// Wave 4 Issue A ("dynamic chrome blending"): the founder's iPhone screenshot
// showed a light band above Home's gradient under the status bar, and
// finger-drag revealed more of it. Locking the document from scrolling at
// all (src/styles/base.css: html,body position:fixed) removes the
// rubber-band that exposed it, but the status bar itself is still a FIXED
// color (index.html's <meta name="theme-color"> + iOS reading the page's own
// background-color) that doesn't match every screen's own top-of-viewport
// tone. This module keeps both in sync with whatever's actually on screen.
//
// Task W5.8 update: until W5.8, body carried the top safe-area padding plus
// its own opaque var(--bg-warm), so the strip under the status bar showed THAT
// and the color written to <html> below was never actually visible on a phone.
// Now that the screens' background layers paint from y=0, the status-bar
// region shows each screen's real gradient — which is what the values below
// approximate, so they finally describe what's on screen instead of standing
// in for it. <html>'s color still matters for the gutters either side of the
// 430px column on desktop, and the <meta> for browsers that tint chrome from
// it.

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

// The two pseudo-"screens" that aren't part of useAppState's Screen union:
// App.tsx renders Login (and the pre-auth loading spinner) before any
// `useAppState` exists at all, and Login raises its own full-viewport
// signing-in veil while the auth call is in flight.
export type ChromeScreen = Screen | 'login' | 'signingIn';

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
  // Profile.tsx heroStyle: since the design import it is the SAME full-bleed
  // gradient World uses, wrapped in `opacity: 0.35` — so it takes World's
  // treatment (the wrapper opacity as the effective alpha) rather than the
  // old rounded hero's 0.96.
  profile: { fg: { r: 107, g: 113, b: 246, a: 0.35 }, bg: '#faf8fa' },
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
  // no screen content yet). Both were flat var(--bg-warm) until Login was
  // rebuilt from the design project's entry page: it now opens on the same
  // dawn hero as Home, whose peak stop is opaque, so the status bar over it is
  // the same indigo. The loading spinner was given the identical background
  // layer in App.tsx rather than a second ChromeScreen entry — the two states
  // are a fifth of a second apart and any difference would read as a flash.
  login: { fg: { r: 107, g: 113, b: 246, a: 1 }, bg: '#6b71f6' },
  // Login's signing-in veil (Login.tsx signingInStyle) covers the whole
  // viewport. At y=0 the veil's own radial is long past its last stop, so what
  // is left is its outermost rgba(10,10,12,0.97) over the hero above. The
  // rgba(12,12,14,0.92) base layer between them is dropped: at 97% opacity it
  // moves the result by under six levels of near-black.
  signingIn: { fg: { r: 10, g: 10, b: 12, a: 0.97 }, bg: '#6b71f6' },
};

// Task W5.9: the menu drawer is the one overlay that is NOT a dark backdrop.
// It is a light ivory panel occupying ~86% of the column from the right edge
// (the remaining ~14% is the dimmed app peek), and what sits under the status
// bar while it is open is the soft dawn glow at the panel's top corner. Same
// method as SCREEN_COLOR_SPECS above — the glow's peak stop, at its own alpha,
// over the panel's flat ivory base (MenuDrawer.tsx PANEL_BG).
const MENU_SPEC: ScreenColorSpec = { fg: { r: 107, g: 113, b: 246, a: 0.2 }, bg: '#fbf6ef' };

// Every other dark, full-bleed overlay (SearchOverlay, PatientContextOverlay
// ['settings'], AppSettingsOverlay ['appSettings'], FlowOverlay, RecordOverlay)
// renders its `rgba(23,23,27,0.5-0.62)` backdrop across the
// ENTIRE viewport (position:absolute; inset:0) with its actual card/panel
// content positioned lower down (top:120-150px) — so at y=0, under the
// status bar, what's showing is always that dark backdrop over whatever
// screen sits behind it. The exact backdrop alpha varies slightly per
// overlay and the screen behind it varies too — per the spec, a single flat approximation
// stands in for all of them rather than a combinatorial per-overlay,
// per-screen table. Derivation: rgba(23,23,27,0.55) blended over a
// mid-tone screen backdrop rounds to roughly this — dark, faintly cool grey.
// (0.55 for most, 0.62 for RecordOverlay.)
const OVERLAY_DARK = '#4a4a52';

// ---- The bottom strip (src/ui/shellGap.ts) ----
//
// Same idea as everything above, at the other edge. On a device that
// withholds a strip below the app shell, body's background is the one thing
// that still paints there, so it has to carry the BOTTOM edge of whatever
// surface is on screen — otherwise the strip reads as a block stuck to the
// bottom of the app instead of part of it. Where the top table takes each
// gradient's peak stop, this one takes the flat base every screen's gradient
// has faded to by the time it reaches the bottom (Profile's bottom glow is
// lifted clear of the strip for exactly this reason, so it qualifies too).
const SCREEN_STRIP: Record<ChromeScreen, string> = {
  home: '#faf8fa',
  profile: '#faf8fa',
  world: '#faf8fa',
  chat: '#fbfafb',
  draft: '#fbfafb',
  // Login's bottom glow is lifted by --shell-gap (Login.tsx bottomGlowStyle),
  // exactly as Profile's is, so the screen's last rows are the flat base too.
  login: '#faf8fa',
  // The signing-in veil is the one surface whose bottom edge is a live
  // gradient — its dawn glow rises from 50% 106%, so the strip is brightest
  // indigo-violet at the centre (#3f427c) and nearly the flat dark at the
  // corners (#32343e). No flat value serves both, and flat is all the strip
  // takes (see MENU_STRIP below). This is the value a quarter of the way out
  // from the centre, which is where the eye is while the orb spins.
  signingIn: '#3c3f74',
};

// The menu is the one surface that is two surfaces: the ivory panel over the
// right DRAWER_WIDTH_PCT of the column, the dimmed app peeking on the left.
// This used to be split at the same percentage, with a linear-gradient — and
// that silently did nothing. THE STRIP TAKES FLAT COLORS ONLY.
//
// Measured on the founder's drawer screenshot (27.7): the strip came out
// #dedbf0 across its whole width — neither half of the split, but exactly
// computeChromeColor(screen, 'menu'), the value this module writes to <html>
// for the status bar. body's box ends at the seam (position:fixed, base.css),
// so what reaches the canvas below it is a PROPAGATED background; a flat
// background-color propagates, a gradient image does not, and the canvas
// falls through to <html>'s color instead. Anything but a plain color here is
// a no-op that will quietly show the status-bar tone at the opposite edge of
// the screen.
//
// So: the panel's ivory, its dawn glow long since faded at this height. It
// covers the DRAWER_WIDTH_PCT the panel itself covers; the remaining sliver
// of peek is 14% of a 59px strip in the corner, and no flat value can serve
// both halves.
const MENU_STRIP = '#fbf6ef';

// The strip under a dark overlay is NOT OVERLAY_DARK. That constant is a
// top-of-viewport value: up there the scrim covers each screen's gradient at
// its blue PEAK, so it composites dark. Down here the same scrim covers the
// flat base the gradient has long since faded to, which is far lighter — one
// constant cannot serve both edges of the screen.
//
// Measured on the founder's record screen (27.7): the scrim's real bottom
// edge #69686e against the strip's #4a4a52 — 31 levels, a dark slab bolted
// under the app. Compositing each overlay's OWN scrim alpha over the screen's
// own strip base instead gives #6d6d70 for that case; the ~4-level residual
// is the backdrop blur pulling light in through the scrim, invisible next to
// the 31 it replaces.
const SCRIM_BLACK = { r: 23, g: 23, b: 27 };

// Each overlay's scrim alpha, from its own backdrop style. The menu is absent
// on purpose — it is a light panel, handled by MENU_STRIP above.
const SCRIM_ALPHA: Record<Exclude<NonNullable<Overlay>, 'menu'>, number> = {
  record: 0.62, // RecordOverlay.tsx (recordScrim)
  search: 0.55, // SearchOverlay.tsx
  flow: 0.55, // FlowOverlay.tsx
  settings: 0.55, // PatientContextOverlay.tsx
  appSettings: 0.55, // AppSettingsOverlay.tsx
};

/**
 * What to paint in the strip below the shell for a given (screen, overlay)
 * pair — a CSS background value, so it can be a gradient. Pure, no DOM.
 */
export function computeStripBackground(screen: ChromeScreen, overlay: Overlay | null): string {
  if (overlay === 'menu') return MENU_STRIP;
  const base = SCREEN_STRIP[screen];
  // Every other overlay lays its scrim across the whole frame, so the strip
  // continues it — over the base of whichever screen is behind it.
  if (overlay) return blendOver({ ...SCRIM_BLACK, a: SCRIM_ALPHA[overlay] }, base);
  return base;
}

/** Computes the top-of-viewport color for a given (screen, overlay) pair — pure, no DOM access. */
export function computeChromeColor(screen: ChromeScreen, overlay: Overlay | null): string {
  if (overlay === 'menu') return blendOver(MENU_SPEC.fg, MENU_SPEC.bg);
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
  // The other edge: body sits UNDER the frame, so this is invisible except in
  // the strip the frame cannot reach (src/ui/shellGap.ts).
  document.body.style.background = computeStripBackground(screen, overlay);
}
