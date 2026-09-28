import { z } from "zod";
import { OPEN_MAX, QUESTION_COUNT, QUICK_IDS, QUICK_MAX, QUICK_OTHER_MAX } from "./comm-survey";

export const CODE_MIN = 6;
export const CODE_MAX = 40;
export const WAVE_NAME_MAX = 120;

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

// Код, который вводит участник: любую строку разумной длины приводим к виду, в котором он хранится.
export const codeInputSchema = z
  .string()
  .max(200)
  .transform(normalizeCode)
  .pipe(z.string().min(1).max(CODE_MAX));

// Код, который задаёт админ: длиннее и без пробелов внутри, чтобы его было трудно подобрать.
export const newCodeSchema = z
  .string()
  .transform(normalizeCode)
  .pipe(
    z
      .string()
      .min(CODE_MIN)
      .max(CODE_MAX)
      .regex(/^[A-Z0-9-]+$/),
  );

export const waveNameSchema = z.string().trim().min(1).max(WAVE_NAME_MAX);

const rating = z.number().int().min(1).max(5);

const ratingsSchema = z.record(z.string(), rating).refine((r) => {
  const keys = Object.keys(r);
  if (keys.length !== QUESTION_COUNT) return false;
  for (let n = 1; n <= QUESTION_COUNT; n++) if (!(String(n) in r)) return false;
  return true;
}, "all 34 ratings are required");

const openText = z.string().max(OPEN_MAX).nullable();

// То, что присылает страница опроса. Строгие объекты: лишние поля отклоняются.
export const payloadSchema = z
  .object({
    version: z.literal(1),
    ratings: ratingsSchema,
    quick: z
      .array(z.enum(QUICK_IDS as [string, ...string[]]))
      .max(QUICK_MAX)
      .refine((q) => new Set(q).size === q.length, "duplicate quick pick"),
    quickOther: z.string().max(QUICK_OTHER_MAX).nullable(),
    open: z
      .object({
        ambiguous_phrase: openText,
        where_it_breaks: openText,
        one_rule: openText,
      })
      .strict(),
  })
  .strict()
  .refine((p) => p.quickOther === null || p.quick.includes("other"), "quickOther requires other");

export type CommPayload = z.infer<typeof payloadSchema>;

const clean = (s: string | null) => (s ?? "").trim() || null;

// Документ comm_responses без waveId и date: их добавляет сервер.
export function toStoredAnswer(p: CommPayload) {
  const ratings: Record<string, number> = {};
  for (let n = 1; n <= QUESTION_COUNT; n++) ratings[String(n)] = p.ratings[String(n)];
  return {
    version: 1 as const,
    ratings,
    quick: [...p.quick],
    quickOther: p.quick.includes("other") ? clean(p.quickOther) : null,
    open: {
      ambiguous_phrase: clean(p.open.ambiguous_phrase),
      where_it_breaks: clean(p.open.where_it_breaks),
      one_rule: clean(p.open.one_rule),
    },
  };
}

export function serverDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
