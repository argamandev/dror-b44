import { describe, it, expect } from 'vitest';
import { blendOver, computeChromeColor } from './chromeColor';

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

  it('login/loading is the flat warm background', () => {
    expect(computeChromeColor('login', null)).toBe('#faf8fa');
  });

  it('any non-voice overlay open (menu, search, record, flow, settings) uses the dark backdrop tone', () => {
    expect(computeChromeColor('home', 'menu')).toBe('#4a4a52');
    expect(computeChromeColor('profile', 'search')).toBe('#4a4a52');
    expect(computeChromeColor('profile', 'settings')).toBe('#4a4a52');
    expect(computeChromeColor('home', 'appSettings')).toBe('#4a4a52');
    expect(computeChromeColor('profile', 'flow')).toBe('#4a4a52');
    expect(computeChromeColor('home', 'record')).toBe('#4a4a52');
  });

  it('the voice overlay uses its own near-black tone regardless of screen', () => {
    expect(computeChromeColor('home', 'voice')).toBe('#0c0c0e');
  });
});
