// Score interpretation for the built-in standardised outcome measures seeded
// in supabase/migrations/20260831000005_seed_standard_outcome_measures.sql
// (plus CORE-10). Keyed by questionnaire.title — every admin's copy keeps the
// system-default title, so a title match is enough.
//
// These are raw-sum instruments in this app (no age/gender norming); the bands
// below are the standard published severity cut-offs for the total score.
// RCADS-25 has no raw cut-off (it needs T-scores), so it carries subscale
// definitions only and no band.

export type Severity = "none" | "mild" | "moderate" | "severe";

export type ScoreBand = { label: string; severity: Severity };

type BandSpec = { max: number; label: string; severity: Severity };

type SubscaleSpec = { name: string; orderIndexes: number[] };

type MeasureSpec = {
  /** Highest possible total, for "N / max" display. */
  maxScore: number;
  /** Ascending by `max`; the last entry's `max` is the scale maximum. Empty = no band. */
  bands: BandSpec[];
  /** 1-based question order_index values whose non-zero answer is a safeguarding flag. */
  riskOrderIndexes?: number[];
  /** Named subscales scored by 1-based question order_index. */
  subscales?: SubscaleSpec[];
};

const MEASURES: Record<string, MeasureSpec> = {
  "PHQ-9": {
    maxScore: 27,
    bands: [
      { max: 4, label: "Minimal", severity: "none" },
      { max: 9, label: "Mild", severity: "mild" },
      { max: 14, label: "Moderate", severity: "moderate" },
      { max: 19, label: "Moderately severe", severity: "severe" },
      { max: 27, label: "Severe", severity: "severe" },
    ],
    riskOrderIndexes: [9], // "Thoughts that you would be better off dead …"
  },
  "GAD-7": {
    maxScore: 21,
    bands: [
      { max: 4, label: "Minimal", severity: "none" },
      { max: 9, label: "Mild", severity: "mild" },
      { max: 14, label: "Moderate", severity: "moderate" },
      { max: 21, label: "Severe", severity: "severe" },
    ],
  },
  WSAS: {
    maxScore: 40,
    bands: [
      { max: 9, label: "Subclinical", severity: "none" },
      { max: 20, label: "Significant impairment", severity: "moderate" },
      { max: 40, label: "Severe impairment", severity: "severe" },
    ],
  },
  "PSS-10": {
    maxScore: 40,
    bands: [
      { max: 13, label: "Low stress", severity: "none" },
      { max: 26, label: "Moderate stress", severity: "moderate" },
      { max: 40, label: "High stress", severity: "severe" },
    ],
  },
  "PHQ-15": {
    maxScore: 30,
    bands: [
      { max: 4, label: "Minimal", severity: "none" },
      { max: 9, label: "Low", severity: "mild" },
      { max: 14, label: "Medium", severity: "moderate" },
      { max: 30, label: "High", severity: "severe" },
    ],
  },
  "CORE-10": {
    maxScore: 40,
    bands: [
      { max: 5, label: "Healthy", severity: "none" },
      { max: 10, label: "Low level", severity: "mild" },
      { max: 14, label: "Mild", severity: "mild" },
      { max: 19, label: "Moderate", severity: "moderate" },
      { max: 24, label: "Moderate-to-severe", severity: "severe" },
      { max: 40, label: "Severe", severity: "severe" },
    ],
    riskOrderIndexes: [6], // "I made plans to end my life"
  },
  "RCADS-25": {
    maxScore: 75,
    bands: [],
    subscales: [
      { name: "Depression", orderIndexes: [1, 4, 8, 10, 13, 15, 16, 18, 19, 21] },
      { name: "Anxiety", orderIndexes: [2, 3, 5, 6, 7, 9, 11, 12, 14, 17, 20, 22, 23, 24, 25] },
    ],
  },
};

type QuestionLike = { id: string; order_index: number };
type ResponseLike = { scores: unknown };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** The spec for a questionnaire title, or undefined if it isn't a known built-in measure. */
export const getMeasureSpec = (title: string | null | undefined): MeasureSpec | undefined =>
  title ? MEASURES[title] : undefined;

export const isBuiltInMeasure = (title: string | null | undefined): boolean => !!getMeasureSpec(title);

/** Sum of all numeric answers in a response. */
export const totalScore = (questions: QuestionLike[], response: ResponseLike): number => {
  const scores = (response.scores ?? {}) as Record<string, unknown>;
  return questions.reduce((sum, q) => sum + num(scores[q.id]), 0);
};

/** Severity band for a total score, or null if the title has no defined bands. */
export const interpretScore = (title: string | null | undefined, total: number): ScoreBand | null => {
  const spec = getMeasureSpec(title);
  if (!spec || spec.bands.length === 0) return null;
  const band = spec.bands.find((b) => total <= b.max) ?? spec.bands[spec.bands.length - 1];
  return { label: band.label, severity: band.severity };
};

/** Subscale totals for measures that define them (currently RCADS-25). */
export const scoreSubscales = (
  title: string | null | undefined,
  questions: QuestionLike[],
  response: ResponseLike,
): { name: string; score: number; max: number }[] => {
  const spec = getMeasureSpec(title);
  if (!spec?.subscales) return [];
  const scores = (response.scores ?? {}) as Record<string, unknown>;
  return spec.subscales.map((sub) => {
    const items = questions.filter((q) => sub.orderIndexes.includes(q.order_index));
    return {
      name: sub.name,
      score: items.reduce((sum, q) => sum + num(scores[q.id]), 0),
      max: sub.orderIndexes.length * 3,
    };
  });
};

/** Risk/safeguarding items answered with a non-zero score in this response. */
export const flaggedRiskItems = (
  title: string | null | undefined,
  questions: (QuestionLike & { text?: string })[],
  response: ResponseLike,
): { text?: string; score: number }[] => {
  const spec = getMeasureSpec(title);
  if (!spec?.riskOrderIndexes) return [];
  const scores = (response.scores ?? {}) as Record<string, unknown>;
  return questions
    .filter((q) => spec.riskOrderIndexes?.includes(q.order_index))
    .map((q) => ({ text: q.text, score: num(scores[q.id]) }))
    .filter((r) => r.score > 0);
};

/** Maps a severity to the shared <Badge> component's variant prop. */
export const severityToBadgeVariant = (severity: Severity): "success" | "warning" | "danger" | "neutral" => {
  const map: Record<Severity, "success" | "warning" | "danger" | "neutral"> = {
    none: "success",
    mild: "neutral",
    moderate: "warning",
    severe: "danger",
  };
  return map[severity];
};
