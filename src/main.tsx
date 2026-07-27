import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/orb/orb.js';
import { applyShellGap } from '@/ui/shellGap';

// Before first paint, and again whenever the viewport changes (rotation, the
// keyboard, an iOS update that fixes the quirk under us): how far the shell
// must overflow the layout viewport to reach the physical bottom edge.
applyShellGap();
window.addEventListener('resize', applyShellGap);
window.addEventListener('orientationchange', applyShellGap);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
