// Логика опроса близких без привязки к Firestore: хранилище передаётся снаружи (в тестах — в памяти).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  newPasswordSchema,
  passwordInputSchema,
  payloadSchema,
  subjectNamesSchema,
  toStoredAnswer,
  type ObsAnswer,
  type ObsResponse,
} from "@/lib/obs-schema";
import type { SubjectNames } from "@/lib/obs-survey";

export interface ObsConfig {
  names: SubjectNames | null;
  passwordHash: string | null;
  open: boolean;
}

export interface ObsRepo {
  getConfig(): Promise<ObsConfig>;
  updateConfig(patch: Partial<ObsConfig>): Promise<void>;
  addResponse(doc: ObsAnswer): Promise<void>;
  listResponses(): Promise<{ id: string; data: ObsAnswer }[]>;
  deleteResponse(id: string): Promise<boolean>;
}

// ---------- пароль ----------

const KEY_LEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// ---------- участники ----------

// Опрос доступен, только если он открыт, задан пароль и имя человека.
async function admit(repo: ObsRepo, rawPassword: unknown): Promise<SubjectNames | null> {
  const pw = passwordInputSchema.safeParse(rawPassword);
  if (!pw.success) return null;
  const cfg = await repo.getConfig();
  if (!cfg.open || !cfg.names) return null;
  return verifyPassword(pw.data, cfg.passwordHash) ? cfg.names : null;
}

export async function checkPassword(repo: ObsRepo, rawPassword: unknown) {
  const names = await admit(repo, rawPassword);
  return names ? ({ ok: true, names } as const) : ({ ok: false } as const);
}

export async function submitResponse(
  repo: ObsRepo,
  rawPassword: unknown,
  rawPayload: unknown,
  now = new Date(),
) {
  if (!(await admit(repo, rawPassword))) return { ok: false, error: "auth" } as const;
  const parsed = payloadSchema.safeParse(rawPayload);
  if (!parsed.success) return { ok: false, error: "invalid" } as const;
  await repo.addResponse(toStoredAnswer(parsed.data, now));
  return { ok: true } as const;
}

// ---------- дашборд (вызывающий уже проверен как админ) ----------

export async function getSettings(repo: ObsRepo) {
  const cfg = await repo.getConfig();
  return { names: cfg.names, open: cfg.open, hasPassword: !!cfg.passwordHash };
}

export type SettingsError = "invalid_names" | "invalid_password" | "invalid_open";

export async function updateSettings(
  repo: ObsRepo,
  patch: { names?: unknown; password?: unknown; open?: unknown },
) {
  const out: Partial<ObsConfig> = {};
  if (patch.names !== undefined) {
    const names = subjectNamesSchema.safeParse(patch.names);
    if (!names.success) return { ok: false, error: "invalid_names" as SettingsError } as const;
    out.names = names.data;
  }
  if (patch.password !== undefined) {
    const pw = newPasswordSchema.safeParse(patch.password);
    if (!pw.success) return { ok: false, error: "invalid_password" as SettingsError } as const;
    out.passwordHash = hashPassword(pw.data); // старый пароль перестаёт работать сразу
  }
  if (patch.open !== undefined) {
    if (typeof patch.open !== "boolean")
      return { ok: false, error: "invalid_open" as SettingsError } as const;
    out.open = patch.open;
  }
  await repo.updateConfig(out);
  return { ok: true } as const;
}

export async function listResponses(repo: ObsRepo): Promise<ObsResponse[]> {
  const docs = await repo.listResponses();
  return docs
    .map(({ id, data }) => ({ ...data, id }))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

export async function deleteResponse(repo: ObsRepo, id: unknown) {
  if (typeof id !== "string" || !id || id.includes("/")) return { ok: false } as const;
  return (await repo.deleteResponse(id)) ? ({ ok: true } as const) : ({ ok: false } as const);
}
