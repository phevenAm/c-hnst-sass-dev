import { describe, expect, it } from "vitest";

import {
  flaggedRiskItems,
  getMeasureSpec,
  interpretScore,
  isBuiltInMeasure,
  scoreSubscales,
  severityToBadgeVariant,
  totalScore,
} from "./outcomeMeasureScoring";

// Minimal question shape: id + 1-based order_index, mirroring the rows the
// admin form-details modal passes in.
const makeQuestions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}`, order_index: i + 1, text: `Item ${i + 1}` }));

const responseWith = (values: Record<number, number>, questions: { id: string; order_index: number }[]) => ({
  scores: Object.fromEntries(questions.map((q) => [q.id, values[q.order_index] ?? 0])) as Record<string, number>,
});

describe("getMeasureSpec / isBuiltInMeasure", () => {
  it("recognises the seeded built-ins and CORE-10", () => {
    for (const t of ["PHQ-9", "GAD-7", "WSAS", "PSS-10", "PHQ-15", "CORE-10", "RCADS-25"]) {
      expect(isBuiltInMeasure(t)).toBe(true);
      expect(getMeasureSpec(t)).toBeDefined();
    }
  });

  it("returns undefined for custom / unknown forms", () => {
    expect(isBuiltInMeasure("My custom check-in")).toBe(false);
    expect(getMeasureSpec(null)).toBeUndefined();
  });
});

describe("interpretScore — PHQ-9 bands", () => {
  it.each([
    [0, "Minimal"],
    [4, "Minimal"],
    [5, "Mild"],
    [9, "Mild"],
    [10, "Moderate"],
    [14, "Moderate"],
    [15, "Moderately severe"],
    [19, "Moderately severe"],
    [20, "Severe"],
    [27, "Severe"],
  ])("%i → %s", (total, label) => {
    expect(interpretScore("PHQ-9", total)?.label).toBe(label);
  });
});

describe("interpretScore — other measures", () => {
  it("GAD-7 10 is Moderate, 15 is Severe", () => {
    expect(interpretScore("GAD-7", 10)?.label).toBe("Moderate");
    expect(interpretScore("GAD-7", 15)?.label).toBe("Severe");
  });

  it("WSAS 9 subclinical, 10 significant, 21 severe", () => {
    expect(interpretScore("WSAS", 9)?.severity).toBe("none");
    expect(interpretScore("WSAS", 10)?.label).toBe("Significant impairment");
    expect(interpretScore("WSAS", 21)?.label).toBe("Severe impairment");
  });

  it("CORE-10 clinical cut-off: 10 is sub-clinical, 11 is Mild", () => {
    expect(interpretScore("CORE-10", 10)?.severity).toBe("mild");
    expect(interpretScore("CORE-10", 10)?.label).toBe("Low level");
    expect(interpretScore("CORE-10", 11)?.label).toBe("Mild");
  });

  it("RCADS-25 has no raw band", () => {
    expect(interpretScore("RCADS-25", 40)).toBeNull();
  });
});

describe("totalScore", () => {
  it("sums numeric answers and ignores missing / non-numeric", () => {
    const qs = makeQuestions(7);
    const r = { scores: { q1: 3, q2: 3, q3: 2, q4: 1, q5: "x", q7: 2 } };
    expect(totalScore(qs, r)).toBe(11);
  });
});

describe("scoreSubscales — RCADS-25", () => {
  it("splits into Depression (10 items) and Anxiety (15 items)", () => {
    const qs = makeQuestions(25);
    // every item answered "2"
    const r = responseWith(Object.fromEntries(qs.map((q) => [q.order_index, 2])), qs);
    const subs = scoreSubscales("RCADS-25", qs, r);
    const dep = subs.find((s) => s.name === "Depression");
    const anx = subs.find((s) => s.name === "Anxiety");
    expect(dep).toEqual({ name: "Depression", score: 20, max: 30 });
    expect(anx).toEqual({ name: "Anxiety", score: 30, max: 45 });
  });

  it("returns nothing for measures without subscales", () => {
    expect(scoreSubscales("PHQ-9", makeQuestions(9), { scores: {} })).toEqual([]);
  });
});

describe("flaggedRiskItems", () => {
  it("flags PHQ-9 item 9 when non-zero", () => {
    const qs = makeQuestions(9);
    expect(flaggedRiskItems("PHQ-9", qs, responseWith({ 9: 1 }, qs))).toHaveLength(1);
    expect(flaggedRiskItems("PHQ-9", qs, responseWith({ 9: 0 }, qs))).toHaveLength(0);
  });

  it("flags CORE-10 item 6 when non-zero", () => {
    const qs = makeQuestions(10);
    expect(flaggedRiskItems("CORE-10", qs, responseWith({ 6: 3 }, qs))).toHaveLength(1);
  });

  it("never flags a measure with no risk item", () => {
    const qs = makeQuestions(7);
    expect(flaggedRiskItems("GAD-7", qs, responseWith({ 1: 3, 7: 3 }, qs))).toHaveLength(0);
  });
});

describe("severityToBadgeVariant", () => {
  it("maps severities to Badge variants", () => {
    expect(severityToBadgeVariant("none")).toBe("success");
    expect(severityToBadgeVariant("mild")).toBe("neutral");
    expect(severityToBadgeVariant("moderate")).toBe("warning");
    expect(severityToBadgeVariant("severe")).toBe("danger");
  });
});
