import { beforeEach, describe, expect, it } from "vitest";
import * as svc from "./comm-service";
import { MemoryCommRepo } from "./comm-repo.memory";

function payload(fill = 3) {
  const ratings: Record<string, number> = {};
  for (let n = 1; n <= 34; n++) ratings[String(n)] = fill;
  return {
    version: 1,
    ratings,
    quick: ["unclear_tasks"],
    quickOther: null,
    open: { ambiguous_phrase: "“ASAP”", where_it_breaks: null, one_rule: null },
  };
}

let repo: MemoryCommRepo;
let waveId: string;

beforeEach(async () => {
  repo = new MemoryCommRepo();
  const res = await svc.createWave(repo, "Team Alpha · before training", "alpha-oct");
  if (!res.ok) throw new Error("setup");
  waveId = res.waveId;
});

describe("checkCode", () => {
  it("accepts any case and surrounding spaces", async () => {
    expect(await svc.checkCode(repo, "ALPHA-OCT")).toEqual({ ok: true, waveId });
    expect(await svc.checkCode(repo, "  alpha-oct  ")).toEqual({ ok: true, waveId });
    expect(await svc.checkCode(repo, "Alpha-Oct")).toEqual({ ok: true, waveId });
  });

  it("rejects wrong, empty and non-string codes with a bare { ok: false }", async () => {
    expect(await svc.checkCode(repo, "ALPHA-NOV")).toEqual({ ok: false });
    expect(await svc.checkCode(repo, "")).toEqual({ ok: false });
    expect(await svc.checkCode(repo, { code: "ALPHA-OCT" })).toEqual({ ok: false });
  });

  it("rejects the code of a closed run", async () => {
    await svc.updateWave(repo, waveId, { open: false });
    expect(await svc.checkCode(repo, "ALPHA-OCT")).toEqual({ ok: false });
  });

  it("old code stops working right after the code is changed", async () => {
    await svc.updateWave(repo, waveId, { code: "alpha-oct-2" });
    expect(await svc.checkCode(repo, "ALPHA-OCT")).toEqual({ ok: false });
    expect(await svc.checkCode(repo, "ALPHA-OCT-2")).toEqual({ ok: true, waveId });
  });
});

describe("submitResponse", () => {
  const now = new Date("2026-10-08T15:42:10Z");

  it("stores exactly the allowed fields, date set by the server", async () => {
    expect(await svc.submitResponse(repo, " alpha-oct ", payload(), now)).toEqual({ ok: true });
    const [doc] = repo.responses.values();
    expect(Object.keys(doc).sort()).toEqual([
      "date",
      "open",
      "quick",
      "quickOther",
      "ratings",
      "version",
      "waveId",
    ]);
    expect(doc.date).toBe("2026-10-08");
    expect(doc.waveId).toBe(waveId);
    expect(Object.keys(doc.ratings)).toHaveLength(34);
  });

  it("re-checks the code: closed run rejects the answers", async () => {
    await svc.updateWave(repo, waveId, { open: false });
    expect(await svc.submitResponse(repo, "ALPHA-OCT", payload(), now)).toEqual({ ok: false });
    expect(repo.responses.size).toBe(0);
  });

  it("rejects an invalid payload without writing anything", async () => {
    const bad = payload();
    bad.ratings["1"] = 6;
    expect(await svc.submitResponse(repo, "ALPHA-OCT", bad, now)).toEqual({ ok: false });
    expect(repo.responses.size).toBe(0);
  });
});

describe("waves", () => {
  it("createWave: code is unique across all runs, regardless of case", async () => {
    expect(await svc.createWave(repo, "Other", "Alpha-Oct")).toEqual({
      ok: false,
      error: "code_taken",
    });
    const closed = await svc.createWave(repo, "Closed one", "BETA-OCT");
    if (!closed.ok) throw new Error();
    await svc.updateWave(repo, closed.waveId, { open: false });
    expect(await svc.createWave(repo, "Other", "beta-oct")).toEqual({
      ok: false,
      error: "code_taken",
    });
  });

  it("createWave: validates name and code", async () => {
    expect(await svc.createWave(repo, "  ", "GAMMA-OCT")).toEqual({
      ok: false,
      error: "invalid_name",
    });
    expect(await svc.createWave(repo, "Gamma", "abc")).toEqual({
      ok: false,
      error: "invalid_code",
    });
  });

  it("updateWave: cannot take another run's code; own code is fine", async () => {
    const other = await svc.createWave(repo, "Beta", "BETA-OCT");
    if (!other.ok) throw new Error();
    expect(await svc.updateWave(repo, other.waveId, { code: "alpha-oct" })).toEqual({
      ok: false,
      error: "code_taken",
    });
    expect(await svc.updateWave(repo, waveId, { code: "ALPHA-OCT" })).toEqual({ ok: true });
  });

  it("listWaves returns counts", async () => {
    await svc.submitResponse(repo, "ALPHA-OCT", payload(), new Date());
    await svc.submitResponse(repo, "ALPHA-OCT", payload(), new Date());
    const [w] = await svc.listWaves(repo);
    expect(w).toMatchObject({ id: waveId, code: "ALPHA-OCT", open: true, count: 2 });
  });
});

describe("getWaveResults", () => {
  it("with no responses returns only the count", async () => {
    expect(await svc.getWaveResults(repo, waveId)).toEqual({ locked: true, count: 0 });
  });

  it("from the first response returns answers without ids, dates or waveId", async () => {
    for (let i = 0; i < 5; i++)
      await svc.submitResponse(repo, "ALPHA-OCT", payload(i + 1), new Date());
    const res = await svc.getWaveResults(repo, waveId);
    if (!res || res.locked) throw new Error("expected results");
    expect(res.count).toBe(5);
    expect(res.answers).toHaveLength(5);
    const docIds = [...repo.responses.keys()];
    for (const a of res.answers) {
      expect(Object.keys(a).sort()).toEqual(["key", "open", "quick", "quickOther", "ratings"]);
      expect(a.key).toMatch(/^[0-9a-f]{16}$/);
      expect(docIds).not.toContain(a.key);
    }
    expect(JSON.stringify(res)).not.toContain(new Date().toISOString().slice(0, 10));
  });

  it("answer keys are stable between calls", async () => {
    for (let i = 0; i < 5; i++) await svc.submitResponse(repo, "ALPHA-OCT", payload(), new Date());
    const a = await svc.getWaveResults(repo, waveId);
    const b = await svc.getWaveResults(repo, waveId);
    if (!a || a.locked || !b || b.locked) throw new Error();
    expect(a.answers.map((x) => x.key).sort()).toEqual(b.answers.map((x) => x.key).sort());
  });

  it("unknown run → null", async () => {
    expect(await svc.getWaveResults(repo, "nope")).toBeNull();
  });
});

describe("setStar", () => {
  it("stores and removes stars, rejects malformed keys", async () => {
    const key = "0123456789abcdef_one_rule";
    expect(await svc.setStar(repo, waveId, key, true)).toEqual({ ok: true });
    expect(repo.waves.get(waveId)!.starred).toEqual({ [key]: true });
    expect(await svc.setStar(repo, waveId, key, false)).toEqual({ ok: true });
    expect(repo.waves.get(waveId)!.starred).toEqual({});
    expect(await svc.setStar(repo, waveId, "../../x", true)).toEqual({ ok: false });
    expect(await svc.setStar(repo, waveId, "0123456789abcdef_email", true)).toEqual({ ok: false });
  });
});

describe("getWaveResults threshold", () => {
  it("shows results from the very first response", async () => {
    await svc.submitResponse(repo, "ALPHA-OCT", payload(), new Date());
    const res = await svc.getWaveResults(repo, waveId);
    expect(res && !res.locked && res.answers).toHaveLength(1);
  });
});
