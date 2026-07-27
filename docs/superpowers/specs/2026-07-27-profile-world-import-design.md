# Patient profile + world: design import, and the white-block fix

Date: 2026-07-27
Status: approved by the founder (Sagi), in this session.

## Why

Two things, both founder-reported:

1. The patient profile and the patient's world in the app were ported from an
   earlier revision of the Claude Design mock (`Dror.dc.html`, project
   `652f2491-1541-4f9b-a705-8713125502a8`). The mock has since moved on. The app
   should carry the mock's current aesthetic for those two screens exactly.
2. A white block appears at the bottom of every screen on the founder's
   installed iPhone PWA — over the dark overlays too, where it reads as broken.

The mock is the visual source of truth. Where the mock is a mock (invented data
with no backing in the real app), this spec says what the real source is.

## 1. The white block

**Mechanism.** `body` paints an opaque `--bg-warm` (#faf8fa) across the pinned,
full-screen document (`src/styles/base.css`), and `AppFrame` sits on top of it
sized `min-height: 100dvh`. In the installed PWA the frame's box ends a few
points short of the physical bottom, so the uncovered strip shows body's
near-white — including above an overlay's dark scrim, since the scrim is
`position:absolute; inset:0` *inside* the frame.

**Fix (two independent parts, so a recurrence can't produce a white block):**

- `AppFrame` fills its parent instead of measuring the viewport:
  `height: 100%` (plus `minHeight: 100%`) rather than `min-height: 100dvh`.
  `#root` and `body` are already pinned to the full screen, so this is exact and
  has no viewport-unit behaviour to get wrong.
- `body` stops painting an opaque colour. `html` keeps `background: var(--bg-warm)`
  as the base, and `chromeColor.ts` — which already writes a per-screen colour to
  `document.documentElement` on every screen/overlay change — becomes what shows
  through any residual sliver. A sliver then matches the screen (dark under an
  overlay), instead of flashing white.

## 2. Patient profile (`src/screens/Profile.tsx`)

Replaces the rounded indigo hero and the three white pill buttons.

- **Background**: full-bleed, `position:absolute; inset:0; opacity:0.35`, the same
  `radial-gradient(108% 48% at 50% -4%, …), #faf8fa` the world screen uses. Plus
  the existing 225px bottom glow, `pointer-events:none`.
- **Back chevron**, top-right, 44×44, at `calc(var(--top-inset) + 66px)` — goes home.
  The gear icon is removed.
- **Name**: Frank Ruhl Libre 29px/500 `#17171b`, centred, at
  `calc(var(--top-inset) + 116px)`.
- **Subtitle**: 13px `#8f8b85` — `בטיפול מאז <חודש> <שנה> · N פגישות`, or just
  `N פגישות` when no start month is set.
- **Context chip**: translucent white pill (`rgba(255,255,255,0.72)`, radius 999,
  `box-shadow: 0 0 0 1px rgba(23,23,27,0.05)`, `backdrop-filter: blur(6px)`) with a
  document glyph and 12.5px/600 `#3a3a3f` label. Reads `הוספת הקשר על המטופל`, or
  `הקשר על המטופל · מוגדר` once `context_notes` is non-empty. Opens the patient
  context overlay — this is now the only way in, replacing the gear.
- **Three rows** in a scrollable region (`top: calc(var(--top-inset) + 248px)`,
  `bottom: calc(var(--chatbar-bottom) + 126px)`). Each row: padding
  `15px 22px 17px 10px`, `border-radius: 0 16px 16px 0`, `margin-bottom: 16px`; a
  muted 11.5px `#a9a49d` label over a 15.5px/600 `#2b2b30` title, with a 15px
  `#c3beb7` chevron on the left.
  1. `הקלטה או נקודות מהפגישה` / `יצירת סיכום פגישה`
  2. `אישור, חוות דעת או מכתב` / `יצירת מסמך רשמי`
  3. `N סיכומים · M מסמכים` / `העולם של <שם>`

## 3. Patient's world (`src/screens/World.tsx`)

- Same background gradient; back chevron top-right returns to the profile.
- Name 29px serif + `N פגישות` (13px `#a2a4a9`).
- **Two tabs** at `calc(var(--top-inset) + 188px)`: `פגישות` / `מסמכים`, using the
  existing pill styling. The three old filters are gone.
- **Timeline rows** at `top: calc(var(--top-inset) + 238px)`, same bottom
  clearance as the profile. Each row: `border-right: 1.5px solid #e3ddd6`,
  `border-radius: 0 14px 14px 0`, padding `14px 20px 16px 6px`, and a 7.5px dot
  (`#cdc3b8`) at `top:20px; right:-4.5px`.
  - Sessions: meta `פגישה N · d.m.yyyy` (11.5px `#a9a49d`), then the entry's topic
    tags as plain words, 13.5px/600 `#2b2b30`, wrapped with 6px gaps.
  - Documents: same meta shape (`<סוג> · <תאריך>`), then the title.
- Empty states: `אין עדיין פגישות מסוכמות` / `אין עדיין מסמכים בתיק`.
- Recording entries are not listed under either tab.

## 4. Data

### Entry.tags — real field, with a fallback for existing records

- `base44/entities/entry.jsonc`: add `tags`, array of strings, default `[]`.
- `summarize` returns up to three short Hebrew topic phrases drawn from the
  summary's own `תסמינים ונושאים` section, in a new `tags` array on its JSON
  schema. The draft carries them; saving the draft persists them.
- Display rule (`topicTags`, pure + tested): use `entry.tags` when non-empty;
  otherwise parse the `תסמינים ונושאים:` section out of the body and take up to
  three comma/newline-separated phrases; otherwise fall back to the entry title.
  Records created before this change stay readable.

### Patient.treatment_since — set per patient

- `base44/entities/patient.jsonc`: add `treatment_since`, string, default `""`,
  holding `YYYY-MM`.
- Edited in the patient context overlay (the surface the chip now opens) as a
  month input, labelled `תחילת הטיפול`.
- `formatSince` (pure + tested): `"2026-07"` → `בטיפול מאז יולי 2026`; empty or
  malformed → `''`, and the subtitle then shows only the session count.

### Recordings: saved, hidden, then deleted

- `RecordOverlay` files the recording again when a patient is picked (`rec` entry
  with transcript + duration), so abandoning the summary flow cannot lose it.
- It is never listed in the world screen (see §3).
- **It is deleted once the summary produced from it is saved as an entry** —
  final save or save-as-draft, either one. The draft carries the recording's id
  from the flow; `saveDraft` deletes that entry after the summary write succeeds.
  A failed delete is swallowed: the summary is saved either way, and the leftover
  recording stays invisible.

  Interpretation note: the founder asked for deletion "after the summary is
  generated". Deleting at generation time would destroy the recording before the
  therapist has accepted the draft, so deletion is tied to the save instead —
  the first moment the summary's content exists in the file.

## 5. Consequences accepted

- The gear on the profile disappears; the patient context screen is reached only
  from the chip.
- Recordings are unreachable from the UI for their whole (now short) life.
- `chromeColor`'s `profile` entry must be re-derived: the profile's top-of-viewport
  colour is now the world's gradient at `opacity: 0.35`, not the old hero's 0.96.

## 6. Gates

`npx vitest run`, `npx tsc --noEmit`, `npm run build` all clean. Entities pushed
and the site deployed. New pure logic (`topicTags`, `formatSince`) is TDD'd; the
screens themselves are verified by the founder on his phone, per his standing
low-token rule.
