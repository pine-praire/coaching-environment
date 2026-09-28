import { describe, expect, it } from "vitest";
import {
  codeInputSchema,
  newCodeSchema,
  normalizeCode,
  payloadSchema,
  serverDate,
  toStoredAnswer,
} from "./comm-schema";

function validPayload() {
  const ratings: Record<string, number> = {};
  for (let n = 1; n <= 34; n++) ratings[String(n)] = ((n - 1) % 5) + 1;
  return {
    version: 1,
    ratings,
    quick: ["unclear_tasks", "other"],
    quickOther: "Weekend messages" as string | null,
    open: {
      ambiguous_phrase: "“ASAP”" as string | null,
      where_it_breaks: null as string | null,
      one_rule: "Dates, not “soon”." as string | null,
    },
  };
}

describe("payloadSchema", () => {
  it("accepts a complete payload", () => {
    expect(payloadSchema.safeParse(validPayload()).success).toBe(true);
  });

  it("rejects when one of the 34 ratings is missing", () => {
    const p = validPayload();
    delete (p.ratings as Record<string, number>)["17"];
    expect(payloadSchema.safeParse(p).success).toBe(false);
  });

  it("rejects null rating", () => {
    const p = validPayload() as { ratings: Record<string, unknown> };
    p.ratings["3"] = null;
    expect(payloadSchema.safeParse(p).success).toBe(false);
  });

  it("rejects rating 6 and rating 0", () => {
    const p6 = validPayload();
    p6.ratings["1"] = 6;
    expect(payloadSchema.safeParse(p6).success).toBe(false);
    const p0 = validPayload();
    p0.ratings["1"] = 0;
    expect(payloadSchema.safeParse(p0).success).toBe(false);
  });

  it("rejects extra rating keys", () => {
    const p = validPayload();
    p.ratings["35"] = 3;
    expect(payloadSchema.safeParse(p).success).toBe(false);
  });

  it("rejects 4 quick picks", () => {
    const p = validPayload();
    p.quick = ["unclear_tasks", "missing_context", "too_many_pings", "incidents"];
    p.quickOther = null;
    expect(payloadSchema.safeParse(p).success).toBe(false);
  });

  it("rejects unknown and duplicate quick picks", () => {
    const unknown = validPayload();
    unknown.quick = ["hacked"];
    unknown.quickOther = null;
    expect(payloadSchema.safeParse(unknown).success).toBe(false);
    const dup = validPayload();
    dup.quick = ["unclear_tasks", "unclear_tasks"];
    dup.quickOther = null;
    expect(payloadSchema.safeParse(dup).success).toBe(false);
  });

  it("rejects too long texts", () => {
    const open = validPayload();
    open.open.one_rule = "x".repeat(2001);
    expect(payloadSchema.safeParse(open).success).toBe(false);
    const other = validPayload();
    other.quickOther = "x".repeat(301);
    expect(payloadSchema.safeParse(other).success).toBe(false);
  });

  it("accepts texts at the limit", () => {
    const p = validPayload();
    p.open.one_rule = "x".repeat(2000);
    p.quickOther = "x".repeat(300);
    expect(payloadSchema.safeParse(p).success).toBe(true);
  });

  it("rejects quickOther without Other selected", () => {
    const p = validPayload();
    p.quick = ["unclear_tasks"];
    expect(payloadSchema.safeParse(p).success).toBe(false);
  });

  it("rejects extra fields (nothing identifying can be smuggled in)", () => {
    expect(payloadSchema.safeParse({ ...validPayload(), email: "a@b.c" }).success).toBe(false);
    const p = validPayload() as { open: Record<string, unknown> };
    p.open.name = "Alex";
    expect(payloadSchema.safeParse(p).success).toBe(false);
  });

  it("rejects wrong version", () => {
    expect(payloadSchema.safeParse({ ...validPayload(), version: 2 }).success).toBe(false);
  });
});

describe("toStoredAnswer", () => {
  it("trims texts and turns empty strings into null", () => {
    const p = payloadSchema.parse({
      ...validPayload(),
      open: { ambiguous_phrase: "  ", where_it_breaks: "  breaks  ", one_rule: null },
    });
    expect(toStoredAnswer(p).open).toEqual({
      ambiguous_phrase: null,
      where_it_breaks: "breaks",
      one_rule: null,
    });
  });

  it("has exactly the allowed fields", () => {
    const stored = toStoredAnswer(payloadSchema.parse(validPayload()));
    expect(Object.keys(stored).sort()).toEqual([
      "open",
      "quick",
      "quickOther",
      "ratings",
      "version",
    ]);
  });
});

describe("codes", () => {
  it("normalizes case and surrounding spaces", () => {
    expect(normalizeCode("  alpha-oct ")).toBe("ALPHA-OCT");
    expect(codeInputSchema.parse(" alpha-oct\n")).toBe("ALPHA-OCT");
  });

  it("rejects an empty code", () => {
    expect(codeInputSchema.safeParse("   ").success).toBe(false);
    expect(codeInputSchema.safeParse(42).success).toBe(false);
  });

  it("new codes: at least 6 chars, letters, digits, hyphens", () => {
    expect(newCodeSchema.parse(" alpha-oct ")).toBe("ALPHA-OCT");
    expect(newCodeSchema.safeParse("ABC").success).toBe(false);
    expect(newCodeSchema.safeParse("ALPHA OCT").success).toBe(false);
  });
});

describe("serverDate", () => {
  it("is YYYY-MM-DD without time", () => {
    expect(serverDate(new Date("2026-10-08T15:42:10Z"))).toBe("2026-10-08");
  });
});
