// Demo seed script — run with:
//   cat scripts/seed.ts | npx base44 exec
// (Deno + `base44` globals are provided by `base44 exec`; pre-authenticated as
// the CLI user, sagi.arg@gmail.com — the founder's own demo account.)
//
// Seeds the four patients from the design mock (Dror.dc.html lines 565-589):
// איתי (18 sessions), נועה (12), דניאל (7), מיכל (23). "Sessions" = non-draft
// summary Entry count, matching src/api/format.ts `sessionCount()`.
//
// Idempotent + convergent: an existing matching patient is never re-created
// (matched on full name, or on first name alone only when that's unambiguous —
// see findPatientMatch below); entries are topped up to the target count.
// Re-running this script creates 0 new records once targets are met.

interface PatientRow {
  id: string;
  first_name: string;
  last_name?: string;
  context_notes?: string;
}

interface EntryRow {
  id: string;
  patient_id: string;
  type: 'summary' | 'doc' | 'rec';
  title: string;
  entry_date: string;
  body: string;
  is_draft: boolean;
}

// ---------------------------------------------------------------------------
// Date helpers — all UTC to stay independent of the machine's local timezone.
// ANCHOR = the mock's most recent session date for איתי (21.7.2026, mock line 567).
// ---------------------------------------------------------------------------

const ANCHOR = new Date(Date.UTC(2026, 6, 21)); // 2026-07-21

function weeklyDate(i: number): Date {
  const d = new Date(ANCHOR.getTime());
  d.setUTCDate(d.getUTCDate() - 7 * i);
  return d;
}

function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function toILDisplay(d: Date): string {
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}

function fullName(p: { first_name: string; last_name?: string }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Synthetic summary bodies — 2-4 sentence bodies, varied realistic Hebrew
// therapy themes (sleep, work stress, family, exposure practice), in the
// app's three-section summary format (נושאים מרכזיים / התרשמות קלינית / המשך טיפול),
// matching both the real mock entries and the Dror agent's own instructed format.
// ---------------------------------------------------------------------------

const TOPICS: Array<(n: string) => string> = [
  (n) => `המשך עבודה על שיפור הרגלי השינה של ${n}; דיווח על ירידה במספר ההתעוררויות הליליות בשבוע האחרון.`,
  (n) => `${n} העלה/תה את נושא הלחץ מול הממונה בעבודה ותחושת ביקורת מתמדת.`,
  (n) => `שיחה על דינמיקה משפחתית מורכבת שעלתה בסוף השבוע, בעיקר מול בני המשפחה הקרובים.`,
  (n) => `תרגול חשיפה הדרגתית למצב חברתי שהוגדר כמטרה בפגישה הקודמת.`,
  (n) => `${n} דיווח/ה על קושי בריכוז ותחושת עומס משימות בעבודה.`,
  (n) => `עלתה תחושת בדידות מסוימת מול הסביבה החברתית הקרובה.`,
  (n) => `${n} תיאר/ה אירוע מלחיץ במהלך השבוע וכיצד התמודד/ה איתו.`,
];

const CLINICAL: Array<() => string> = [
  () => `ניכרת ירידה הדרגתית ברמת החרדה הכללית.`,
  () => `עדיין קיימת נטייה מסוימת להימנעות, אך בעוצמה נמוכה יותר מבעבר.`,
  () => `שיתוף הפעולה טוב, וניכרת מוטיבציה להמשיך בתרגול העצמאי בין הפגישות.`,
  () => `מורגשת התקדמות בזיהוי מחשבות אוטומטיות שליליות ובניסוח מחדש שלהן.`,
  () => `הביטחון העצמי במצבים חברתיים נראה יציב יותר מהפגישה הקודמת.`,
];

const PLAN: Array<() => string> = [
  () => `נמשיך בתרגול טכניקות נשימה ובמעקב אחר יומן שינה.`,
  () => `ייקבע תרגיל חשיפה נוסף לקראת הפגישה הבאה.`,
  () => `נעבוד על ניסוח גבולות ברורים מול הסביבה התעסוקתית.`,
  () => `פגישה נוספת נקבעה להמשך המעקב בשבוע הבא.`,
  () => `נתמקד בפגישה הבאה בהמשך עיבוד הנושא המשפחתי שעלה.`,
];

function buildBody(name: string, seed: number): string {
  const topic = TOPICS[seed % TOPICS.length](name);
  const clinical = CLINICAL[(seed + 2) % CLINICAL.length]();
  const plan = PLAN[(seed + 4) % PLAN.length]();
  return `נושאים מרכזיים:\n${topic}\n\nהתרשמות קלינית:\n${clinical}\n\nהמשך טיפול:\n${plan}`;
}

// ---------------------------------------------------------------------------
// איתי's three verbatim mock entries — copied exactly from Dror.dc.html
// lines 567-569 (two real summaries + one real doc). Matched by exact title.
// ---------------------------------------------------------------------------

const ITAI_VERBATIM: Array<{ title: string; type: 'summary' | 'doc'; date: string; body: string }> = [
  {
    title: 'סיכום פגישה 18',
    type: 'summary',
    date: '2026-07-21',
    body:
      'סיכום פגישה — איתי, פגישה 18\nתאריך: 21.7.2026\n\nנושאים מרכזיים:\nהפגישה התמקדה בהתמודדות עם לחץ בעבודה ובשיפור שנצפה בדפוסי השינה. איתי דיווח על שלושה לילות רצופים של שינה מלאה — התקדמות משמעותית ביחס לחודש הקודם.\n\nהתרשמות קלינית:\nניכרת ירידה במתח הכללי. איתי עשה שימוש עצמאי בכלי הנשימה שתורגלו בפגישות הקודמות.\n\nהמשך טיפול:\nנמשיך בעבודה על גבולות בסביבת העבודה. נקבעה פגישה נוספת לשבוע הבא.',
  },
  {
    title: 'סיכום פגישה 17',
    type: 'summary',
    date: '2026-07-14',
    body:
      'סיכום פגישה — איתי, פגישה 17\nתאריך: 14.7.2026\n\nנושאים מרכזיים:\nעבודה על זיהוי טריגרים לחרדה במצבים חברתיים. איתי הביא דוגמה מאירוע משפחתי בסוף השבוע.\n\nהמשך טיפול:\nתרגול חשיפה הדרגתית לקראת הפגישה הבאה.',
  },
  {
    title: 'אישור טיפול — קופת חולים',
    type: 'doc',
    date: '2026-07-02',
    body:
      'לכבוד: קופת חולים\nהנדון: אישור טיפול פסיכולוגי\n\nהריני לאשר כי מר איתי נמצא בטיפול פסיכולוגי פרטני במרפאתי החל מחודש ינואר 2025, בתדירות של פגישה שבועית.\n\nהטיפול מתמקד בהתמודדות עם חרדה ושיפור תפקוד יומיומי, וניכרת התקדמות עקבית.\n\nבכבוד רב,\nד"ר [שם המטפל/ת]\nפסיכולוג/ית קליני/ת מומחה/ית',
  },
];

// ---------------------------------------------------------------------------
// Target patients (design mock lines 565-573). Only מיכל gets a context note
// (per controller resolution: "use context_notes sparingly").
// ---------------------------------------------------------------------------

type PatientConfig = {
  firstName: string;
  lastName: string;
  target: number;
  contextNotes?: string;
  isItai?: boolean;
};

const PATIENTS: PatientConfig[] = [
  { firstName: 'איתי', lastName: '', target: 18, isItai: true },
  { firstName: 'נועה', lastName: '', target: 12 },
  { firstName: 'דניאל', lastName: '', target: 7 },
  {
    firstName: 'מיכל',
    lastName: '',
    target: 23,
    contextNotes: 'בת 41, אמא לשניים, מתמודדת עם חרדה חברתית וקושי באיזון בין עבודה למשפחה.',
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Safer-than-first-name-only matching: a full name (first+last) match is exact.
// A first-name-only fallback is used ONLY when the seed target itself defines no
// last name AND exactly one existing patient has that first name (unambiguous).
// Any other case (0 or 2+ same-first-name patients, or a last-name mismatch)
// creates a new patient rather than silently topping up entries onto what might
// be someone else's real record.
async function findPatientMatch(cfg: PatientConfig): Promise<PatientRow | null> {
  const all: PatientRow[] = await base44.entities.Patient.list();
  const wantLast = (cfg.lastName ?? '').trim();

  if (wantLast) {
    return (
      all.find(
        (p) => (p.first_name ?? '').trim() === cfg.firstName && (p.last_name ?? '').trim() === wantLast
      ) ?? null
    );
  }

  const byFirstName = all.filter((p) => (p.first_name ?? '').trim() === cfg.firstName);
  return byFirstName.length === 1 ? byFirstName[0] : null;
}

async function ensurePatient(
  cfg: PatientConfig
): Promise<{ patient: PatientRow; wasCreated: boolean }> {
  const existing = await findPatientMatch(cfg);
  if (existing) return { patient: existing, wasCreated: false };
  const created: PatientRow = await base44.entities.Patient.create({
    first_name: cfg.firstName,
    last_name: cfg.lastName,
    context_notes: cfg.contextNotes ?? '',
  });
  return { patient: created, wasCreated: true };
}

async function main() {
  const me = await base44.auth.me();
  console.log(`Seeding as: ${me?.email ?? '(unknown)'}\n`);

  const report: Array<{ name: string; target: number; existing: number; created: number }> = [];

  for (const cfg of PATIENTS) {
    const { patient, wasCreated } = await ensurePatient(cfg);
    const name = fullName(patient);
    console.log(`=== ${name} ${wasCreated ? '(created new patient)' : `(existing patient, id=${patient.id})`} ===`);

    let entries: EntryRow[] = await base44.entities.Entry.filter({ patient_id: patient.id });
    const baselineNonDraftSummaries = entries.filter((e) => e.type === 'summary' && !e.is_draft).length;

    let createdSummaryCount = 0;

    // Itai only: ensure the 3 verbatim mock entries exist, matched by exact title.
    if (cfg.isItai) {
      for (const v of ITAI_VERBATIM) {
        const exists = entries.some((e) => e.title === v.title);
        if (exists) {
          console.log(`  [skip]   verbatim entry already exists: "${v.title}"`);
          continue;
        }
        const created: EntryRow = await base44.entities.Entry.create({
          patient_id: patient.id,
          type: v.type,
          title: v.title,
          entry_date: v.date,
          body: v.body,
          is_draft: false,
        });
        entries.push(created);
        console.log(`  [create] verbatim entry: "${v.title}" (${v.type}, ${v.date})`);
        if (v.type === 'summary') createdSummaryCount++;
      }
    }

    // Top up synthetic non-draft summaries, weekly backwards from the anchor,
    // skipping any date already occupied by an existing non-draft summary.
    const nonDraftSummaries = entries.filter((e) => e.type === 'summary' && !e.is_draft);
    let currentCount = nonDraftSummaries.length;
    const usedDates = new Set(nonDraftSummaries.map((e) => e.entry_date));

    let i = 0;
    while (currentCount < cfg.target) {
      const d = weeklyDate(i);
      i++;
      const iso = toISO(d);
      if (usedDates.has(iso)) continue;
      usedDates.add(iso);

      const seed = i + cfg.target;
      const body = buildBody(name, seed);
      const title = `סיכום פגישה — ${name}, ${toILDisplay(d)}`;

      await base44.entities.Entry.create({
        patient_id: patient.id,
        type: 'summary',
        title,
        entry_date: iso,
        body,
        is_draft: false,
      });
      currentCount++;
      createdSummaryCount++;
      console.log(`  [create] synthetic summary: "${title}"`);
    }

    console.log(`  -> target=${cfg.target} baseline=${baselineNonDraftSummaries} created=${createdSummaryCount} final=${currentCount}\n`);

    report.push({ name, target: cfg.target, existing: baselineNonDraftSummaries, created: createdSummaryCount });
  }

  console.log('\nFinal seed summary (non-draft summary counts = "sessions"):');
  console.log('Patient'.padEnd(16) + 'Target'.padEnd(8) + 'Existing'.padEnd(10) + 'Created');
  for (const r of report) {
    console.log(r.name.padEnd(16) + String(r.target).padEnd(8) + String(r.existing).padEnd(10) + String(r.created));
  }
}

await main();
