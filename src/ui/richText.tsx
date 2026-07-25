import type { ReactNode } from 'react';

// Defensive fallback for the live-QA bug where Dror's replies render literal
// markdown (**bold**, "* item") as plain asterisks in the chat bubble. The
// primary fix is the agent's own instructions (base44/agents/dror.jsonc), but
// this renders any markdown that slips through as plain text/React elements —
// no dangerouslySetInnerHTML.

export interface AssistantTextSegment {
  type: 'text' | 'bold';
  value: string;
}

// Matches complete **...** pairs only (non-greedy, single line). An unmatched
// "**" (no closing pair) simply never matches, so it falls through untouched
// inside a surrounding text segment.
const BOLD_PAIR_RE = /\*\*(.+?)\*\*/g;

export function parseAssistantText(text: string): AssistantTextSegment[] {
  const segments: AssistantTextSegment[] = [];
  let lastIndex = 0;
  BOLD_PAIR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BOLD_PAIR_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'bold', value: match[1] });
    lastIndex = BOLD_PAIR_RE.lastIndex;
  }
  if (lastIndex < text.length || segments.length === 0) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

// Converts a line-leading "* " or "- " (list-style markdown) into "• ".
// Only touches the start of a line — a mid-line " - " or " * " (e.g. a
// literal subtraction/multiplication) is left alone.
const BULLET_LINE_RE = /^[*-] /;

export function normalizeBulletLines(text: string): string {
  return text
    .split('\n')
    .map((line) => (BULLET_LINE_RE.test(line) ? '• ' + line.slice(2) : line))
    .join('\n');
}

// Renders an assistant message as plain React nodes: bullet-normalized, with
// **bold** spans turned into <strong>. Newlines are left as literal "\n"
// characters — the chat bubble that hosts this (PatientChat's drorBubbleStyle)
// already sets whiteSpace: 'pre-wrap', so no <br/> wrapping is needed.
export function renderAssistantText(text: string): ReactNode {
  const normalized = normalizeBulletLines(text);
  const segments = parseAssistantText(normalized);
  return segments.map((segment, i) =>
    segment.type === 'bold' ? <strong key={i}>{segment.value}</strong> : segment.value
  );
}
