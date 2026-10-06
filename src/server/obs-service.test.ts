import { scryptSync } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as svc from "./obs-service";
import { MemoryObsRepo } from "./obs-repo.memory";
import { obsPayload } from "@/test/obs-fixtures";

const VERA = { nom: "Вера", acc: "Веру", dat: "Вере", gender: "f" as const };
const OLEG = { nom: "Олег", acc: "Олега", dat: "Олегу", gender: "m" as const };
let repo: MemoryObsRepo;
let veraId: string;

async function create(subject: unknown, password: unknown) {
  const res = await svc.createSurvey(repo, subject, password);
  if (!res.ok) throw new Error(res.error);
  return res.surveyId;
}

beforeEach(async () => {
  repo = new MemoryObsRepo();
  veraId = await create(VERA, "vera-pass");
});

describe("checkPassword", () => {
  it("finds the survey by its password and returns the subject", async () => {
    const olegId = await create(OLEG, "oleg-pass");
    expect(await svc.checkPassword(repo, "vera-pass")).toEqual({
      ok: true,
      surveyId: veraId,
      subject: VERA,
    });
    expect(await svc.checkPassword(repo, " oleg-pass ")).toMatchObject({ surveyId: olegId });
  });

  it("is case-sensitive and rejects wrong or non-string input", async () => {
    expect(await svc.checkPassword(repo, "VERA-PASS")).toEqual({ ok: false });
    expect(await svc.checkPassword(repo, "")).toEqual({ ok: false });
    expect(await svc.checkPassword(repo, { password: "vera-pass" })).toEqual({ ok: false });
  });

  it("rejects the password of a closed survey", async () => {
    await svc.updateSurvey(repo, veraId, { open: false });
    expect(await svc.checkPassword(repo, "vera-pass")).toEqual({ ok: false });
  });

  it("stops accepting the old password after a change", async () => {
    await svc.updateSurvey(repo, veraId, { password: "new-vera-pass" });
    expect((await svc.checkPassword(repo, "vera-pass")).ok).toBe(false);
    expect((await svc.checkPassword(repo, "new-vera-pass")).ok).toBe(true);
  });

  it("still accepts a first-version hashed password until a new one is set", async () => {
    const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    const hash = `scrypt$${salt.toString("hex")}$${scryptSync("old-secret", salt, 32).toString("hex")}`;
    const id = await repo.createSurvey({
      subject: VERA,
      password: null,
      passwordHash: hash,
      open: true,
    });
    expect(await svc.checkPassword(repo, "old-secret")).toMatchObject({ ok: true, surveyId: id });
    expect((await svc.listSurveys(repo)).find((s) => s.id === id)).toMatchObject({
      password: null,
      hasPassword: true,
    });
    await svc.updateSurvey(repo, id, { password: "fresh-secret" });
    expect((await svc.checkPassword(repo, "old-secret")).ok).toBe(false);
    expect((await repo.getSurvey(id))?.passwordHash).toBeNull();
  });
});

describe("submitResponse", () => {
  it("stores the answer in the survey the password belongs to", async () => {
    const olegId = await create(OLEG, "oleg-pass");
    const now = new Date("2026-10-06T12:00:00Z");
    expect(await svc.submitResponse(repo, "oleg-pass", obsPayload(), now)).toEqual({ ok: true });
    expect(await svc.listResponses(repo, veraId)).toEqual([]);
    const [stored] = await svc.listResponses(repo, olegId);
    expect(stored.submittedAt).toBe("2026-10-06T12:00:00.000Z");
    expect(stored.name).toBe("Мария");
  });

  it("separates a wrong password from an invalid payload", async () => {
    expect(await svc.submitResponse(repo, "wrong-pass", obsPayload())).toEqual({
      ok: false,
      error: "auth",
    });
    expect(await svc.submitResponse(repo, "vera-pass", { version: 1 })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(repo.responses.size).toBe(0);
  });
});

describe("surveys", () => {
  it("lists surveys newest first with visible passwords and counts", async () => {
    const olegId = await create(OLEG, "oleg-pass");
    await svc.submitResponse(repo, "vera-pass", obsPayload());
    expect(await svc.listSurveys(repo)).toEqual([
      { id: olegId, subject: OLEG, password: "oleg-pass", hasPassword: true, open: true, count: 0 },
      { id: veraId, subject: VERA, password: "vera-pass", hasPassword: true, open: true, count: 1 },
    ]);
  });

  it("requires a unique password", async () => {
    expect(await svc.createSurvey(repo, OLEG, "vera-pass")).toEqual({
      ok: false,
      error: "password_taken",
    });
    const olegId = await create(OLEG, "oleg-pass");
    expect(await svc.updateSurvey(repo, olegId, { password: "vera-pass" })).toEqual({
      ok: false,
      error: "password_taken",
    });
    expect(await svc.updateSurvey(repo, veraId, { password: "vera-pass" })).toEqual({ ok: true });
  });

  it("validates the subject, password and open flag", async () => {
    expect(await svc.createSurvey(repo, { ...OLEG, gender: "x" }, "oleg-pass")).toEqual({
      ok: false,
      error: "invalid_subject",
    });
    expect(await svc.createSurvey(repo, OLEG, "short")).toEqual({
      ok: false,
      error: "invalid_password",
    });
    expect(await svc.updateSurvey(repo, veraId, { open: "yes" })).toEqual({
      ok: false,
      error: "invalid_open",
    });
    expect(await svc.updateSurvey(repo, "missing", { open: true })).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("changes the subject including gender", async () => {
    expect(await svc.updateSurvey(repo, veraId, { subject: { ...VERA, gender: "m" } })).toEqual({
      ok: true,
    });
    expect((await repo.getSurvey(veraId))?.subject.gender).toBe("m");
  });

  it("deletes a survey with its answers only", async () => {
    const olegId = await create(OLEG, "oleg-pass");
    await svc.submitResponse(repo, "vera-pass", obsPayload());
    await svc.submitResponse(repo, "oleg-pass", obsPayload());
    expect(await svc.deleteSurvey(repo, veraId)).toEqual({ ok: true });
    expect(await svc.deleteSurvey(repo, veraId)).toEqual({ ok: false, error: "not_found" });
    expect(repo.responses.size).toBe(1);
    expect(await svc.listResponses(repo, olegId)).toHaveLength(1);
  });
});

describe("responses", () => {
  it("lists answers oldest first and deletes one", async () => {
    await svc.submitResponse(
      repo,
      "vera-pass",
      obsPayload({ name: "Вторая" }),
      new Date("2026-10-02"),
    );
    await svc.submitResponse(
      repo,
      "vera-pass",
      obsPayload({ name: "Первая" }),
      new Date("2026-10-01"),
    );
    const list = await svc.listResponses(repo, veraId);
    expect(list.map((r) => r.name)).toEqual(["Первая", "Вторая"]);
    expect(await svc.deleteResponse(repo, list[0].id)).toEqual({ ok: true });
    expect(await svc.deleteResponse(repo, list[0].id)).toEqual({ ok: false });
    expect(await svc.deleteResponse(repo, "a/b")).toEqual({ ok: false });
    expect((await svc.listResponses(repo, veraId)).map((r) => r.name)).toEqual(["Вторая"]);
    expect(await svc.listResponses(repo, "missing")).toEqual([]);
  });
});
