import { describe, expect, it } from "vitest";
import type { CommAnswer } from "./comm-analysis";
import { buildCsv } from "./comm-csv";

const a = (key: string, fill: number, text: string | null): CommAnswer => {
  const ratings: Record<string, number> = {};
  for (let n = 1; n <= 34; n++) ratings[String(n)] = fill;
  return {
    key,
    ratings,
    quick: ["everything_urgent", "other"],
    quickOther: 'say "hi"',
    open: { ambiguous_phrase: text, where_it_breaks: null, one_rule: null },
  };
};

describe("buildCsv", () => {
  it("has the prototype header and no ids or dates", () => {
    const csv = buildCsv([a("aaaa", 3, "x")]);
    const [head, row] = csv.split("\n");
    expect(head).toBe(
      [
        '"response"',
        ...Array.from({ length: 34 }, (_, i) => `"q${i + 1}"`),
        '"quick_pick"',
        '"quick_other"',
        '"q35_ambiguous_phrase"',
        '"q36_where_it_breaks"',
        '"q37_one_rule"',
      ].join(","),
    );
    expect(row).not.toContain("aaaa");
    expect(row.startsWith('"1",')).toBe(true);
  });

  it("uses labels for quick picks and escapes quotes", () => {
    const csv = buildCsv([a("k", 2, null)]);
    expect(csv).toContain('"Everything is “urgent”; Other"');
    expect(csv).toContain('"say ""hi"""');
  });

  it("shuffles rows with the given random source", () => {
    const rows = [a("k1", 1, "one"), a("k2", 2, "two"), a("k3", 3, "three")];
    const csv = buildCsv(rows, () => 0);
    const firstCol = csv
      .split("\n")
      .slice(1)
      .map((r) => r.split(",")[1]);
    expect(firstCol).toEqual(['"2"', '"3"', '"1"']);
  });
});
