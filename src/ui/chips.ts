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
    return { ...base, color: '#6a74c8', background: 'rgba(169,185,249,0.30)' };
  }
  if (t === 'rec') {
    return { ...base, color: '#9a7147', background: 'rgba(246,217,196,0.65)' };
  }
  return { ...base, color: '#5a60c0', background: 'rgba(107,113,246,0.14)' };
}
