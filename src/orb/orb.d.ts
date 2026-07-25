import * as React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'dror-orb': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        size?: string;
        state?: 'idle' | 'listening' | 'thinking';
      };
    }
  }
}

export {};
