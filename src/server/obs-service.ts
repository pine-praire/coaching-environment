// Логика опроса близких без привязки к Firestore: хранилище передаётся снаружи (в тестах — в памяти).
// Опросов может быть несколько (о разных людях); участник попадает в нужный по паролю.
import { scryptSync, timingSafeEqual } from "node:crypto";
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

export interface SurveyRecord {
  id: string;
  subject: SubjectNames;
  // Пароль хранится открытым текстом, чтобы админ мог его видеть и пересылать (как коды в /comm).
  password: string | null;
  // Хеш пароля из первой версии (один опрос). Действует, пока админ не задаст новый пароль.
  passwordHash: string | null;
  open: boolean;
  createdAt: number; // мс, только для сортировки
}

export type SurveyPatch = Partial<
  Pick<SurveyRecord, "subject" | "password" | "passwordHash" | "open">
>;

export interface ObsRepo {
  listSurveys(): Promise<SurveyRecord[]>;
  getSurvey(id: string): Promise<SurveyRecord | null>;
  createSurvey(data: Omit<SurveyRecord, "id" | "createdAt">): Promise<string>;
  updateSurvey(id: string, patch: SurveyPatch): Promise<void>;
  deleteSurvey(id: string): Promise<void>; // вместе со всеми ответами
  countResponses(surveyId: string): Promise<number>;
  addResponse(surveyId: string, doc: ObsAnswer): Promise<void>;
  listResponses(surveyId: string): Promise<{ id: string; data: ObsAnswer }[]>;
  deleteResponse(id: string): Promise<boolean>;
}

// ---------- пароль ----------

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Проверка хеша из первой версии: scrypt$<соль>$<хеш>.
export function verifyLegacyHash(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

function passwordMatches(s: SurveyRecord, password: string): boolean {
  if (s.password !== null) return sameText(s.password, password);
  return verifyLegacyHash(password, s.passwordHash);
}

// ---------- участники ----------

async function findOpenSurvey(repo: ObsRepo, rawPassword: unknown): Promise<SurveyRecord | null> {
  const pw = passwordInputSchema.safeParse(rawPassword);
  if (!pw.success) return null;
  const surveys = await repo.listSurveys();
  return surveys.find((s) => s.open && passwordMatches(s, pw.data)) ?? null;
}

export async function checkPassword(repo: ObsRepo, rawPassword: unknown) {
  const s = await findOpenSurvey(repo, rawPassword);
  return s ? ({ ok: true, surveyId: s.id, subject: s.subject } as const) : ({ ok: false } as const);
}

export async function submitResponse(
  repo: ObsRepo,
  rawPassword: unknown,
  rawPayload: unknown,
  now = new Date(),
) {
  const s = await findOpenSurvey(repo, rawPassword);
  if (!s) return { ok: false, error: "auth" } as const;
  const parsed = payloadSchema.safeParse(rawPayload);
  if (!parsed.success) return { ok: false, error: "invalid" } as const;
  await repo.addResponse(s.id, toStoredAnswer(parsed.data, now));
  return { ok: true } as const;
}

// ---------- дашборд (вызывающий уже проверен как админ) ----------

export interface SurveySummary {
  id: string;
  subject: SubjectNames;
  password: string | null;
  hasPassword: boolean;
  open: boolean;
  count: number;
}

export async function listSurveys(repo: ObsRepo): Promise<SurveySummary[]> {
  const surveys = (await repo.listSurveys()).sort((a, b) => b.createdAt - a.createdAt);
  return Promise.all(
    surveys.map(async (s) => ({
      id: s.id,
      subject: s.subject,
      password: s.password,
      hasPassword: s.password !== null || s.passwordHash !== null,
      open: s.open,
      count: await repo.countResponses(s.id),
    })),
  );
}

export type SurveyError =
  "invalid_subject" | "invalid_password" | "password_taken" | "invalid_open" | "not_found";

async function passwordTaken(repo: ObsRepo, password: string, exceptId?: string) {
  return (await repo.listSurveys()).some((s) => s.id !== exceptId && passwordMatches(s, password));
}

export async function createSurvey(repo: ObsRepo, rawSubject: unknown, rawPassword: unknown) {
  const subject = subjectNamesSchema.safeParse(rawSubject);
  if (!subject.success) return { ok: false, error: "invalid_subject" as SurveyError } as const;
  const pw = newPasswordSchema.safeParse(rawPassword);
  if (!pw.success) return { ok: false, error: "invalid_password" as SurveyError } as const;
  if (await passwordTaken(repo, pw.data))
    return { ok: false, error: "password_taken" as SurveyError } as const;
  const surveyId = await repo.createSurvey({
    subject: subject.data,
    password: pw.data,
    passwordHash: null,
    open: true,
  });
  return { ok: true, surveyId } as const;
}

export async function updateSurvey(
  repo: ObsRepo,
  surveyId: unknown,
  patch: { subject?: unknown; password?: unknown; open?: unknown },
) {
  if (typeof surveyId !== "string" || !(await repo.getSurvey(surveyId)))
    return { ok: false, error: "not_found" as SurveyError } as const;
  const out: SurveyPatch = {};
  if (patch.subject !== undefined) {
    const subject = subjectNamesSchema.safeParse(patch.subject);
    if (!subject.success) return { ok: false, error: "invalid_subject" as SurveyError } as const;
    out.subject = subject.data;
  }
  if (patch.password !== undefined) {
    const pw = newPasswordSchema.safeParse(patch.password);
    if (!pw.success) return { ok: false, error: "invalid_password" as SurveyError } as const;
    if (await passwordTaken(repo, pw.data, surveyId))
      return { ok: false, error: "password_taken" as SurveyError } as const;
    out.password = pw.data; // старый пароль перестаёт работать сразу
    out.passwordHash = null;
  }
  if (patch.open !== undefined) {
    if (typeof patch.open !== "boolean")
      return { ok: false, error: "invalid_open" as SurveyError } as const;
    out.open = patch.open;
  }
  await repo.updateSurvey(surveyId, out);
  return { ok: true } as const;
}

export async function deleteSurvey(repo: ObsRepo, surveyId: unknown) {
  if (typeof surveyId !== "string" || !(await repo.getSurvey(surveyId)))
    return { ok: false, error: "not_found" as SurveyError } as const;
  await repo.deleteSurvey(surveyId);
  return { ok: true } as const;
}

export async function listResponses(repo: ObsRepo, surveyId: unknown): Promise<ObsResponse[]> {
  if (typeof surveyId !== "string" || !(await repo.getSurvey(surveyId))) return [];
  const docs = await repo.listResponses(surveyId);
  return docs
    .map(({ id, data }) => ({ ...data, id }))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

export async function deleteResponse(repo: ObsRepo, id: unknown) {
  if (typeof id !== "string" || !id || id.includes("/")) return { ok: false } as const;
  return (await repo.deleteResponse(id)) ? ({ ok: true } as const) : ({ ok: false } as const);
}
