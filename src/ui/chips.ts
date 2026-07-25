import type { CSSProperties } from 'react';

// Entry-type chip style, ported from the design mock (lines 656-660).
// No test required per controller resolution — style objects, not behavior.
export function chipStyle(t: string): CSSProperties {
  const base: CSSProperties = {
    fontSize: 11.5,
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: 999,
  };
  if (t === 'doc') {
    return { ...base, color: '#7d5d76', background: 'rgba(208,177,202,0.28)' };
  }
  if (t === 'rec') {
    return { ...base, color: '#8a6a4f', background: 'rgba(245,153,105,0.22)' };
  }
  return { ...base, color: '#a04a43', background: 'rgba(238,90,80,0.14)' };
}
