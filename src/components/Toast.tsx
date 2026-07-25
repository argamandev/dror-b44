import type { CSSProperties } from 'react';

const toastStyle: CSSProperties = {
  position: 'absolute',
  left: 30,
  right: 30,
  bottom: 170,
  zIndex: 12,
  background: '#17171b',
  color: '#ffffff',
  borderRadius: 999,
  padding: '13px 22px',
  fontSize: 13.5,
  textAlign: 'center',
  boxShadow: '0 14px 34px rgba(0,0,0,0.3)',
  animation: 'drRise 0.3s ease',
};

export default function Toast({ text }: { text: string }) {
  return <div style={toastStyle}>{text}</div>;
}
