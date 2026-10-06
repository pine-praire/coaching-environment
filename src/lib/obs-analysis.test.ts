import { describe, expect, it } from "vitest";
import {
  indexAverage,
  indexValue,
  itemScore,
  itemSummary,
  numbered,
  respondentLabel,
} from "./obs-analysis";
import { INDICES, REVERSED } from "./obs-survey";
import { obsAnswer } from "@/test/obs-fixtures";

const byId = (id: string) => INDICES.find((d) => d.id === id)!;

describe("itemScore", () => {
  it("maps the scale to 0–4 and flips reversed items", () => {
    const a = obsAnswer({ v: "often" });
    expect(itemScore(a, "A3")).toBe(3);
    expect(REVERSED.has("A1")).toBe(true);
    expect(itemScore(a, "A1")).toBe(1);
  });

  it("ignores «unknown»", () => {
    expect(itemScore(obsAnswer({ v: "unknown" }), "A3")).toBeNull();
  });
});

describe("indexValue", () => {
  it("averages answered items only", () => {
    const a = obsAnswer({ v: "almost_always" });
    a.scale.A3 = { v: "unknown", when: null };
    // impulsivity: A3 (не знаю), B7 = 4, B10 = 4
    expect(indexValue(a, byId("impulsivity"))).toEqual({
      id: "impulsivity",
      mean: 4,
      answered: 2,
      total: 3,
    });
  });

  it("mixes straight and reversed items", () => {
    const a = obsAnswer({ v: "almost_always" });
    // mood_high: V4, V5 — прямые
    expect(indexValue(a, byId("mood_high")).mean).toBe(4);
    // mood_low: A8 V2 V3 V6 V7 V8 = 4, V1 V9 перевёрнуты = 0 → 24 / 8
    expect(indexValue(a, byId("mood_low")).mean).toBe(3);
  });

  it("leaves childhood indices empty without the childhood block", () => {
    expect(indexValue(obsAnswer(), byId("child_mood")).mean).toBeNull();
    expect(indexValue(obsAnswer({ child: true, v: "never" }), byId("child_mood")).mean).toBeCloseTo(
      4 / 3,
    );
  });

  it("averages across respondents who have a value", () => {
    const avg = indexAverage(
      [obsAnswer({ v: "never" }), obsAnswer({ v: "unknown" }), obsAnswer({ v: "almost_always" })],
      byId("mood_high"),
    );
    expect(avg).toEqual({ mean: 2, n: 2 });
  });
});

describe("itemSummary", () => {
  it("counts options, «when» and the raw mean", () => {
    const a = obsAnswer({ v: "often" });
    a.scale.A1 = { v: "often", when: "recent" };
    const b = obsAnswer({ v: "never" });
    const c = obsAnswer({ v: "unknown" });
    const s = itemSummary([a, b, c], "A1");
    expect(s.counts).toMatchObject({ often: 1, never: 1, unknown: 1 });
    expect(s.when.recent).toBe(1);
    expect(s.answered).toBe(3);
    expect(s.mean).toBe(1.5);
  });

  it("reads childhood items only from people who answered them", () => {
    const s = itemSummary([obsAnswer(), obsAnswer({ child: true, v: "rarely" })], "Z1");
    expect(s.answered).toBe(1);
    expect(s.counts.rarely).toBe(1);
  });
});

describe("labels", () => {
  it("numbers respondents by submission time and labels the unnamed", () => {
    const later = obsAnswer({ name: null }, "2026-10-03T00:00:00Z");
    const earlier = obsAnswer({ name: "Ольга" }, "2026-10-01T00:00:00Z");
    const list = numbered([later, earlier]);
    expect(list.map(({ a, n }) => respondentLabel(a, n))).toEqual(["Ольга", "Без имени №2"]);
  });
});
