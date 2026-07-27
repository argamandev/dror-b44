import { describe, expect, it } from 'vitest';
import { shellGap } from '@/ui/shellGap';

describe('shellGap', () => {
  it('returns the shortfall measured on the founder\'s iPhone', () => {
    // 932px screen, 873px layout viewport — the 59px is safe-area-inset-top,
    // handed back as dead canvas at the bottom.
    expect(shellGap({ standalone: true, screenHeight: 932, innerHeight: 873 })).toBe(59);
  });

  it('corrects nothing when the installed app already fills the screen', () => {
    expect(shellGap({ standalone: true, screenHeight: 932, innerHeight: 932 })).toBe(0);
  });

  it('corrects nothing in a browser, where the difference is toolbars', () => {
    // Safari with its toolbars showing — painting under them would bury the
    // ChatBar rather than reveal the strip.
    expect(shellGap({ standalone: false, screenHeight: 932, innerHeight: 745 })).toBe(0);
  });

  it('ignores a gap too large to be a status bar', () => {
    // Landscape in the installed app: screen.height stays portrait-tall on
    // iOS while innerHeight collapses. Not this bug — leave the layout alone.
    expect(shellGap({ standalone: true, screenHeight: 932, innerHeight: 430 })).toBe(0);
  });

  it('ignores a viewport taller than the screen', () => {
    expect(shellGap({ standalone: true, screenHeight: 932, innerHeight: 1000 })).toBe(0);
  });

  it('rounds a fractional viewport height', () => {
    expect(shellGap({ standalone: true, screenHeight: 932, innerHeight: 873.4 })).toBe(59);
  });

  it('accepts the smaller status bars on notched iPhones', () => {
    expect(shellGap({ standalone: true, screenHeight: 844, innerHeight: 797 })).toBe(47);
  });
});
