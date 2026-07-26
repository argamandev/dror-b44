// Backend function: `tts`. Converts a short piece of Hebrew text (Dror's
// spoken reply in the voice conversation overlay) to speech via ElevenLabs.
// Auth/import pattern per docs/context/base44-facts.md §4 (mirrors
// base44/functions/summarize/entry.ts).
//
// Priority-chain partner: src/api/tts.ts's speakHebrew() calls this function
// first; if ELEVENLABS_API_KEY isn't configured yet (503 below), or the call
// otherwise fails (502), it falls back to the browser's speechSynthesis. This
// function's key is NOT set yet as of this task (see task-11 report) — the
// 503 path is the expected/tested one until `npx base44 secrets set
// ELEVENLABS_API_KEY=...` + a redeploy activate the real ElevenLabs path.
import { createClientFromRequest } from "npm:@base44/sdk";

// Voice id is a placeholder (ElevenLabs' stock "Adam" voice) — swap for a
// different/cloned voice later; nothing else here needs to change.
const ELEVEN_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
// eleven_v3: verified Hebrew-capable (round-trip tested 2026-07-27 — v3
// audio of a Hebrew sentence transcribed back word-for-word by scribe_v1).
// eleven_multilingual_v2 (the prior model here) does NOT support Hebrew.
const ELEVEN_MODEL_ID = "eleven_v3";
const TEXT_MAX = 4000; // a single spoken reply should never be near this; defensive cap only

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000; // avoid a call-stack blowup from spreading a huge array into String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const textRaw: unknown = body?.text;
    if (typeof textRaw !== "string" || !textRaw.trim()) {
      return Response.json({ error: "text is required" }, { status: 400 });
    }
    const text = textRaw.trim().slice(0, TEXT_MAX);

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      // Not configured yet — the frontend's priority chain falls back to
      // browser speechSynthesis on this exact shape/status.
      return Response.json({ error: "no_key" }, { status: 503 });
    }

    let res: Response;
    try {
      res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}?output_format=mp3_44100_64`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({ text, model_id: ELEVEN_MODEL_ID }),
        }
      );
    } catch {
      return Response.json({ error: "tts_failed" }, { status: 502 });
    }

    if (!res.ok) {
      return Response.json({ error: "tts_failed" }, { status: 502 });
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    return Response.json({ audio_b64: toBase64(bytes), mime: "audio/mpeg" });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
