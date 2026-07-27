import { base44 } from './base44Client';

// Task W5.6 — patient documents the therapist uploads from the ChatBar's +.
//
// PRIVACY: uploads go to PRIVATE storage only (Core.UploadPrivateFile ->
// file_uri), never Core.UploadFile (public storage) — not even as a fallback.
// The file is reachable afterwards only through a short-lived signed url, and
// nothing but the extracted text is ever persisted in plain form.

export interface PatientDoc {
  id: string;
  patient_id: string;
  title: string;
  file_uri: string;
  extracted_text: string;
  doc_date: string;
}

/** Which half of the round-trip is running, for the ChatBar's progress chip. */
export type UploadStage = 'uploading' | 'reading';

export interface UploadedDoc {
  /** Private-storage uri (NOT a url) — signing is required to read the file. */
  fileUri: string;
  /** Extracted document title, falling back to the file's own name. */
  title: string;
  /** Extracted text; '' when extraction failed or found nothing readable. */
  text: string;
  /** True when the extraction step failed — the file itself is still stored. */
  extractionFailed: boolean;
}

// What we ask the extractor for: a human title and the document's text.
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    content: { type: 'string' },
  },
};

// The extractor is documented as returning "the extracted data", but the live
// endpoint wraps it: { status: 'success' | 'error', output: {...}, details }.
// Accept both shapes rather than betting on one.
function readExtraction(raw: unknown): { title: string; content: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const status = typeof obj.status === 'string' ? obj.status : undefined;
  if (status && status !== 'success') return null;
  const payload = (obj.output && typeof obj.output === 'object' ? obj.output : obj) as Record<string, unknown>;
  const title = typeof payload.title === 'string' ? payload.title : '';
  const content = typeof payload.content === 'string' ? payload.content : '';
  if (!title && !content) return null;
  return { title, content };
}

// The SDK sets no request timeout of its own, so a signed-url or extraction
// call that never answers would park the upload forever and — worse — leave
// the file in private storage with no PatientDoc pointing at it. This is the
// ceiling for BOTH calls together, after which we give up on reading the
// document and save it unread (review round 1, Important 1).
const EXTRACT_TIMEOUT_MS = 120000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DOC_EXTRACT_TIMEOUT')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// 'הפניה מהרופא.pdf' -> 'הפניה מהרופא'. Used when extraction gives no title.
function titleFromFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base.trim() || 'מסמך';
}

/**
 * Upload to private storage, then try to read the document's text through a
 * signed url. Throws only if the UPLOAD fails — a failed extraction is
 * reported as `extractionFailed` with the file still safely stored, since the
 * therapist's file must never be silently lost over an AI step.
 */
export async function uploadPrivateDoc(
  file: File,
  onStage?: (stage: UploadStage) => void
): Promise<UploadedDoc> {
  onStage?.('uploading');
  const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });

  onStage?.('reading');
  let extracted: { title: string; content: string } | null = null;
  let extractionFailed = false;
  try {
    // A hang is treated exactly like a rejection: the race rejects, the catch
    // below degrades to extractionFailed, and the caller still creates the
    // PatientDoc with empty extracted_text.
    extracted = await withTimeout(
      (async () => {
        // 10 minutes: long enough for the extractor to fetch the file (and
        // comfortably longer than the timeout above), short enough that a
        // leaked url is worth little.
        const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
          file_uri,
          expires_in: 600,
        });
        const raw = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url: signed_url,
          json_schema: EXTRACT_SCHEMA,
        });
        return readExtraction(raw);
      })(),
      EXTRACT_TIMEOUT_MS
    );
    if (!extracted) extractionFailed = true;
  } catch {
    extractionFailed = true;
  }

  return {
    fileUri: file_uri,
    title: extracted?.title?.trim() || titleFromFileName(file.name),
    text: extracted?.content?.trim() ?? '',
    extractionFailed,
  };
}

export const createPatientDoc = (doc: {
  patient_id: string;
  title: string;
  file_uri: string;
  extracted_text: string;
  doc_date: string;
}): Promise<PatientDoc> => base44.entities.PatientDoc.create(doc);
