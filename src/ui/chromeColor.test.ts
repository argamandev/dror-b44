import { describe, it, expect } from 'vitest';
import { blendOver, computeChromeColor, computeStripBackground } from './chromeColor';

describe('blendOver', () => {
  it('an opaque fg (alpha 1) returns the fg color untouched, regardless of bg', () => {
    expect(blendOver({ r: 107, g: 113, b: 246, a: 1 }, '#faf8fa')).toBe('#6b71f6');
    expect(blendOver({ r: 107, g: 113, b: 246, a: 1 }, '#000000')).toBe('#6b71f6');
  });

  it('a 0-alpha fg returns the bg color untouched', () => {
    expect(blendOver({ r: 0, g: 0, b: 0, a: 0 }, '#faf8fa')).toBe('#faf8fa');
    expect(blendOver({ r: 255, g: 20, b: 90, a: 0 }, '#123456')).toBe('#123456');
  });

  it('a known 50% case computes the per-channel average (white over black)', () => {
    // 255*0.5 + 0*0.5 = 127.5, Math.round rounds .5 up -> 128 = 0x80.
    expect(blendOver({ r: 255, g: 255, b: 255, a: 0.5 }, '#000000')).toBe('#808080');
  });

  it('matches the documented chat-screen composite (indigo 0.5 over #fbfafb)', () => {
    // R: 107*0.5 + 251*0.5 = 179.0 -> 0xb3
    // G: 113*0.5 + 250*0.5 = 181.5 -> round 182 -> 0xb6
    // B: 246*0.5 + 251*0.5 = 248.5 -> round 249 -> 0xf9
    expect(blendOver({ r: 107, g: 113, b: 246, a: 0.5 }, '#fbfafb')).toBe('#b3b6f9');
  });

  it('clamps an out-of-range alpha instead of producing an invalid color', () => {
    expect(blendOver({ r: 10, g: 10, b: 10, a: 1.5 }, '#ffffff')).toBe('#0a0a0a');
    expect(blendOver({ r: 10, g: 10, b: 10, a: -0.5 }, '#ffffff')).toBe('#ffffff');
  });
});

describe('computeChromeColor', () => {
  it('home (no overlay) is the fully-opaque hero indigo', () => {
    expect(computeChromeColor('home', null)).toBe('#6b71f6');
  });

  it('login/loading opens on the same hero as home, so it takes the same indigo', () => {
    expect(computeChromeColor('login', null)).toBe('#6b71f6');
    expect(computeChromeColor('login', null)).toBe(computeChromeColor('home', null));
  });

  it('the signing-in veil is near-black at the top, where its own glow has run out', () => {
    // R: 10*0.97 + 107*0.03 = 12.91 -> 13 -> 0x0d
    // G: 10*0.97 + 113*0.03 = 13.09 -> 13 -> 0x0d
    // B: 12*0.97 + 246*0.03 = 19.02 -> 19 -> 0x13
    expect(computeChromeColor('signingIn', null)).toBe('#0d0d13');
  });

  it('the dark-backdrop overlays (search, record, flow, settings) use the dark tone', () => {
    expect(computeChromeColor('profile', 'search')).toBe('#4a4a52');
    expect(computeChromeColor('profile', 'settings')).toBe('#4a4a52');
    expect(computeChromeColor('home', 'appSettings')).toBe('#4a4a52');
    expect(computeChromeColor('profile', 'flow')).toBe('#4a4a52');
    expect(computeChromeColor('home', 'record')).toBe('#4a4a52');
  });

  it('the menu drawer (W5.9) is light — its ivory panel under the dawn glow, not the dark tone', () => {
    // R: 107*0.2 + 251*0.8 = 222.2 -> 222 -> 0xde
    // G: 113*0.2 + 246*0.8 = 219.4 -> 219 -> 0xdb
    // B: 246*0.2 + 239*0.8 = 240.4 -> 240 -> 0xf0
    expect(computeChromeColor('home', 'menu')).toBe('#dedbf0');
    expect(computeChromeColor('chat', 'menu')).toBe('#dedbf0');
  });
});

describe('computeStripBackground', () => {
  it('gives each screen the flat base its gradient has faded to by the bottom', () => {
    expect(computeStripBackground('home', null)).toBe('#faf8fa');
    expect(computeStripBackground('profile', null)).toBe('#faf8fa');
    expect(computeStripBackground('world', null)).toBe('#faf8fa');
    expect(computeStripBackground('chat', null)).toBe('#fbfafb');
    // Login's bottom glow is lifted by --shell-gap, so its last rows are the
    // flat base too — same value, reached a different way.
    expect(computeStripBackground('login', null)).toBe('#faf8fa');
  });

  it('carries the signing-in veil down into the strip instead of the login base', () => {
    expect(computeStripBackground('signingIn', null)).toBe('#3c3f74');
    expect(computeStripBackground('signingIn', null)).not.toBe(
      computeStripBackground('login', null)
    );
  });

  // Measured 27.7: the record scrim's real bottom edge was #69686e while the
  // strip beside it sat at the old flat #4a4a52 — a top-of-viewport value,
  // where the scrim covers the gradient's blue peak instead of the flat base
  // it has faded to down here.
  it('composites each overlay scrim over the base of the screen behind it', () => {
    // R: 23*0.62 + 250*0.38 = 109.26 -> 109 -> 0x6d
    // G: 23*0.62 + 248*0.38 = 108.5  -> 109 -> 0x6d
    // B: 27*0.62 + 250*0.38 = 111.74 -> 112 -> 0x70
    expect(computeStripBackground('home', 'record')).toBe('#6d6d70');
    // The lighter 0.55 scrim every other overlay uses, same #faf8fa base.
    expect(computeStripBackground('profile', 'flow')).toBe('#7d7c7f');
  });

  it('follows the screen behind the overlay, not just the overlay', () => {
    // chat's base is #fbfafb, one level up from home's — the strip tracks it.
    expect(computeStripBackground('chat', 'search')).not.toBe(
      computeStripBackground('home', 'search')
    );
  });

  // THE STRIP TAKES FLAT COLORS ONLY: body's box ends at the seam, so only a
  // propagated background-color reaches the canvas below it. The split
  // gradient this used to return never painted — the founder's drawer
  // screenshot measured #dedbf0 there, which is computeChromeColor(_, 'menu'),
  // i.e. the canvas falling through to <html>'s status-bar color.
  it('gives the drawer strip the panel ivory, as a flat color', () => {
    expect(computeStripBackground('home', 'menu')).toBe('#fbf6ef');
  });

  it('never returns a gradient — a gradient here is a silent no-op', () => {
    const screens = ['home', 'profile', 'world', 'chat', 'draft', 'login', 'signingIn'] as const;
    const overlays = [null, 'menu', 'record', 'search', 'flow', 'settings', 'appSettings'] as const;
    for (const screen of screens) {
      for (const overlay of overlays) {
        expect(computeStripBackground(screen, overlay)).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
