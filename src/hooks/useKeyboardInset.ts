import { useEffect } from 'react';

// iOS Safari's on-screen keyboard does NOT shrink the layout viewport (only
// the visual viewport shrinks) — with the app shell pinned via
// `position:fixed` (base.css, Wave 4 Issue A) and bottom-anchored chrome
// like ChatBar sitting at a fixed `bottom` offset, that chrome can end up
// hidden behind the keyboard with no scroll fallback to reach it.
//
// window.visualViewport reports the actual visible area, so its shrinkage
// (plus any vertical scroll it does to keep the focused input on screen) is
// exactly the keyboard's covered height. This hook tracks that and publishes
// it as `--kb-inset` (a px value) on the document root, so any bottom-
// anchored element can fold it into its own `bottom` offset via
// `calc(<base> + var(--kb-inset, 0px))`.
//
// Modern Chrome/Android with `interactive-widget=resizes-content` (see
// index.html) resizes the layout viewport itself instead, so vv.height
// already tracks window.innerHeight there and this computes to ~0 — this
// hook is specifically the iOS Safari (and any other visualViewport-only)
// fallback; it's a no-op wherever `window.visualViewport` is unavailable.
//
// Also dispatches a `kb-inset-change` window CustomEvent on every update so
// interested consumers (PatientChat's auto-scroll-to-bottom effect) can
// re-pin their own scroll position when the keyboard opens/closes.
export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;

    const root = document.documentElement;

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
      window.dispatchEvent(new CustomEvent('kb-inset-change'));
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.setProperty('--kb-inset', '0px');
    };
  }, []);
}
