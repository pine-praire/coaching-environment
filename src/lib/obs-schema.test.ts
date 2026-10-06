import { describe, expect, it } from "vitest";
import { newPasswordSchema, payloadSchema, subjectNamesSchema, toStoredAnswer } from "./obs-schema";
import { obsPayload } from "@/test/obs-fixtures";

const parse = (p: unknown) => payloadSchema.safeParse(p);

describe("payloadSchema", () => {
  it("accepts a complete answer with and without the childhood block", () => {
    expect(parse(obsPayload()).success).toBe(true);
    expect(parse(obsPayload({ child: true })).success).toBe(true);
  });

  it("accepts an empty name", () => {
    expect(parse(obsPayload({ name: null })).success).toBe(true);
  });

  it("rejects a missing scale item and unknown keys", () => {
    const p = obsPayload();
    delete (p.scale as Record<string, unknown>).A1;
    expect(parse(p).success).toBe(false);
    expect(parse({ ...obsPayload(), extra: 1 }).success).toBe(false);
    const q = obsPayload();
    (q.scale as Record<string, unknown>).A99 = { v: "never", when: null };
    expect(parse(q).success).toBe(false);
  });

  it("allows «when» only after often or almost always", () => {
    const ok = obsPayload({ v: "often" });
    ok.scale.A1 = { v: "often", when: "recent" } as never;
    expect(parse(ok).success).toBe(true);
    const bad = obsPayload({ v: "rarely" });
    bad.scale.A1 = { v: "rarely", when: "recent" } as never;
    expect(parse(bad).success).toBe(false);
  });

  it("requires the childhood block exactly when knewAsChild is yes", () => {
    expect(parse({ ...obsPayload({ child: true }), child: null }).success).toBe(false);
    const p = obsPayload();
    expect(parse({ ...p, child: obsPayload({ child: true }).child }).success).toBe(false);
  });

  it("requires relationOther for «other» and checks years", () => {
    const p = obsPayload();
    expect(parse({ ...p, about: { ...p.about, relation: "other" } }).success).toBe(false);
    expect(
      parse({ ...p, about: { ...p.about, relation: "other", relationOther: "Соседка" } }).success,
    ).toBe(true);
    expect(parse({ ...p, about: { ...p.about, years: -1 } }).success).toBe(false);
    expect(parse({ ...p, about: { ...p.about, years: 2.5 } }).success).toBe(false);
    expect(parse({ ...p, about: { ...p.about, places: [] } }).success).toBe(false);
  });
});

describe("toStoredAnswer", () => {
  it("trims texts, drops empty ones and stamps the server time", () => {
    const p = obsPayload({ name: "  " });
    p.open.E4 = "  важно  " as never;
    const out = toStoredAnswer(payloadSchema.parse(p), new Date("2026-10-06T08:00:00Z"));
    expect(out.name).toBeNull();
    expect(out.open.E4).toBe("важно");
    expect(out.open.E1).toBeNull();
    expect(out.submittedAt).toBe("2026-10-06T08:00:00.000Z");
  });
});

describe("settings schemas", () => {
  it("validates passwords and name forms", () => {
    expect(newPasswordSchema.safeParse("short").success).toBe(false);
    expect(newPasswordSchema.safeParse("long-enough").success).toBe(true);
    expect(subjectNamesSchema.safeParse({ nom: "Вера", acc: "Веру", dat: "" }).success).toBe(false);
    expect(subjectNamesSchema.safeParse({ nom: "Вера", acc: "Веру", dat: "Вере" }).success).toBe(
      true,
    );
  });
});
