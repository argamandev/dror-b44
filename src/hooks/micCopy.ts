import type { MicErrorKind } from './micAccess';

export interface MicGuidance {
  /** Short, calm statement of what's blocked — never implies the user refused. */
  headline: string;
  /** Concrete, ordered steps to actually fix it. */
  steps: string[];
}

// Calm Dror voice throughout: states what's blocked and how to open it, never
// "סירבת" ("you refused") or anything else that reads as blaming the user.
// 'denied' covers BOTH permission layers an iPhone has (see micAccess.ts) —
// the in-page site permission and the iOS system switch — since there is no
// way to tell from JS which one is actually blocking.
export const MIC_ERROR_COPY: Record<MicErrorKind, MicGuidance> = {
  denied: {
    headline: 'אין לדרור גישה למיקרופון',
    steps: [
      'לאפשר מיקרופון בהגדרות האתר בדפדפן',
      'באייפון: הגדרות ← Chrome (או Safari) ← מיקרופון',
    ],
  },
  busy: {
    headline: 'המיקרופון תפוס כרגע',
    steps: ['כנראה שאפליקציה אחרת משתמשת במיקרופון — כדאי לסגור אותה ולנסות שוב'],
  },
  'no-device': {
    headline: 'לא נמצא מיקרופון',
    steps: ['לא זוהה מיקרופון במכשיר — כדאי לבדוק חיבור של אוזניות או מיקרופון חיצוני ולנסות שוב'],
  },
  unsupported: {
    headline: 'ההקלטה אינה זמינה כאן',
    steps: ['הדפדפן הזה לא תומך בהקלטה במסך הזה — כדאי לנסות דרך האפליקציה המותקנת של דרור, או ב-Safari'],
  },
  unknown: {
    headline: 'לא הצלחנו לגשת למיקרופון',
    steps: ['אפשר לנסות שוב, ואם זה חוזר — לבדוק את הרשאות המיקרופון בהגדרות המכשיר'],
  },
};

export function getMicGuidance(kind: MicErrorKind): MicGuidance {
  return MIC_ERROR_COPY[kind];
}
