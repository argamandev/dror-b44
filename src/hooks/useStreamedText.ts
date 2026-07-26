import { useEffect, useRef, useState } from 'react';

const TICK_MS = 40;

// Splits `text` into cumulative reveal slices for the simulated-streaming
// effect: each slice adds one more "word unit" (a non-whitespace run plus
// whatever whitespace immediately follows it) than the previous one, so
// consumers can step through the array to reveal ~1-2 words per tick.
// Concatenating a word's whitespace onto ITSELF (rather than the next word)
// means the final slice reconstructs `text` byte-for-byte — every space,
// tab and newline lands exactly where it was, including a trailing run of
// whitespace after the last word.
//
// Pure and independently tested (useStreamedText.test.ts) — no timers, no
// DOM. The hook below is just an interval stepping an index through this
// array.
export function streamSlices(text: string): string[] {
  if (text === '') return [];
  // A "word unit" is a run of non-whitespace plus any whitespace right
  // after it. If `text` is non-empty but has no non-whitespace character at
  // all (pure whitespace), fall back to treating the whole string as one
  // unit so it isn't silently dropped.
  const tokens = text.match(/\s*\S+\s*/g) ?? [text];

  const slices: string[] = [];
  let acc = '';
  for (let i = 0; i < tokens.length; i += 2) {
    acc += tokens[i] + (tokens[i + 1] ?? '');
    slices.push(acc);
  }
  return slices;
}

// Reveals `fullText` progressively (word-chunk every ~40ms) when `enabled`
// is true, composing with the chat bubble's renderer as it grows —
// `renderAssistantText(shown)` is safe to call on every partial slice since
// an unmatched "**" just falls through as literal text until its pair
// arrives (see ui/richText.ts).
//
// `enabled=false` shows the full text immediately (used for every message
// except the newest Dror reply — PatientChat tracks which index that is).
// If `fullText` itself changes while `enabled` stays true (a new reply
// replacing the one being tracked), the previous interval is torn down and
// a fresh reveal starts for the new text — this IS the mechanism that lets
// each successive Dror reply stream in turn.
export function useStreamedText(fullText: string, enabled: boolean): { shown: string; done: boolean } {
  const [shown, setShown] = useState(() => (enabled ? '' : fullText));
  const [done, setDone] = useState(() => !enabled);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    clearInterval(timerRef.current);

    if (!enabled) {
      setShown(fullText);
      setDone(true);
      return;
    }

    const slices = streamSlices(fullText);
    if (slices.length === 0) {
      setShown('');
      setDone(true);
      return undefined;
    }

    let i = 0;
    setShown(slices[0]);
    setDone(slices.length === 1);

    if (slices.length > 1) {
      timerRef.current = setInterval(() => {
        i += 1;
        setShown(slices[i]);
        if (i >= slices.length - 1) {
          clearInterval(timerRef.current);
          setDone(true);
        }
      }, TICK_MS);
    }

    return () => clearInterval(timerRef.current);
  }, [fullText, enabled]);

  return { shown, done };
}
