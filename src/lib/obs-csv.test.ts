import { describe, expect, it } from "vitest";
import { buildAllCsv, buildPersonCsv, buildSummaryCsv, toCsv } from "./obs-csv";
import { ADULT_ITEMS, CHILD_ITEMS } from "./obs-survey";
import { obsAnswer } from "@/test/obs-fixtures";

const NAMES = { nom: "Вера", acc: "Веру", dat: "Вере" };

describe("toCsv", () => {
  it("quotes cells and neutralises formulas in text", () => {
    expect(toCsv([['a "b"', 3, null, "=SUM(A1)", "-1"]])).toBe(
      `"a ""b""","3","","'=SUM(A1)","'-1"`,
    );
  });
});

describe("buildAllCsv", () => {
  it("has one row per respondent and fills the name into question texts", () => {
    const a = obsAnswer({ v: "often" });
    a.scale.B2 = { v: "often", when: "recent" };
    const csv = buildAllCsv([a, obsAnswer({ name: null, child: true })], NAMES);
    const lines = csv.split("\n");
    expect(lines[0]).toContain('"А1","А1 с какого времени"');
    expect(lines[1]).toContain('"Мария"');
    expect(lines[1]).toContain('"Появилось в последние годы"');
    expect(lines[2]).toContain('"Без имени №2"');
    expect(csv).toContain("Если сравнить Веру сейчас");
    expect(csv).not.toContain("{A}");
  });
});

describe("buildSummaryCsv", () => {
  it("has one row per scale item", () => {
    const csv = buildSummaryCsv([obsAnswer(), obsAnswer({ v: "never" })]);
    expect(csv.split("\n")).toHaveLength(1 + ADULT_ITEMS.length + CHILD_ITEMS.length);
    expect(csv).toContain('"А1","Легко заводит разговор с незнакомыми людьми.","2","1","0","1"');
  });
});

describe("buildPersonCsv", () => {
  it("lists questions with answers and skips childhood when absent", () => {
    const csv = buildPersonCsv(obsAnswer(), 1, NAMES);
    expect(csv).toContain('"Кем вы приходитесь Вере?","Друг или подруга"');
    expect(csv).toContain('"А1. Легко заводит разговор с незнакомыми людьми.","Иногда",""');
    expect(csv).not.toContain("Блок Ж");
    expect(buildPersonCsv(obsAnswer({ child: true }), 1, NAMES)).toContain("Блок Ж");
  });
});
