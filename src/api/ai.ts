import { base44 } from './base44Client';
import type { AgentConversation } from '@base44/sdk';

// Transport to the `dror` Base44 agent (base44/agents/dror.jsonc). The agent is
// managed and conversational — the platform runs the tool-calling loop — so we
// talk to it through the documented conversation API (base44-agents.md §Methods):
//   createConversation -> addMessage -> subscribeToConversation / getConversation.
// There is no token streaming; the UI shows a "דרור חושב…" state, then the full
// reply. We resolve on the first completed agent reply to our message.

const AGENT_NAME = 'dror';
const REPLY_TIMEOUT_MS = 60000;
// How long to wait, after a candidate answer appears and no tool call is still
// running, before treating it as final (guards against resolving on an
// intermediate turn while the agent is still mid-loop).
const SETTLE_MS = 900;

export interface AskDrorArgs {
  message: string;
  /** Patient this conversation is about; omit for a general (home) chat. */
  patientId?: string;
  /** Full name, used only to build the first-message context envelope. */
  patientName?: string;
  /** Resume an existing agent conversation instead of creating a new one. */
  conversationId?: string;
}

export interface AskDrorResult {
  answer: string;
  conversationId: string;
}

interface AgentMsg {
  role?: string;
  content?: unknown;
  tool_calls?: { status?: string }[];
}

// Tool-call statuses that mean the agent is still mid-loop — a reply seen
// while any tool call is in one of these states isn't final yet.
const NON_TERMINAL_TOOL_STATUSES = new Set(['running', 'waiting_for_user_input']);

function assistantText(m: AgentMsg): string | null {
  if (m.role !== 'assistant') return null;
  const c = m.content;
  let text = '';
  if (typeof c === 'string') {
    text = c;
  } else if (c && typeof c === 'object') {
    // Some content shapes come back as an object rather than a plain string.
    // Prefer a `.text` field when present; only fall back to stringifying
    // the whole object when there's no `.text` to prefer. If neither yields
    // text, this isn't treated as a (empty) reply — return null so the
    // caller keeps waiting instead of resolving on an empty string.
    const obj = c as Record<string, unknown>;
    text = typeof obj.text === 'string' ? obj.text : JSON.stringify(c);
  }
  return text.trim() ? text : null;
}

// Resolve with the agent's completed reply to the message we just sent. Uses the
// realtime subscription (push) with a getConversation poll as a backstop, since
// the subscription is WebSocket-based and can miss the terminal update.
function waitForReply(conversationId: string, priorAssistantCount: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let hardTimeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      clearTimeout(settleTimer);
      clearTimeout(hardTimeout);
      if (poll) clearInterval(poll);
      try {
        unsubscribe?.();
      } catch {
        /* ignore */
      }
    };

    const finish = (text: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(text);
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('DROR_TIMEOUT'));
    };

    const evaluate = (conv: AgentConversation | undefined | null) => {
      if (settled || !conv) return;
      const msgs = (conv.messages ?? []) as AgentMsg[];
      const answers = msgs.map(assistantText).filter((t): t is string => t !== null);
      // Only accept a NEW assistant reply (beyond any that predated our message).
      if (answers.length <= priorAssistantCount) return;
      const stillRunning = msgs.some((m) =>
        (m.tool_calls ?? []).some((t) => !!t?.status && NON_TERMINAL_TOOL_STATUSES.has(t.status))
      );
      if (stillRunning) return; // agent is still working a tool call — keep waiting
      const latest = answers[answers.length - 1];
      // Debounce: wait briefly for any follow-up turn before committing.
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => finish(latest), SETTLE_MS);
    };

    try {
      unsubscribe = base44.agents.subscribeToConversation(conversationId, evaluate);
    } catch {
      /* fall back to polling only */
    }

    poll = setInterval(() => {
      base44.agents.getConversation(conversationId).then(evaluate).catch(() => {});
    }, 2500);

    hardTimeout = setTimeout(fail, REPLY_TIMEOUT_MS);

    // Kick once immediately in case the reply is already present.
    base44.agents.getConversation(conversationId).then(evaluate).catch(() => {});
  });
}

// Transport to the `summarize` Deno function (base44/functions/summarize/entry.ts).
// Unlike the agent chat above, this is a plain request/response backend
// function — no conversation, no streaming. `invoke()` returns the raw axios
// response (payload on `.data`) and throws on any non-2xx status; we wrap
// both the thrown error and a malformed success body into a single Error so
// the FlowOverlay's catch path (toast + back to S3) has one shape to handle.
export interface SummarizeSessionArgs {
  patientId: string;
  /** Live transcript or typed notes from the session. */
  source: string;
  /** Optional therapist guidance for this specific draft. */
  guide: string;
}

export interface SummarizeSessionResult {
  title: string;
  body: string;
  /** Up to three short topics; absent/odd values become [] rather than an error. */
  tags: string[];
}

export async function summarizeSession(args: SummarizeSessionArgs): Promise<SummarizeSessionResult> {
  const { patientId, source, guide } = args;
  let data: unknown;
  try {
    const res = await base44.functions.invoke('summarize', { patient_id: patientId, source, guide });
    data = res.data;
  } catch {
    throw new Error('SUMMARIZE_FAILED');
  }
  const result = data as Partial<SummarizeSessionResult> | undefined;
  if (!result || typeof result.title !== 'string' || typeof result.body !== 'string') {
    throw new Error('SUMMARIZE_FAILED');
  }
  const tags = Array.isArray(result.tags)
    ? result.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : [];
  return { title: result.title, body: result.body, tags };
}

// Transport to the `document` Deno function (base44/functions/document/entry.ts).
// Same request/response shape as summarizeSession above — no conversation, no
// streaming, `.data` off the raw axios response, one Error on any failure so
// the FlowOverlay's catch path (toast + back to docS3) has one shape to handle.
export interface DraftDocumentArgs {
  patientId: string;
  /** Free-text or chip-picked document type, e.g. "אישור טיפול". */
  docType: string;
  /** Therapist's stated goal/guidance for this document. */
  purpose: string;
  /** 'all' entries, or the specific (1-indexed, oldest=1) session numbers picked. */
  meetings: 'all' | number[];
}

export interface DraftDocumentResult {
  title: string;
  body: string;
}

export async function draftDocument(args: DraftDocumentArgs): Promise<DraftDocumentResult> {
  const { patientId, docType, purpose, meetings } = args;
  let data: unknown;
  try {
    const res = await base44.functions.invoke('document', {
      patient_id: patientId,
      doc_type: docType,
      purpose,
      meetings,
    });
    data = res.data;
  } catch {
    throw new Error('DOCUMENT_FAILED');
  }
  const result = data as Partial<DraftDocumentResult> | undefined;
  if (!result || typeof result.title !== 'string' || typeof result.body !== 'string') {
    throw new Error('DOCUMENT_FAILED');
  }
  return { title: result.title, body: result.body };
}

export async function askDror(args: AskDrorArgs): Promise<AskDrorResult> {
  const { message, patientId, patientName, conversationId } = args;

  // 1. Reuse or create the agent conversation.
  const existing = conversationId ? await base44.agents.getConversation(conversationId) : undefined;
  const conversation: AgentConversation =
    existing ??
    (await base44.agents.createConversation({
      agent_name: AGENT_NAME,
      ...(patientId ? { metadata: { patient_id: patientId } } : {}),
    }));

  const priorMessages = (conversation.messages ?? []) as AgentMsg[];

  // 2. On the first message of a patient-scoped conversation, prefix a context
  //    envelope so the agent knows which patient (and today's date) to work with.
  //    Its entity tools then look the patient's records up by id.
  let content = message;
  if (patientId && priorMessages.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    const who = patientName ? `${patientName}, id ${patientId}` : `id ${patientId}`;
    content = `[הקשר: השיחה עוסקת במטופל/ת ${who}. תאריך היום: ${today}]\n${message}`;
  }

  // 3. Count replies that predate our message so we can spot the new one.
  const priorAssistantCount = priorMessages.map(assistantText).filter((t) => t !== null).length;

  // 4. Send and await the agent's completed reply.
  await base44.agents.addMessage(conversation, { role: 'user', content });
  const answer = await waitForReply(conversation.id, priorAssistantCount);

  return { answer, conversationId: conversation.id };
}
