// Backend function: `document`. Drafts a formal Hebrew clinical letter (title +
// body) grounded in the patient's own record — either the last few entries in
// the file, or a therapist-picked subset of past session summaries. Auth/
// import pattern per docs/context/base44-facts.md §4 (mirrors base44/functions/
// summarize/entry.ts).
import { createClientFromRequest } from "npm:@base44/sdk";

const EXCERPT_MAX = 800;
const RECENT_COUNT = 8; // 'all' meetings mode: last N entries (any type), capped like summarize's history block

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
// same RLS-scoped client so a therapist only ever sees their own. Mirrors
// base44/functions/summarize/entry.ts.
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

// Per-type body structure. The letter chrome (לכבוד / הנדון / תאריך / בכבוד
// רב) is identical for every official document; only the body's sections
// differ by type, so adding a new type is one entry in this table. A type
// with no entry keeps the free-form single-body-paragraph shape.
interface DocSection {
  heading: string;
  hint: string;
}

const DOC_STRUCTURES: { matches: (docType: string) => boolean; sections: DocSection[] }[] = [
  {
    // מכתב קליני לצבא
    matches: (t) => t.includes("צבא") || t.includes('צה"ל') || t.includes("מיטב"),
    sections: [
      {
        heading: "רקע",
        hint: "כמה זמן המטופל/ת נמצא/ת בטיפול, היסטוריה טיפולית רלוונטית, אבחנות קודמות וכדומה",
      },
      {
        heading: "הערכת מצב תפקודי",
        hint: "תיאור אופן התפקוד של המטופל/ת, והאם המצב הנפשי יוצר קושי תפקודי; אם עולה בחומר סוגיית מסוכנות — יש להתייחס אליה כאן",
      },
      { heading: "המלצה", hint: "המלצה מסכמת הנובעת מהרקע ומהערכת המצב שלמעלה" },
    ],
  },
  {
    // מכתב לביטוח לאומי
    matches: (t) => t.includes("ביטוח לאומי") || t.includes("ביטוח־לאומי"),
    sections: [
      {
        heading: "רקע",
        hint: "כמה זמן המטופל/ת נמצא/ת בטיפול, היסטוריה טיפולית רלוונטית, אבחנות קודמות וכדומה",
      },
      {
        heading: "אבחנות קליניות",
        hint: "האבחנות הקליניות העולות מהרשומות, וכן תיאור האופן שבו הן משפיעות על המטופל/ת ופוגעות בתפקודו/ה",
      },
      { heading: "המלצה", hint: "המלצה מסכמת הנובעת מהרקע ומהאבחנות שלמעלה" },
    ],
  },
];

function sectionsFor(docType: string): DocSection[] | null {
  return DOC_STRUCTURES.find((s) => s.matches(docType))?.sections ?? null;
}

const PERSONA =
  "אתה דְּרוֹר, עוזר כתיבה קליני של פסיכולוג/ית פרטי/ת בישראל. תפקידך לנסח מסמך רשמי בעברית " +
  "בשם המטפל/ת (כגון אישור טיפול, מכתב לקופת חולים, מסמך אינטייק או חוות דעת), בטון מקצועי ורשמי, " +
  "ללא אימוג'י, ולעולם ללא המצאת עובדות שאינן מופיעות ברשומות שסופקו לך.";

function excerpt(text: string | undefined | null, max: number): string {
  const t = (text ?? "").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function fullName(p: Patient): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ");
}

function therapistName(user: { email: string; full_name?: string | null }): string {
  const name = user.full_name?.trim();
  return name || user.email.split("@")[0];
}

// d.m.yyyy in Israel local time — mirrors src/api/format.ts's fmtDate.
function todayIL(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const get = (t: string) => {
    const val = parts.find((p) => p.type === t)?.value ?? "";
    return val.replace(/^0+/, "") || "0";
  };
  return `${get("day")}.${get("month")}.${get("year")}`;
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
    const docTypeRaw: unknown = body?.doc_type;
    const purposeRaw: unknown = body?.purpose;
    const meetingsRaw: unknown = body?.meetings;

    if (typeof patientId !== "string" || !patientId) {
      return Response.json({ error: "patient_id is required" }, { status: 400 });
    }
    if (typeof docTypeRaw !== "string" || !docTypeRaw.trim()) {
      return Response.json({ error: "doc_type is required" }, { status: 400 });
    }
    const docType = docTypeRaw.trim();
    const purpose = typeof purposeRaw === "string" ? purposeRaw.trim() : "";

    let meetings: "all" | number[];
    if (meetingsRaw === "all") {
      meetings = "all";
    } else if (
      Array.isArray(meetingsRaw) &&
      meetingsRaw.every((n) => typeof n === "number" && Number.isInteger(n) && n > 0)
    ) {
      meetings = meetingsRaw as number[];
    } else {
      return Response.json(
        { error: "meetings must be 'all' or an array of positive session numbers" },
        { status: 400 }
      );
    }

    // RLS-scoped lookup (createClientFromRequest inherits the caller's auth) —
    // filter() rather than get() so a patient outside this therapist's scope
    // (or a bad id) resolves to an empty list, not a thrown error.
    const patients = (await base44.entities.Patient.filter({ id: patientId })) as Patient[];
    const patient = patients[0];
    if (!patient) {
      return Response.json({ error: "Patient not found" }, { status: 404 });
    }
    const name = fullName(patient);
    const therapist = therapistName(user);

    // The therapist's own standing guidelines outrank the default style
    // below, though never the structural requirements this function mandates
    // (the לכבוד/הנדון/תאריך/בכבוד רב letter structure further down). A
    // missing/unreadable record is "no preferences set", never an error —
    // the draft must proceed either way.
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

    let historyBlock: string;
    if (meetings === "all") {
      const recentEntries = (await base44.entities.Entry.filter(
        { patient_id: patientId },
        "-entry_date",
        RECENT_COUNT
      )) as Entry[];
      historyBlock = recentEntries.length
        ? "\n\nרשומות אחרונות מהתיק (הבסיס היחיד למסמך — אין להסתמך על מידע שאינו מופיע בהן):\n" +
          recentEntries
            .map((e) => `- [${e.entry_date}] ${e.title}: ${excerpt(e.body || e.transcript, EXCERPT_MAX)}`)
            .join("\n")
        : "\n\nאין כרגע רשומות בתיק זה.";
    } else {
      const meetingNumbers = meetings; // number[] — assigned as const so closures below keep the narrowed type
      // Session position = chronological index (oldest=1) among this patient's
      // non-draft summaries — mirrors the frontend's numbering (src/api/format.ts
      // sessionCount, and the design mock's docMeetingChips) so the numbers the
      // therapist picked in the UI line up with the records selected here. Sort
      // and limit are passed explicitly (not left to the SDK's filter()
      // defaults of '-created_date' + limit 50) so a patient with >50 non-draft
      // summaries doesn't get silently truncated+re-numbered here. The local
      // sort below is now a no-op safeguard given the explicit 'entry_date'
      // sort, kept in case the backend's sort guarantee ever changes.
      const priorSummaries = (await base44.entities.Entry.filter(
        { patient_id: patientId, type: "summary", is_draft: false },
        "entry_date",
        5000
      )) as Entry[];
      const chronological = [...priorSummaries].sort(
        (a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime()
      );
      const picked = chronological
        .map((e, idx) => ({ e, pos: idx + 1 }))
        .filter(({ pos }) => meetingNumbers.includes(pos));
      historyBlock = picked.length
        ? "\n\nהמסמך מתבסס אך ורק על סיכומי הפגישות הבאות (הבסיס היחיד למסמך):\n" +
          picked
            .map(({ e, pos }) => `- פגישה ${pos} [${e.entry_date}] ${e.title}: ${excerpt(e.body, EXCERPT_MAX)}`)
            .join("\n")
        : "\n\nלא נמצאו רשומות עבור הפגישות שנבחרו.";
    }

    // Type-specific body (רקע / הערכת מצב תפקודי / המלצה וכו') when this
    // document type has a defined structure; otherwise the free-form body
    // paragraph the generic types have always used.
    const sections = sectionsFor(docType);
    const bodyBlock = sections
      ? sections.map((s) => `${s.heading}\n<${s.hint}>`).join("\n\n")
      : "<כאן, ורק כאן, לכתוב את גוף המסמך עצמו — פסקה אחת או יותר, המבוססת אך ורק על הרשומות שסופקו לעיל ומכוונת למטרה שצוינה. אם אין די רשומות כדי לבסס את המסמך, יש לציין זאת בעדינות בתוך הפסקה במקום להמציא פרטים>";
    const bodyRule = sections
      ? `- גוף המסמך בנוי מהסעיפים הבאים בלבד, לפי הסדר, כל כותרת בשורה נפרדת ואחריה התוכן, ושורה ריקה בין הסעיפים: ${sections
          .map((s) => s.heading)
          .join(" / ")}. אין להוסיף סעיפים ואין להשמיט סעיפים. כל סעיף מבוסס אך ורק על הרשומות שסופקו לעיל; אם אין די מידע לסעיף מסוים, יש לציין זאת בעדינות בתוכו במקום להמציא פרטים.`
      : "";

    const prompt = `${PERSONA}
כתוב ${docType} עבור התיק של ${name}, בשם המטפל/ת ${therapist}.
${patient.context_notes ? "הקשר קבוע מהמטפל/ת: " + patient.context_notes : ""}
${prefGuidelines ? "הנחיות קבועות מהמטפל/ת לגבי אופן הכתיבה (גוברות על סגנון ברירת המחדל שלך, אך לא על מבנה המסמך הנדרש בהמשך): " + prefGuidelines : ""}
${styleLine}${purpose ? "מטרת המסמך והנחיות מהמטפל/ת למסמך הזה: " + purpose : ""}${historyBlock}

שדה body חייב להיות בנוי בדיוק לפי המבנה הבא, שורה אחרי שורה עם ירידת שורה אמיתית בין כל שורה, ושורה ריקה בין הסעיפים (רק להחליף את התוכן שבסוגריים המשולשים בתוכן בפועל, בלי הסוגריים עצמם, ובלי להוסיף כותרות/סעיפים נוספים):

לכבוד: ____

הנדון: ${docType} — ${name}

תאריך: ${todayIL()}

${bodyBlock}

בכבוד רב,
${therapist}
פסיכולוג/ית

חשוב מאוד — אין לסטות מהמבנה הזה:
- השורה "לכבוד: ____" חייבת להישאר מילולית בדיוק כפי שהיא, כולל קו התחתון, ובלי למלא שם נמען כלשהו (גם לא ניחוש של מוסד) — המטפל/ת ימלא זאת ידנית בעצמו/ה.
- השורות "הנדון:", "תאריך:" ו"בכבוד רב," חייבות להישאר מילה במילה כפי שמופיעות למעלה, כל אחת בשורה נפרדת משלה.
- החתימה בסוף המסמך היא אך ורק "בכבוד רב," ואחריה שם המטפל/ת ואז "פסיכולוג/ית", כל אחד בשורה נפרדת — אסור להשתמש ב"בברכה" או בכל נוסח סיום אחר.
- אסור לאחד את לכבוד/הנדון/תאריך/גוף המסמך/בכבוד רב לפסקה אחת רציפה — כל אחד מהם נשאר בשורה/שורות נפרדות שלו, בדיוק כפי שהודגם למעלה.
${bodyRule}

שדה title: שורת כותרת קצרה בלבד (למשל "${docType} — ${patient.first_name}"), בלי שאר הסעיפים.
כתוב בעברית, בטון מקצועי ורשמי, ללא שימוש באימוג'י, וללא הוספת עובדות שאינן מופיעות ברשומות שסופקו כאן.`;

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
