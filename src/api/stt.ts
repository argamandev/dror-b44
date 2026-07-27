import { base44 } from './base44Client';

// Speech-to-text for the session recorder and chat-bar dictation
// (Task W5.1). Sends recorded patient audio to the `stt` Deno function
// (base44/functions/stt/entry.ts), which is the ONLY thing allowed to talk
// to ElevenLabs with that audio — never call any transcription vendor
// directly from the browser.
//
// There is no client-side fallback for transcription, so failures are
// surfaced as typed errors the caller can branch on instead of being
// swallowed.

export type SttErrorCode = 'no_key' | 'too_large' | 'stt_failed';

export class SttError extends Error {
  code: SttErrorCode;

  constructor(code: SttErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'SttError';
    this.code = code;
  }
}

interface SttFunctionResult {
  text?: string;
  error?: string;
}

// The stt function only branches on file.size/mime broadly — the filename
// itself just needs an extension ElevenLabs can sniff a container from.
function filenameForMime(mime: string): string {
  if (mime.includes('mp4') || mime.includes('aac')) return 'audio.mp4';
  return 'audio.webm';
}

// invoke() throws on non-2xx with the error body at err.response.data (base44-facts.md §4);
// this pulls the `{error}` shape back out without assuming an axios error type is imported.
function errorCodeFrom(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('response' in err)) return undefined;
  const response = (err as { response?: { data?: { error?: unknown } } }).response;
  const code = response?.data?.error;
  return typeof code === 'string' ? code : undefined;
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const file = new File([blob], filenameForMime(blob.type), { type: blob.type || 'audio/webm' });

  let data: SttFunctionResult | undefined;
  try {
    const res = await base44.functions.invoke('stt', { file });
    data = res?.data as SttFunctionResult | undefined;
  } catch (err) {
    const code = errorCodeFrom(err);
    if (code === 'no_key') throw new SttError('no_key');
    if (code === 'too_large') throw new SttError('too_large');
    throw new SttError('stt_failed');
  }

  if (typeof data?.text !== 'string') {
    throw new SttError('stt_failed');
  }
  return data.text;
}
