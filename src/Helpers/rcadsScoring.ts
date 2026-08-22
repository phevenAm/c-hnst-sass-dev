// RCADS (Revised Children's Anxiety and Depression Scale — Child version)
// Chorpita, Yim, Moffitt, Umemoto & Francis (2000), Behaviour Research and
// Therapy, 38, 835-855.
//
// Item→subscale mapping, the T-score formula, missing-item proration rules,
// and the norm table below were extracted directly from the official
// RCADS-C scoring workbook (RCADSC-Scoring-Program-V33-2016_11_20.xlsx) the
// admin supplied — every number here is transcribed from that source, not
// derived. Cross-checked two ways (the workbook's own formulas, and a
// pixel-level read of the official scoring-aid PDF) before use, since a
// wrong subscale assignment here would misrepresent a child's clinical
// scores. See migration 20260821000007_rcads_assessments.sql for the table
// this feeds.
//
// The workbook norms by US school "Grade" (3-12, banded in pairs: 3-4, 5-6,
// 7-8, 9-10, 11-12). Clients here give a date of birth, not a grade, so
// ageToGradeBand below maps age-at-submission onto the nearest band —
// there's no authoritative age→grade table in the source, this is a
// standard US school-age correspondence, clamped at both ends since the
// norms don't extend outside roughly ages 8-18.

export type Gender = "boy" | "girl";

export type SubscaleKey = "separationAnxiety" | "generalizedAnxiety" | "panic" | "socialPhobia" | "ocd" | "depression";

type NormRow = { boy: { mean: number; sd: number }; girl: { mean: number; sd: number } };

// 1-based item numbers (index 0 in the answers array = item 1).
export const RCADS_SUBSCALES: { key: SubscaleKey; label: string; items: number[] }[] = [
  { key: "separationAnxiety", label: "Separation Anxiety", items: [5, 9, 17, 18, 33, 45, 46] },
  { key: "generalizedAnxiety", label: "Generalized Anxiety", items: [1, 13, 22, 27, 35, 37] },
  { key: "panic", label: "Panic Disorder", items: [3, 14, 24, 26, 28, 34, 36, 39, 41] },
  { key: "socialPhobia", label: "Social Phobia", items: [4, 7, 8, 12, 20, 30, 32, 38, 43] },
  { key: "ocd", label: "Obsessions/Compulsions", items: [10, 16, 23, 31, 42, 44] },
  { key: "depression", label: "Depression", items: [2, 6, 11, 15, 19, 21, 25, 29, 40, 47] },
];

const TOTAL_ANXIETY_KEYS: SubscaleKey[] = ["separationAnxiety", "generalizedAnxiety", "panic", "socialPhobia", "ocd"];

// 5 bands, oldest→youngest ordering doesn't matter here — indexed by
// ageToGradeBand(). Values transcribed from the workbook's Norms Tables sheet.
const NORMS: Record<SubscaleKey | "totalAnxiety" | "totalRcads", NormRow[]> = {
  separationAnxiety: [
    { boy: { mean: 4.87, sd: 3.93 }, girl: { mean: 7.05, sd: 4.31 } },
    { boy: { mean: 3.2, sd: 3.05 }, girl: { mean: 4.74, sd: 3.78 } },
    { boy: { mean: 2.26, sd: 2.47 }, girl: { mean: 3, sd: 2.72 } },
    { boy: { mean: 2.5, sd: 2.46 }, girl: { mean: 2.34, sd: 2.23 } },
    { boy: { mean: 1.9, sd: 2.03 }, girl: { mean: 3.05, sd: 2.57 } },
  ],
  generalizedAnxiety: [
    { boy: { mean: 6.98, sd: 3.36 }, girl: { mean: 7.77, sd: 3.77 } },
    { boy: { mean: 6.44, sd: 3.13 }, girl: { mean: 8.01, sd: 3.68 } },
    { boy: { mean: 6.2, sd: 3.14 }, girl: { mean: 7.42, sd: 3.16 } },
    { boy: { mean: 7.07, sd: 2.93 }, girl: { mean: 7.28, sd: 3.44 } },
    { boy: { mean: 6.76, sd: 3.44 }, girl: { mean: 8.49, sd: 3.71 } },
  ],
  panic: [
    { boy: { mean: 5.25, sd: 4.15 }, girl: { mean: 6.51, sd: 4.73 } },
    { boy: { mean: 4.06, sd: 3.6 }, girl: { mean: 5.25, sd: 4.3 } },
    { boy: { mean: 3.62, sd: 3.36 }, girl: { mean: 5.03, sd: 3.92 } },
    { boy: { mean: 3.76, sd: 3.21 }, girl: { mean: 4.18, sd: 3.07 } },
    { boy: { mean: 3.79, sd: 2.71 }, girl: { mean: 5.26, sd: 4.28 } },
  ],
  socialPhobia: [
    { boy: { mean: 9.77, sd: 4.51 }, girl: { mean: 11.61, sd: 4.98 } },
    { boy: { mean: 10.3, sd: 4.75 }, girl: { mean: 12.92, sd: 5.21 } },
    { boy: { mean: 11.05, sd: 4.74 }, girl: { mean: 13.01, sd: 4.94 } },
    { boy: { mean: 11.68, sd: 4.74 }, girl: { mean: 12.27, sd: 5 } },
    { boy: { mean: 10.67, sd: 4.49 }, girl: { mean: 12.85, sd: 4.98 } },
  ],
  ocd: [
    { boy: { mean: 6.15, sd: 3.2 }, girl: { mean: 7.62, sd: 3.68 } },
    { boy: { mean: 6.01, sd: 3.26 }, girl: { mean: 6.39, sd: 3.46 } },
    { boy: { mean: 5.22, sd: 3.4 }, girl: { mean: 5.12, sd: 3.34 } },
    { boy: { mean: 4.65, sd: 2.89 }, girl: { mean: 4.12, sd: 2.79 } },
    { boy: { mean: 5.18, sd: 3.12 }, girl: { mean: 5.48, sd: 3.82 } },
  ],
  depression: [
    { boy: { mean: 8.25, sd: 4.09 }, girl: { mean: 8.74, sd: 4.75 } },
    { boy: { mean: 7.07, sd: 3.64 }, girl: { mean: 7.64, sd: 4.1 } },
    { boy: { mean: 6.71, sd: 3.64 }, girl: { mean: 7.89, sd: 3.91 } },
    { boy: { mean: 7.44, sd: 4.1 }, girl: { mean: 7.65, sd: 3.68 } },
    { boy: { mean: 7.32, sd: 3.81 }, girl: { mean: 9.36, sd: 4.45 } },
  ],
  totalAnxiety: [
    {
      boy: { mean: 32.88396656534953, sd: 14.46466281916047 },
      girl: { mean: 40.43110841423948, sd: 17.32100978046225 },
    },
    {
      boy: { mean: 29.879768555466878, sd: 13.119029451702485 },
      girl: { mean: 37.097730496453885, sd: 16.176589629610323 },
    },
    {
      boy: { mean: 28.602292550683636, sd: 13.099189170448453 },
      girl: { mean: 33.52942612942613, sd: 13.942053371816018 },
    },
    {
      boy: { mean: 29.798927875243663, sd: 12.770126258607647 },
      girl: { mean: 30.029449152542377, sd: 12.751788307365128 },
    },
    {
      boy: { mean: 28.222777777777775, sd: 12.010753292435124 },
      girl: { mean: 34.97924836601307, sd: 14.870710015736268 },
    },
  ],
  totalRcads: [
    {
      boy: { mean: 41.08373015873017, sd: 17.125576194221114 },
      girl: { mean: 49.089145091693624, sd: 21.05498076931135 },
    },
    {
      boy: { mean: 36.942152168129816, sd: 15.31611322229453 },
      girl: { mean: 44.67881796690311, sd: 19.321152412930605 },
    },
    {
      boy: { mean: 35.339916313059845, sd: 15.317603617140383 },
      girl: { mean: 41.43897028897027, sd: 16.63730492859385 },
    },
    {
      boy: { mean: 37.25701754385965, sd: 15.319031202586531 },
      girl: { mean: 37.64526836158193, sd: 14.978443672080077 },
    },
    {
      boy: { mean: 35.50508230452675, sd: 14.532709624829426 },
      girl: { mean: 44.245769789397244, sd: 18.287768054443106 },
    },
  ],
};

/** Maps age-at-submission onto one of the 5 norm bands (grades 3-4 / 5-6 / 7-8 / 9-10 / 11-12), clamped at both ends. */
export function ageToGradeBand(age: number): number {
  if (age <= 9) return 0;
  if (age <= 11) return 1;
  if (age <= 13) return 2;
  if (age <= 15) return 3;
  return 4;
}

export function ageInYears(dateOfBirth: string, atIso = new Date().toISOString()): number {
  const dob = new Date(dateOfBirth);
  const at = new Date(atIso);
  let age = at.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    at.getMonth() > dob.getMonth() || (at.getMonth() === dob.getMonth() && at.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

export type ScaleResult = {
  key: SubscaleKey | "totalAnxiety" | "totalRcads";
  label: string;
  raw: number | null; // null when unscoreable (too many missing items)
  tScore: number | null;
  /** Display string honouring the "> 80" convention from the source workbook. */
  tScoreDisplay: string;
  band: "normal" | "borderline" | "clinical" | null;
};

export type RcadsResult = {
  subscales: ScaleResult[];
  totalAnxiety: ScaleResult;
  totalRcads: ScaleResult;
};

function bandFor(tScore: number | null): ScaleResult["band"] {
  if (tScore === null) return null;
  if (tScore >= 70) return "clinical";
  if (tScore >= 65) return "borderline";
  return "normal";
}

function tScoreDisplayFor(tScore: number | null): string {
  if (tScore === null) return "—";
  if (tScore > 80) return "T > 80";
  return Math.round(tScore).toString();
}

// answers: 47 entries, 0-3, or null for "not answered". A subscale with more
// than 2 missing items is unscoreable — matches the source workbook's rule
// exactly (raw score: prorated average × item count; T-score/total: missing
// if any component is missing).
function scoreItems(items: number[], answers: (number | null)[]): { raw: number | null; missingCount: number } {
  const values = items.map((itemNumber) => answers[itemNumber - 1] ?? null);
  const missingCount = values.filter((v) => v === null).length;
  if (missingCount > 2) return { raw: null, missingCount };
  const completed = values.filter((v): v is number => v !== null);
  const raw = (completed.reduce((sum, v) => sum + v, 0) / completed.length) * items.length;
  return { raw, missingCount };
}

function tScoreFor(raw: number | null, norms: NormRow[], band: number, gender: Gender): number | null {
  if (raw === null) return null;
  const { mean, sd } = norms[band][gender];
  return ((raw - mean) / sd) * 10 + 50;
}

// Prorated average × item count, ignoring nulls — same shape as scoreItems'
// raw-score math, reused here for the two totals (which gate on whether a
// *component subscale* is missing, not on their own missing-item count, so
// they can't just call scoreItems directly).
function prorate(items: number[], answers: (number | null)[]): number {
  const values = items.map((itemNumber) => answers[itemNumber - 1] ?? null).filter((v): v is number => v !== null);
  return (values.reduce((sum, v) => sum + v, 0) / values.length) * items.length;
}

export function computeRcadsResult(
  answers: (number | null)[],
  dateOfBirth: string,
  gender: Gender,
  atIso?: string,
): RcadsResult {
  if (answers.length !== 47) throw new Error("RCADS answers array must have exactly 47 entries");

  const band = ageToGradeBand(ageInYears(dateOfBirth, atIso));

  const subscales: ScaleResult[] = RCADS_SUBSCALES.map(({ key, label, items }) => {
    const { raw } = scoreItems(items, answers);
    const tScore = tScoreFor(raw, NORMS[key], band, gender);
    return { key, label, raw, tScore, tScoreDisplay: tScoreDisplayFor(tScore), band: bandFor(tScore) };
  });

  const subscaleByKey = new Map(subscales.map((s) => [s.key, s]));
  const anyAnxietyMissing = TOTAL_ANXIETY_KEYS.some((k) => subscaleByKey.get(k)?.raw === null);
  const depressionMissing = subscaleByKey.get("depression")?.raw === null;

  const anxietyItems = RCADS_SUBSCALES.filter((s) => TOTAL_ANXIETY_KEYS.includes(s.key)).flatMap((s) => s.items);
  const allItems = RCADS_SUBSCALES.flatMap((s) => s.items);

  const totalAnxietyRaw = anyAnxietyMissing ? null : prorate(anxietyItems, answers);
  const totalAnxietyTScore = tScoreFor(totalAnxietyRaw, NORMS.totalAnxiety, band, gender);
  const totalAnxiety: ScaleResult = {
    key: "totalAnxiety",
    label: "Total Anxiety",
    raw: totalAnxietyRaw,
    tScore: totalAnxietyTScore,
    tScoreDisplay: tScoreDisplayFor(totalAnxietyTScore),
    band: bandFor(totalAnxietyTScore),
  };

  const totalRcadsRaw = anyAnxietyMissing || depressionMissing ? null : prorate(allItems, answers);
  const totalRcadsTScore = tScoreFor(totalRcadsRaw, NORMS.totalRcads, band, gender);
  const totalRcads: ScaleResult = {
    key: "totalRcads",
    label: "Total RCADS",
    raw: totalRcadsRaw,
    tScore: totalRcadsTScore,
    tScoreDisplay: tScoreDisplayFor(totalRcadsTScore),
    band: bandFor(totalRcadsTScore),
  };

  return { subscales, totalAnxiety, totalRcads };
}
