import { describe, it, expect } from 'vitest';
import { streamSlices } from './useStreamedText';

// Pure chunking logic behind the simulated-streaming hook. streamSlices
// returns cumulative reveal slices (1-2 words added per step) that
// useStreamedText steps through on an interval — tested here without any DOM
// or timers involved.
describe('streamSlices', () => {
  it('returns no slices for an empty string', () => {
    expect(streamSlices('')).toEqual([]);
  });

  it('returns a single slice equal to the whole text for one word', () => {
    expect(streamSlices('שלום')).toEqual(['שלום']);
  });

  it('builds cumulative slices that end with the full text', () => {
    const text = 'אחת שתיים שלוש ארבע חמש';
    const slices = streamSlices(text);
    expect(slices.length).toBeGreaterThan(1);
    expect(slices[slices.length - 1]).toBe(text);
    // Cumulative: each slice is a strict prefix-by-tokens of the next.
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i].startsWith(slices[i - 1])).toBe(true);
      expect(slices[i].length).toBeGreaterThan(slices[i - 1].length);
    }
  });

  it('preserves whitespace and newlines exactly in the final slice', () => {
    const text = 'שורה  ראשונה\nשורה שתיים   עם  רווחים';
    const slices = streamSlices(text);
    expect(slices[slices.length - 1]).toBe(text);
  });

  it('preserves a trailing newline in the final slice', () => {
    const text = 'משפט קצר\n';
    const slices = streamSlices(text);
    expect(slices[slices.length - 1]).toBe(text);
  });
});
