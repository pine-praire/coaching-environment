// Расчёты для дашборда опроса близких. Работают на клиенте по полному списку ответов.
import type { ObsAnswer } from "./obs-schema";
import {
  ADULT_IDS,
  CHILD_IDS,
  FREQUENCIES,
  INDICES,
  RELATIONS,
  REVERSED,
  SCALE_SCORE,
  SCALE_VALUES,
  WHEN_VALUES,
  type IndexDef,
  type ScaleValue,
  type WhenValue,
} from "./obs-survey";

export function scaleValue(a: ObsAnswer, id: string): ScaleValue | null {
  if (id.startsWith("Z")) return a.child?.scale[id]?.v ?? null;
  return a.scale[id]?.v ?? null;
}

// Балл пункта с учётом обратной шкалы; null для «Не знаю» и отсутствующих ответов.
export function itemScore(a: ObsAnswer, id: string): number | null {
  const v = scaleValue(a, id);
  if (!v) return null;
  const s = SCALE_SCORE[v];
  if (s === null) return null;
  return REVERSED.has(id) ? 4 - s : s;
}

export interface IndexValue {
  id: string;
  mean: number | null;
  answered: number;
  total: number;
}

export function indexValue(a: ObsAnswer, def: IndexDef): IndexValue {
  if (def.child && !a.child) return { id: def.id, mean: null, answered: 0, total: 0 };
  const scores = def.items.map((id) => itemScore(a, id)).filter((s): s is number => s !== null);
  return {
    id: def.id,
    mean: scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null,
    answered: scores.length,
    total: def.items.length,
  };
}

export const indicesFor = (a: ObsAnswer) => INDICES.map((d) => indexValue(a, d));

// Среднее индекса по всем, у кого он посчитан.
export function indexAverage(answers: ObsAnswer[], def: IndexDef) {
  const means = answers.map((a) => indexValue(a, def).mean).filter((m): m is number => m !== null);
  return {
    mean: means.length ? means.reduce((x, y) => x + y, 0) / means.length : null,
    n: means.length,
  };
}

export interface ItemSummary {
  id: string;
  counts: Record<ScaleValue, number>;
  when: Record<WhenValue, number>;
  answered: number; // все ответы, включая «Не знаю»
  mean: number | null; // по исходной шкале 0–4, без переворота и без «Не знаю»
}

export function itemSummary(answers: ObsAnswer[], id: string): ItemSummary {
  const counts = Object.fromEntries(SCALE_VALUES.map((v) => [v, 0])) as Record<ScaleValue, number>;
  const when = Object.fromEntries(WHEN_VALUES.map((v) => [v, 0])) as Record<WhenValue, number>;
  let sum = 0;
  let scored = 0;
  let answered = 0;
  for (const a of answers) {
    const v = scaleValue(a, id);
    if (!v) continue;
    answered++;
    counts[v]++;
    const s = SCALE_SCORE[v];
    if (s !== null) {
      sum += s;
      scored++;
    }
    const w = id.startsWith("Z") ? null : a.scale[id]?.when;
    if (w) when[w]++;
  }
  return { id, counts, when, answered, mean: scored ? sum / scored : null };
}

export const summaryIds = () => [...ADULT_IDS, ...CHILD_IDS];

export const fmtIndex = (m: number | null) => (m === null ? "—" : m.toFixed(1).replace(".", ","));

const RELATION_LABEL = Object.fromEntries(RELATIONS) as Record<string, string>;
const FREQUENCY_LABEL = Object.fromEntries(FREQUENCIES) as Record<string, string>;

export function relationText(a: ObsAnswer): string {
  if (a.about.relation === "other") return a.about.relationOther || RELATION_LABEL.other;
  return RELATION_LABEL[a.about.relation] ?? a.about.relation;
}
export const frequencyText = (a: ObsAnswer) =>
  FREQUENCY_LABEL[a.about.frequency] ?? a.about.frequency;

// Подпись респондента в списке. Номер — по порядку отправки (самый ранний — №1).
export function respondentLabel(a: ObsAnswer, n: number): string {
  return a.name ?? `Без имени №${n}`;
}

// Список по времени отправки с номерами, которые использует respondentLabel.
export function numbered<T extends ObsAnswer>(answers: T[]): { a: T; n: number }[] {
  return [...answers]
    .sort((x, y) => x.submittedAt.localeCompare(y.submittedAt))
    .map((a, i) => ({ a, n: i + 1 }));
}

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
};
