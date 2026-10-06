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

// ---------- анализ по направлениям (СДВГ, РАС, депрессия) ----------
// Описательная картина для специалиста, не диагноз и без порогов: анкета не валидирована.

export interface DomainDef {
  id: string;
  title: string;
  now: string[]; // индексы о настоящем
  child: string[]; // индексы о детстве
  note: string;
}

export const DOMAINS: DomainDef[] = [
  {
    id: "adhd",
    title: "СДВГ",
    now: ["attention", "impulsivity"],
    child: ["child_attention"],
    note: "Для СДВГ признаки обычно есть с детства: смотрите на детство и ответы «Так было всегда».",
  },
  {
    id: "asd",
    title: "РАС",
    now: ["social", "routine"],
    child: ["child_social"],
    note: "Для РАС признаки обычно заметны с раннего детства и устойчивы.",
  },
  {
    id: "depression",
    title: "Депрессия",
    now: ["mood_low"],
    child: [],
    note: "Депрессия выглядит как изменение: смотрите на ответы «Появилось в последние годы».",
  },
];

export const BACKGROUND_INDICES = ["mood_high", "anxiety", "child_mood"];

const indexItems = (ids: string[]) =>
  ids.flatMap((id) => INDICES.find((d) => d.id === id)?.items ?? []);

export const domainItems = (d: DomainDef) => ({
  now: indexItems(d.now),
  child: indexItems(d.child),
});

// Среднее по отвечённым пунктам (с учётом обратных), null если ни одного ответа.
export function itemsMean(a: ObsAnswer, ids: string[]): number | null {
  const scores = ids.map((id) => itemScore(a, id)).filter((s): s is number => s !== null);
  return scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null;
}

// Ближайшая метка шкалы для среднего 0–4: «Иногда», «Часто»…
export const levelLabel = (m: number) =>
  ["Никогда", "Редко", "Иногда", "Часто", "Почти всегда"][Math.min(4, Math.max(0, Math.round(m)))];

export type OnsetCounts = Record<WhenValue | "none", number>;

// «С какого времени» для признаков, отмеченных как частые. Пункты с обратной шкалой не считаются:
// там «Часто» означает, что признака нет.
export function onsetCounts(answers: ObsAnswer[], ids: string[]): OnsetCounts {
  const out: OnsetCounts = { always: 0, recent: 0, episodes: 0, unknown: 0, none: 0 };
  for (const a of answers)
    for (const id of ids) {
      if (REVERSED.has(id) || id.startsWith("Z")) continue;
      const s = a.scale[id];
      if (!s || (s.v !== "often" && s.v !== "almost_always")) continue;
      out[s.when ?? "none"]++;
    }
  return out;
}

export interface PersonScore {
  key: string; // id ответа или номер
  label: string;
  value: number;
}

export interface DomainResult {
  def: DomainDef;
  now: { mean: number | null; people: PersonScore[] };
  child: { mean: number | null; people: PersonScore[] };
  onset: OnsetCounts;
  top: { id: string; mean: number }[]; // самые выраженные пункты, не ниже «Часто»
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null);

export function analyseDomain(
  people: { a: ObsAnswer; key: string; label: string }[],
  def: DomainDef,
): DomainResult {
  const items = domainItems(def);
  const scores = (ids: string[]) =>
    ids.length
      ? people.flatMap(({ a, key, label }) => {
          const v = itemsMean(a, ids);
          return v === null ? [] : [{ key, label, value: v }];
        })
      : [];
  const now = scores(items.now);
  const child = scores(items.child);
  const answers = people.map((p) => p.a);
  const top = [...items.now, ...items.child]
    .map((id) => {
      const s = answers.map((a) => itemScore(a, id)).filter((x): x is number => x !== null);
      return { id, mean: mean(s) };
    })
    .filter((x): x is { id: string; mean: number } => x.mean !== null && x.mean >= 3)
    .sort((x, y) => y.mean - x.mean)
    .slice(0, 5);
  return {
    def,
    now: { mean: mean(now.map((p) => p.value)), people: now },
    child: { mean: mean(child.map((p) => p.value)), people: child },
    onset: onsetCounts(answers, items.now),
    top,
  };
}
