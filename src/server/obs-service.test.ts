import { beforeEach, describe, expect, it } from "vitest";
import * as svc from "./obs-service";
import { MemoryObsRepo } from "./obs-repo.memory";
import { obsPayload } from "@/test/obs-fixtures";

const NAMES = { nom: "Вера", acc: "Веру", dat: "Вере" };
let repo: MemoryObsRepo;

beforeEach(async () => {
  repo = new MemoryObsRepo();
  await svc.updateSettings(repo, { names: NAMES, password: "secret-pass", open: true });
});

describe("password", () => {
  it("stores a salted hash, not the password", () => {
    expect(repo.config.passwordHash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(repo.config.passwordHash).not.toContain("secret-pass");
    expect(svc.hashPassword("x1234567")).not.toBe(svc.hashPassword("x1234567"));
  });

  it("verifies only the exact password", () => {
    const h = svc.hashPassword("Secret-Pass");
    expect(svc.verifyPassword("Secret-Pass", h)).toBe(true);
    expect(svc.verifyPassword("secret-pass", h)).toBe(false);
    expect(svc.verifyPassword("Secret-Pass", null)).toBe(false);
    expect(svc.verifyPassword("Secret-Pass", "garbage")).toBe(false);
  });
});

describe("checkPassword", () => {
  it("returns the name forms for the right password only", async () => {
    expect(await svc.checkPassword(repo, "secret-pass")).toEqual({ ok: true, names: NAMES });
    expect(await svc.checkPassword(repo, "wrong")).toEqual({ ok: false });
    expect(await svc.checkPassword(repo, { password: "secret-pass" })).toEqual({ ok: false });
  });

  it("rejects everything while the survey is closed or not set up", async () => {
    await svc.updateSettings(repo, { open: false });
    expect(await svc.checkPassword(repo, "secret-pass")).toEqual({ ok: false });
    const empty = new MemoryObsRepo();
    await svc.updateSettings(empty, { open: true });
    expect(await svc.checkPassword(empty, "")).toEqual({ ok: false });
  });

  it("stops accepting the old password after a change", async () => {
    await svc.updateSettings(repo, { password: "new-password" });
    expect((await svc.checkPassword(repo, "secret-pass")).ok).toBe(false);
    expect((await svc.checkPassword(repo, "new-password")).ok).toBe(true);
  });
});

describe("submitResponse", () => {
  it("stores a valid answer with the server time", async () => {
    const now = new Date("2026-10-06T12:00:00Z");
    expect(await svc.submitResponse(repo, "secret-pass", obsPayload(), now)).toEqual({ ok: true });
    const [stored] = await svc.listResponses(repo);
    expect(stored.submittedAt).toBe("2026-10-06T12:00:00.000Z");
    expect(stored.name).toBe("Мария");
    expect(stored.id).toBeTruthy();
  });

  it("separates a wrong password from an invalid payload", async () => {
    expect(await svc.submitResponse(repo, "wrong", obsPayload())).toEqual({
      ok: false,
      error: "auth",
    });
    expect(await svc.submitResponse(repo, "secret-pass", { version: 1 })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(repo.responses.size).toBe(0);
  });
});

describe("settings and responses", () => {
  it("reports settings without the hash", async () => {
    expect(await svc.getSettings(repo)).toEqual({ names: NAMES, open: true, hasPassword: true });
  });

  it("rejects bad settings without changing anything", async () => {
    expect(await svc.updateSettings(repo, { password: "short" })).toEqual({
      ok: false,
      error: "invalid_password",
    });
    expect(await svc.updateSettings(repo, { open: "yes" })).toEqual({
      ok: false,
      error: "invalid_open",
    });
    expect(await svc.updateSettings(repo, { names: { nom: "Вера" } })).toEqual({
      ok: false,
      error: "invalid_names",
    });
    expect((await svc.checkPassword(repo, "secret-pass")).ok).toBe(true);
  });

  it("lists answers oldest first and deletes one", async () => {
    await svc.submitResponse(
      repo,
      "secret-pass",
      obsPayload({ name: "Вторая" }),
      new Date("2026-10-02"),
    );
    await svc.submitResponse(
      repo,
      "secret-pass",
      obsPayload({ name: "Первая" }),
      new Date("2026-10-01"),
    );
    const list = await svc.listResponses(repo);
    expect(list.map((r) => r.name)).toEqual(["Первая", "Вторая"]);
    expect(await svc.deleteResponse(repo, list[0].id)).toEqual({ ok: true });
    expect(await svc.deleteResponse(repo, list[0].id)).toEqual({ ok: false });
    expect(await svc.deleteResponse(repo, "a/b")).toEqual({ ok: false });
    expect((await svc.listResponses(repo)).map((r) => r.name)).toEqual(["Вторая"]);
  });
});
