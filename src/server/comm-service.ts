// Логика опроса без привязки к Firestore: хранилище передаётся снаружи (в тестах — в памяти).
import { createHash } from "node:crypto";
import type { CommAnswer } from "@/lib/comm-analysis";
import { shuffle } from "@/lib/comm-csv";
import {
  codeInputSchema,
  newCodeSchema,
  payloadSchema,
  serverDate,
  toStoredAnswer,
  waveNameSchema,
} from "@/lib/comm-schema";
import { OPEN_IDS, THRESHOLD } from "@/lib/comm-survey";

export interface WaveRecord {
  id: string;
  name: string;
  code: string;
  open: boolean;
  createdAt: number; // мс, только для сортировки списка запусков
  starred: Record<string, true>;
}

export interface StoredResponse {
  waveId: string;
  date: string;
  version: 1;
  ratings: Record<string, number>;
  quick: string[];
  quickOther: string | null;
  open: Record<string, string | null>;
}

export interface CommRepo {
  findWavesByCode(code: string): Promise<WaveRecord[]>;
  getWave(id: string): Promise<WaveRecord | null>;
  listWaves(): Promise<WaveRecord[]>;
  countResponses(waveId: string): Promise<number>;
  createWave(data: { name: string; code: string; open: boolean }): Promise<string>;
  updateWave(id: string, patch: Partial<Pick<WaveRecord, "name" | "code" | "open">>): Promise<void>;
  addResponse(doc: StoredResponse): Promise<void>;
  listResponses(waveId: string): Promise<{ id: string; data: StoredResponse }[]>;
  setStar(waveId: string, key: string, on: boolean): Promise<void>;
  deleteWave(id: string): Promise<void>; // вместе со всеми ответами запуска
}

// ---------- участники ----------

export async function findOpenWave(repo: CommRepo, rawCode: unknown): Promise<WaveRecord | null> {
  const parsed = codeInputSchema.safeParse(rawCode);
  if (!parsed.success) return null;
  const waves = await repo.findWavesByCode(parsed.data);
  return waves.find((w) => w.open) ?? null;
}

export async function checkCode(repo: CommRepo, rawCode: unknown) {
  const wave = await findOpenWave(repo, rawCode);
  return wave ? ({ ok: true, waveId: wave.id } as const) : ({ ok: false } as const);
}

export async function submitResponse(
  repo: CommRepo,
  rawCode: unknown,
  rawPayload: unknown,
  now = new Date(),
) {
  const wave = await findOpenWave(repo, rawCode);
  if (!wave) return { ok: false } as const;
  const parsed = payloadSchema.safeParse(rawPayload);
  if (!parsed.success) return { ok: false } as const;
  await repo.addResponse({
    waveId: wave.id,
    date: serverDate(now),
    ...toStoredAnswer(parsed.data),
  });
  return { ok: true } as const;
}

// ---------- дашборд (вызывающий уже проверен как админ) ----------

export interface WaveSummary {
  id: string;
  name: string;
  code: string;
  open: boolean;
  count: number;
}

export async function listWaves(repo: CommRepo): Promise<WaveSummary[]> {
  const waves = (await repo.listWaves()).sort((a, b) => b.createdAt - a.createdAt);
  return Promise.all(
    waves.map(async (w) => ({
      id: w.id,
      name: w.name,
      code: w.code,
      open: w.open,
      count: await repo.countResponses(w.id),
    })),
  );
}

async function codeTaken(repo: CommRepo, code: string, exceptId?: string) {
  return (await repo.findWavesByCode(code)).some((w) => w.id !== exceptId);
}

export type WaveError =
  | "invalid_name"
  | "invalid_code"
  | "invalid_open"
  | "code_taken"
  | "not_found";

export async function createWave(repo: CommRepo, rawName: unknown, rawCode: unknown) {
  const name = waveNameSchema.safeParse(rawName);
  if (!name.success) return { ok: false, error: "invalid_name" as WaveError } as const;
  const code = newCodeSchema.safeParse(rawCode);
  if (!code.success) return { ok: false, error: "invalid_code" as WaveError } as const;
  if (await codeTaken(repo, code.data))
    return { ok: false, error: "code_taken" as WaveError } as const;
  const waveId = await repo.createWave({ name: name.data, code: code.data, open: true });
  return { ok: true, waveId } as const;
}

export async function updateWave(
  repo: CommRepo,
  waveId: unknown,
  patch: { name?: unknown; code?: unknown; open?: unknown },
) {
  if (typeof waveId !== "string" || !(await repo.getWave(waveId)))
    return { ok: false, error: "not_found" as WaveError } as const;
  const out: Partial<Pick<WaveRecord, "name" | "code" | "open">> = {};
  if (patch.name !== undefined) {
    const name = waveNameSchema.safeParse(patch.name);
    if (!name.success) return { ok: false, error: "invalid_name" as WaveError } as const;
    out.name = name.data;
  }
  if (patch.code !== undefined) {
    const code = newCodeSchema.safeParse(patch.code);
    if (!code.success) return { ok: false, error: "invalid_code" as WaveError } as const;
    if (await codeTaken(repo, code.data, waveId))
      return { ok: false, error: "code_taken" as WaveError } as const;
    out.code = code.data; // старый код перестаёт работать сразу: он просто больше нигде не записан
  }
  if (patch.open !== undefined) {
    if (typeof patch.open !== "boolean")
      return { ok: false, error: "invalid_open" as WaveError } as const;
    out.open = patch.open;
  }
  await repo.updateWave(waveId, out);
  return { ok: true } as const;
}

export async function deleteWave(repo: CommRepo, waveId: unknown) {
  if (typeof waveId !== "string" || !(await repo.getWave(waveId)))
    return { ok: false, error: "not_found" as WaveError } as const;
  await repo.deleteWave(waveId);
  return { ok: true } as const;
}

// Непрозрачный стабильный ключ ответа: по нему нельзя восстановить порядок отправки.
export function answerKey(docId: string): string {
  return createHash("sha256").update(docId).digest("hex").slice(0, 16);
}

export type WaveResults =
  | { locked: true; count: number }
  | { locked: false; count: number; answers: CommAnswer[]; starred: string[] };

export async function getWaveResults(repo: CommRepo, waveId: unknown): Promise<WaveResults | null> {
  if (typeof waveId !== "string") return null;
  const wave = await repo.getWave(waveId);
  if (!wave) return null;
  const docs = await repo.listResponses(waveId);
  if (docs.length < THRESHOLD) return { locked: true, count: docs.length };
  // Только содержательные поля: без id документа, даты и служебных полей.
  const answers: CommAnswer[] = shuffle(docs).map(({ id, data }) => ({
    key: answerKey(id),
    ratings: data.ratings,
    quick: data.quick,
    quickOther: data.quickOther,
    open: {
      ambiguous_phrase: data.open.ambiguous_phrase ?? null,
      where_it_breaks: data.open.where_it_breaks ?? null,
      one_rule: data.open.one_rule ?? null,
    },
  }));
  return { locked: false, count: docs.length, answers, starred: Object.keys(wave.starred ?? {}) };
}

const STAR_KEY = new RegExp(`^[0-9a-f]{16}_(${OPEN_IDS.join("|")})$`);

export async function setStar(repo: CommRepo, waveId: unknown, key: unknown, on: unknown) {
  if (typeof waveId !== "string" || typeof key !== "string" || typeof on !== "boolean")
    return { ok: false } as const;
  if (!STAR_KEY.test(key) || !(await repo.getWave(waveId))) return { ok: false } as const;
  await repo.setStar(waveId, key, on);
  return { ok: true } as const;
}
