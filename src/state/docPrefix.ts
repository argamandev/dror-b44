// Pure composition for the "רק לשיחה הזאת" upload path (Task W5.6): a document
// the therapist attached to the conversation only — never persisted as a
// PatientDoc — is carried into the NEXT message sent to the Dror agent as a
// labelled prefix. Extracted so the cap (a long scanned PDF must not blow the
// agent's context) and the nothing-to-attach branch are independently testable.

/** Longest run of extracted document text we will ever prefix to a message. */
export const DOC_PREFIX_CAP = 4000;

/** Opening label the agent sees before the document's text. */
export const DOC_PREFIX_LABEL = 'מסמך שהועלה לשיחה: ';

export interface ChatDoc {
  /** Shown to the therapist in the chip above the input; not sent to the agent. */
  title: string;
  /** Text extracted from the uploaded file. */
  text: string;
}

export function composeDocMessage(doc: ChatDoc | null, message: string): string {
  const text = doc?.text.trim() ?? '';
  if (!text) return message;
  const capped = text.length > DOC_PREFIX_CAP ? `${text.slice(0, DOC_PREFIX_CAP)}…` : text;
  return `${DOC_PREFIX_LABEL}${capped}\n\n${message}`;
}
