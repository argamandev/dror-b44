// Backend function: `stt`. Transcribes patient audio (voice conversation
// overlay / session recorder) to Hebrew text via ElevenLabs scribe_v1.
// Auth/import pattern per docs/context/base44-facts.md §4 (mirrors
// base44/functions/tts/entry.ts).
//
// Patient audio must only ever reach ElevenLabs, and only through this
// auth-gated function — src/api/stt.ts's transcribeAudio() is the sole
// frontend caller.
import { createClientFromRequest } from "npm:@base44/sdk";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
// scribe_v1 + heb: verified word-for-word accurate on Hebrew round-trip
// (2026-07-27) — see task-w51-brief.md's verified context.
const ELEVEN_MODEL_ID = "scribe_v1";
const LANGUAGE_CODE = "heb";

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: "too_large" }, { status: 413 });
    }

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return Response.json({ error: "no_key" }, { status: 503 });
    }

    const upstreamForm = new FormData();
    upstreamForm.append("model_id", ELEVEN_MODEL_ID);
    upstreamForm.append("language_code", LANGUAGE_CODE);
    upstreamForm.append("file", file, file.name || "audio");

    let res: Response;
    try {
      res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
        },
        body: upstreamForm,
      });
    } catch {
      return Response.json({ error: "stt_failed" }, { status: 502 });
    }

    if (!res.ok) {
      return Response.json({ error: "stt_failed" }, { status: 502 });
    }

    const result = (await res.json()) as { text?: unknown };
    if (typeof result.text !== "string") {
      return Response.json({ error: "stt_failed" }, { status: 502 });
    }

    return Response.json({ text: result.text });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
