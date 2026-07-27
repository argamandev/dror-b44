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

// Task W6 — "what Dror should know about you": one TherapistPref record per
// therapist (base44/entities/therapist-pref.jsonc), read here through the
// same RLS-scoped client so a therapist only ever sees their own.
interface TherapistPref {
  guidelines?: string;
  summary_style?: string;
}

// summary_style -> a one-line length/detail instruction; unset/unrecognized
// values add nothing (a missing preference must be a no-op, never an error).
function styleInstruction(style: string | undefined): string {
  switch (style) {
    case "תמציתי":
      return "כתוב תמציתי ותכליתי ככל האפשר, במשפטים קצרים בלבד.";
    case "מאוזן":
      return "שמור על אורך מאוזן — לא תמציתי מדי ולא מפורט מדי.";
    case "מפורט":
      return "כתוב בפירוט רחב, כולל ניואנסים ודוגמאות מהחומר שסופק.";
    default:
      return "";
  }
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

    // The therapist's own standing guidelines outrank the default style
    // below, though never the structural requirements this function mandates
    // (the section headings further down). A missing/unreadable record is
    // "no preferences set", never an error — the draft must proceed either way.
    let prefGuidelines = "";
    let styleLine = "";
    try {
      const prefs = (await base44.entities.TherapistPref.list()) as TherapistPref[];
      const pref = prefs[0];
      prefGuidelines = pref?.guidelines?.trim() || "";
      styleLine = styleInstruction(pref?.summary_style);
    } catch {
      // no-op: draft proceeds without therapist preferences
    }

    const recentEntries = (await base44.entities.Entry.filter(
      { patient_id: patientId },
      "-entry_date",
      HISTORY_COUNT
    )) as Entry[];

    // Session number = count of this patient's non-draft session summaries + 1
    // (mirrors src/api/format.ts's sessionCount on the frontend). Separate from
    // the capped recentEntries context block above — this one must see the
    // FULL history, so sort/limit are passed explicitly rather than relying on
    // the SDK's filter() defaults ('-created_date', limit 50), which would
    // silently truncate (and thus miscount) any patient past 50 summaries.
    const priorSummaries = (await base44.entities.Entry.filter(
      { patient_id: patientId, type: "summary", is_draft: false },
      "entry_date",
      5000
    )) as Entry[];
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
${prefGuidelines ? "הנחיות קבועות מהמטפל/ת לגבי אופן הכתיבה (גוברות על סגנון ברירת המחדל שלך, אך לא על מבנה הסעיפים הנדרש בהמשך): " + prefGuidelines : ""}
${styleLine}${guide ? "דגשים מהמטפל/ת לסיכום הזה: " + guide : ""}${historyBlock}
חומר הגלם מהפגישה הנוכחית (תמלול או נקודות שנרשמו): """${excerpt(source, SOURCE_MAX)}"""

מבנה הסיכום (שדה body): שני חלקים ברורים — "רשומה רפואית" ו"רשומה אישית". כל כותרת בשורה נפרדת ואחריה התוכן, עם שורה ריקה בין הסעיפים — בדיוק במבנה הבא (רק להחליף את התוכן שבסוגריים המשולשים, בלי הסוגריים עצמם, ובלי להוסיף או להשמיט סעיפים):
רשומה רפואית
<משפט אחד קצר בלבד שמתאר את הפגישה בתמצית>

רשומה אישית
תוכן הפגישה:
<תיאור קצר של מה שעלה בפגישה>

התרשמות קלינית:
<התרשמות המבוססת על תוכן הפגישה, בניסוח קצר>

תסמינים ונושאים:
<הנושאים המרכזיים שעלו>

המשך טיפול:
<המלצה קצרה להמשך הטיפול>

שמור על ההפרדה בין שני החלקים: "רשומה רפואית" היא משפט תמציתי אחד בלבד, וכל שאר הפירוט שייך ל"רשומה אישית".

שדה title: שורת כותרת קצרה בלבד (למשל "סיכום פגישה ${nextSession} — ${name}"), בלי שאר הסעיפים.
שדה tags: מערך של עד שלושה נושאים קצרים בעברית (מילה או שתיים כל אחד) — בדיוק אותם נושאים שכתבת בסעיף "תסמינים ונושאים", בלי מילות קישור ובלי משפטים שלמים.
כתוב בגוף שלישי, בטון מקצועי וחם, ללא שימוש באימוג'י, וללא הוספת עובדות שאינן מופיעות בחומר הגלם או ברשומות הקודמות שסופקו כאן.`;

    // NOTE: no `model` param — InvokeLLM does not accept one (base44-facts.md §5).
    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["title", "body", "tags"],
      },
    });

    const {
      title,
      body: resultBody,
      tags,
    } = (result ?? {}) as { title?: string; body?: string; tags?: unknown };
    if (!title || !resultBody) {
      return Response.json({ error: "Empty response from the model" }, { status: 502 });
    }

    // Tags are the world screen's row headline, not the draft itself — a model
    // that omits them (or returns something odd) must not fail the summary; the
    // frontend falls back to parsing the body's own topics section.
    const cleanTags = Array.isArray(tags)
      ? tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
          .map((t) => t.trim())
          .slice(0, 3)
      : [];

    return Response.json({ title, body: resultBody, tags: cleanTags });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
