// Backend function: `summarize`. Drafts a Hebrew session-summary (title + body)
// from a raw transcript/notes source, grounded in the patient's own record.
// Auth/import pattern per docs/context/base44-facts.md §4.
import { createClientFromRequest } from "npm:@base44/sdk";

const EXCERPT_MAX = 800;
const SOURCE_MAX = 6000; // raw transcript/notes can be long; cap what we send to the model
const HISTORY_COUNT = 5;

interface Patient {
  id: string;
  first_name: string;
  last_name?: string;
  context_notes?: string;
}

interface Entry {
  id: string;
  type: "summary" | "doc" | "rec";
  title: string;
  entry_date: string;
  body?: string;
  transcript?: string;
  is_draft?: boolean;
}

const PERSONA =
  "אתה דְּרוֹר, עוזר כתיבה קליני של פסיכולוג/ית פרטי/ת בישראל. תפקידך לנסח סיכום פגישה " +
  "טיפולית בעברית, בגוף שלישי, בטון מקצועי וחם, ללא אימוג'י, ולעולם ללא המצאת עובדות שאינן " +
  "מופיעות בחומר הגלם או ברשומות הקודמות שסופקו לך.";

function excerpt(text: string | undefined | null, max: number): string {
  const t = (text ?? "").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function fullName(p: Patient): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ");
}

Deno.serve(async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const patientId: unknown = body?.patient_id;
    const source: unknown = body?.source;
    const guideRaw: unknown = body?.guide;

    if (typeof patientId !== "string" || !patientId) {
      return Response.json({ error: "patient_id is required" }, { status: 400 });
    }
    if (typeof source !== "string" || !source.trim()) {
      return Response.json({ error: "source is required" }, { status: 400 });
    }
    const guide = typeof guideRaw === "string" ? guideRaw.trim() : "";

    // RLS-scoped lookup (createClientFromRequest inherits the caller's auth) —
    // filter() rather than get() so a patient outside this therapist's scope
    // (or a bad id) resolves to an empty list, not a thrown error.
    const patients = (await base44.entities.Patient.filter({ id: patientId })) as Patient[];
    const patient = patients[0];
    if (!patient) {
      return Response.json({ error: "Patient not found" }, { status: 404 });
    }
    const name = fullName(patient);

    const recentEntries = (await base44.entities.Entry.filter(
      { patient_id: patientId },
      "-entry_date",
      HISTORY_COUNT
    )) as Entry[];

    // Session number = count of this patient's non-draft session summaries + 1
    // (mirrors src/api/format.ts's sessionCount on the frontend). Unbounded —
    // separate from the capped recentEntries context block above.
    const priorSummaries = (await base44.entities.Entry.filter({
      patient_id: patientId,
      type: "summary",
      is_draft: false,
    })) as Entry[];
    const nextSession = priorSummaries.length + 1;

    const historyBlock = recentEntries.length
      ? "\n\nרשומות קודמות מהתיק (לצורך רצף והקשר בלבד — אין להמציא מעבר להן):\n" +
        recentEntries
          .map((e) => `- [${e.entry_date}] ${e.title}: ${excerpt(e.body || e.transcript, EXCERPT_MAX)}`)
          .join("\n")
      : "";

    const prompt = `${PERSONA}
כתוב סיכום פגישה טיפולית בעברית עבור התיק של ${name}. מספר הפגישה: ${nextSession}.
${patient.context_notes ? "הקשר קבוע מהמטפל/ת: " + patient.context_notes : ""}
${guide ? "דגשים מהמטפל/ת לסיכום הזה: " + guide : ""}${historyBlock}
חומר הגלם מהפגישה הנוכחית (תמלול או נקודות שנרשמו): """${excerpt(source, SOURCE_MAX)}"""

מבנה הסיכום (שדה body): כל סעיף בשורת כותרת נפרדת ואחריו תוכן, עם שורה ריקה בין הסעיפים — בדיוק במבנה הבא (רק להחליף את התוכן שבסוגריים המשולשים, בלי הסוגריים עצמם):
נושאים מרכזיים:
<תוכן הסעיף>

התרשמות קלינית:
<תוכן הסעיף>

המשך טיפול:
<תוכן הסעיף>

שדה title: שורת כותרת קצרה בלבד (למשל "סיכום פגישה ${nextSession} — ${name}"), בלי שאר הסעיפים.
כתוב בגוף שלישי, בטון מקצועי וחם, ללא שימוש באימוג'י, וללא הוספת עובדות שאינן מופיעות בחומר הגלם או ברשומות הקודמות שסופקו כאן.`;

    // NOTE: no `model` param — InvokeLLM does not accept one (base44-facts.md §5).
    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
        },
        required: ["title", "body"],
      },
    });

    const { title, body: resultBody } = (result ?? {}) as { title?: string; body?: string };
    if (!title || !resultBody) {
      return Response.json({ error: "Empty response from the model" }, { status: 502 });
    }

    return Response.json({ title, body: resultBody });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
