import { z } from "zod";
import {
  ADULT_IDS,
  AGE_VALUES,
  CHILD_IDS,
  FREQUENCY_VALUES,
  NAME_MAX,
  OPEN_CHILD_IDS,
  OPEN_IDS,
  OPEN_MAX,
  PLACE_VALUES,
  RELATION_VALUES,
  SCALE_VALUES,
  SHORT_MAX,
  WHEN_TRIGGER,
  WHEN_VALUES,
  YEARS_MAX,
} from "./obs-survey";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;
export const SUBJECT_NAME_MAX = 60;

// Пароль, который вводит участник: пробелы по краям отбрасываются, регистр важен.
export const passwordInputSchema = z.string().max(PASSWORD_MAX).trim().min(1);
// Пароль, который задаёт админ. Он же определяет опрос, поэтому у каждого опроса свой.
export const newPasswordSchema = z.string().trim().min(PASSWORD_MIN).max(PASSWORD_MAX);

export const subjectNamesSchema = z
  .object({
    nom: z.string().trim().min(1).max(SUBJECT_NAME_MAX),
    acc: z.string().trim().min(1).max(SUBJECT_NAME_MAX),
    dat: z.string().trim().min(1).max(SUBJECT_NAME_MAX),
    gender: z.enum(["f", "m"]),
  })
  .strict();

const text = (max: number) => z.string().max(max).nullable();
const unique = <T>(a: T[]) => new Set(a).size === a.length;

const scaleAnswer = z
  .object({ v: z.enum(SCALE_VALUES), when: z.enum(WHEN_VALUES).nullable() })
  .strict()
  .refine((a) => a.when === null || WHEN_TRIGGER.includes(a.v), "when only after often");

const childScaleAnswer = z.object({ v: z.enum(SCALE_VALUES) }).strict();

// Объект с ровно заданными ключами: лишние и недостающие отклоняются.
function exactRecord<T extends z.ZodTypeAny>(ids: string[], value: T) {
  return z.object(Object.fromEntries(ids.map((id) => [id, value])) as Record<string, T>).strict();
}

// То, что присылает страница опроса.
export const payloadSchema = z
  .object({
    version: z.literal(1),
    name: text(NAME_MAX),
    about: z
      .object({
        relation: z.enum(RELATION_VALUES),
        relationOther: text(SHORT_MAX),
        years: z.number().int().min(0).max(YEARS_MAX),
        frequency: z.enum(FREQUENCY_VALUES),
        places: z.array(z.enum(PLACE_VALUES)).min(1).refine(unique, "duplicate place"),
        knewAsChild: z.enum(["yes", "no"]),
      })
      .strict()
      .refine(
        (a) => a.relation !== "other" || !!a.relationOther?.trim(),
        "relationOther is required for other",
      ),
    start: z.object({ threeWords: text(SHORT_MAX), valued: text(OPEN_MAX) }).strict(),
    scale: exactRecord(ADULT_IDS, scaleAnswer),
    open: exactRecord(OPEN_IDS, text(OPEN_MAX)),
    child: z
      .object({
        ages: z.array(z.enum(AGE_VALUES)).min(1).refine(unique, "duplicate age"),
        scale: exactRecord(CHILD_IDS, childScaleAnswer),
        open: exactRecord(OPEN_CHILD_IDS, text(OPEN_MAX)),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((p) => (p.about.knewAsChild === "yes") === (p.child !== null), "child block mismatch");

export type ObsPayload = z.infer<typeof payloadSchema>;

type ScaleAnswer = { v: (typeof SCALE_VALUES)[number]; when: (typeof WHEN_VALUES)[number] | null };

// Документ obs_responses. Хранится только то, что ввёл участник, и время отправки по серверу.
export interface ObsAnswer {
  version: 1;
  submittedAt: string; // ISO, ставит сервер
  name: string | null;
  about: {
    relation: (typeof RELATION_VALUES)[number];
    relationOther: string | null;
    years: number;
    frequency: (typeof FREQUENCY_VALUES)[number];
    places: (typeof PLACE_VALUES)[number][];
    knewAsChild: "yes" | "no";
  };
  start: { threeWords: string | null; valued: string | null };
  scale: Record<string, ScaleAnswer>;
  open: Record<string, string | null>;
  child: {
    ages: (typeof AGE_VALUES)[number][];
    scale: Record<string, { v: (typeof SCALE_VALUES)[number] }>;
    open: Record<string, string | null>;
  } | null;
}

// Ответ с id документа: так его видит дашборд.
export interface ObsResponse extends ObsAnswer {
  id: string;
}

const clean = (s: string | null) => (s ?? "").trim() || null;
const cleanAll = (r: Record<string, string | null>, ids: string[]) =>
  Object.fromEntries(ids.map((id) => [id, clean(r[id])]));

export function toStoredAnswer(p: ObsPayload, now = new Date()): ObsAnswer {
  return {
    version: 1,
    submittedAt: now.toISOString(),
    name: clean(p.name),
    about: {
      relation: p.about.relation,
      relationOther: p.about.relation === "other" ? clean(p.about.relationOther) : null,
      years: p.about.years,
      frequency: p.about.frequency,
      places: [...p.about.places],
      knewAsChild: p.about.knewAsChild,
    },
    start: { threeWords: clean(p.start.threeWords), valued: clean(p.start.valued) },
    scale: Object.fromEntries(
      ADULT_IDS.map((id) => [id, { v: p.scale[id].v, when: p.scale[id].when }]),
    ),
    open: cleanAll(p.open, OPEN_IDS),
    child: p.child
      ? {
          ages: [...p.child.ages],
          scale: Object.fromEntries(CHILD_IDS.map((id) => [id, { v: p.child!.scale[id].v }])),
          open: cleanAll(p.child.open, OPEN_CHILD_IDS),
        }
      : null,
  };
}
