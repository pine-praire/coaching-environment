import { describe, expect, it } from "vitest";
import {
  analyse,
  band,
  dist,
  isSplit,
  mean,
  questionStat,
  sd,
  splitQuestions,
  type CommAnswer,
} from "./comm-analysis";
import { SPLIT_SHARE, ZONES } from "./comm-survey";

function answer(
  fill: number,
  overrides: Record<number, number> = {},
  quick: string[] = [],
): CommAnswer {
  const ratings: Record<string, number> = {};
  for (let n = 1; n <= 34; n++) ratings[String(n)] = overrides[n] ?? fill;
  return {
    key: Math.random().toString(16).slice(2),
    ratings,
    quick,
    quickOther: null,
    open: { ambiguous_phrase: null, where_it_breaks: null, one_rule: null },
  };
}

describe("mean / sd", () => {
  it("mean", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([4])).toBe(4);
  });

  it("sd is population standard deviation", () => {
    expect(sd([3, 3, 3])).toBe(0);
    expect(sd([1, 5])).toBe(2);
    expect(sd([1, 2, 3, 4, 5])).toBeCloseTo(Math.SQRT2, 10);
  });
});

describe("band", () => {
  it("thresholds 2.5 and 3.5", () => {
    expect(band(3.5)).toBe("hot");
    expect(band(3.49)).toBe("mid");
    expect(band(2.5)).toBe("mid");
    expect(band(2.49)).toBe("low");
  });
});

describe("dist", () => {
  it("counts answers 1..5", () => {
    expect(dist([1, 1, 3, 5, 5, 5])).toEqual([2, 0, 1, 0, 3]);
  });
});

describe("split", () => {
  it("uses SPLIT_SHARE = 0.25", () => {
    expect(SPLIT_SHARE).toBe(0.25);
  });

  it("needs at least a quarter low AND a quarter high", () => {
    expect(isSplit(0.25, 0.25)).toBe(true);
    expect(isSplit(0.24, 0.5)).toBe(false);
    expect(isSplit(0.5, 0.24)).toBe(false);
  });

  it("questionStat: 2 of 8 said 1–2 and 2 of 8 said 4–5 → split", () => {
    const q = questionStat(1, [1, 2, 3, 3, 3, 3, 4, 5]);
    expect(q.low).toBe(0.25);
    expect(q.high).toBe(0.25);
    expect(q.split).toBe(true);
  });

  it("questionStat: consensus is not a split", () => {
    expect(questionStat(1, [4, 4, 5, 5, 4]).split).toBe(false);
  });
});

describe("analyse", () => {
  it("zone mean is the mean of per-person zone means", () => {
    const clarity = ZONES[0].questions.map((q) => q.n); // 1..5
    // человек A: 1,1,1,1,1 → 1; человек B: 5,5,5,5,5 → 5
    const a = answer(1);
    const b = answer(5);
    const res = analyse([a, b]);
    const z = res.zones.find((x) => x.id === "clarity")!;
    expect(z.nums).toEqual(clarity);
    expect(z.mean).toBe(3);
    expect(z.sd).toBe(2);
  });

  it("counts quick picks and collects Other texts", () => {
    const a = answer(3, {}, ["unclear_tasks", "other"]);
    a.quickOther = "Weekend messages";
    const b = answer(3, {}, ["unclear_tasks"]);
    const res = analyse([a, b]);
    expect(res.quick.unclear_tasks).toBe(2);
    expect(res.quick.other).toBe(1);
    expect(res.quick.too_many_meetings).toBe(0);
    expect(res.others).toEqual(["Weekend messages"]);
  });

  it("splitQuestions returns only split questions, sharpest first", () => {
    const resp = [
      answer(3, { 6: 1, 18: 1 }),
      answer(3, { 6: 1, 18: 5 }),
      answer(3, { 6: 5, 18: 5 }),
      answer(3, { 6: 5, 18: 5 }),
    ];
    const res = analyse(resp);
    const splits = splitQuestions(res.qs);
    expect(splits.map((q) => q.n)).toEqual([6, 18]); // 6: 50/50, 18: 25/75
  });
});
