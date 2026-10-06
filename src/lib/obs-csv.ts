// CSV для опроса близких. BOM добавляется при скачивании.
import {
  fmtIndex,
  frequencyText,
  indicesFor,
  itemSummary,
  numbered,
  relationText,
  respondentLabel,
} from "./obs-analysis";
import type { ObsAnswer } from "./obs-schema";
import {
  ADULT_ITEMS,
  AGES,
  BLOCKS,
  CHILD_GROUPS,
  CHILD_ITEMS,
  INDICES,
  OPEN_CHANGES,
  OPEN_CHILD,
  OPEN_FINAL,
  PLACES,
  SCALE,
  SCALE_CHILD,
  WHEN,
  fillName,
  itemLabel,
  type SubjectNames,
} from "./obs-survey";

type Cell = string | number | null | undefined;

// Ячейки, начинающиеся с = + - @, Excel считает формулой: свободный текст участника экранируем.
function cell(v: Cell): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(cell).join(",")).join("\n");

const SCALE_LABEL = Object.fromEntries(SCALE) as Record<string, string>;
const SCALE_CHILD_LABEL = Object.fromEntries(SCALE_CHILD) as Record<string, string>;
const WHEN_LABEL = Object.fromEntries(WHEN) as Record<string, string>;
const PLACE_LABEL = Object.fromEntries(PLACES) as Record<string, string>;
const AGE_LABEL = Object.fromEntries(AGES) as Record<string, string>;

const placesText = (a: ObsAnswer) => a.about.places.map((p) => PLACE_LABEL[p] ?? p).join("; ");
const agesText = (a: ObsAnswer) => a.child?.ages.map((x) => AGE_LABEL[x] ?? x).join("; ") ?? "";
const knewText = (a: ObsAnswer) => (a.about.knewAsChild === "yes" ? "Да" : "Нет");
const dateText = (a: ObsAnswer) => a.submittedAt.slice(0, 10);
const indexText = (m: number | null) => fmtIndex(m).replace("—", "");

const OPEN_ITEMS = [...OPEN_CHANGES, ...OPEN_FINAL];

// Все ответы: одна строка на человека.
export function buildAllCsv(answers: ObsAnswer[], names: SubjectNames): string {
  const head: Cell[] = [
    "Респондент",
    "Дата",
    "Кем приходится",
    "Лет знакомы",
    "Как часто общаются",
    "Где видятся",
    "Знал(а) в детстве",
    "Тремя словами",
    "За что ценят",
    ...ADULT_ITEMS.flatMap((i) => [itemLabel(i.id), `${itemLabel(i.id)} с какого времени`]),
    ...OPEN_ITEMS.map((i) => itemLabel(i.id)),
    "Возраст в детстве",
    ...CHILD_ITEMS.map((i) => itemLabel(i.id)),
    ...OPEN_CHILD.map((i) => itemLabel(i.id)),
    ...INDICES.map((d) => `Индекс: ${d.title}`),
  ];
  const rows = numbered(answers).map(({ a, n }) => [
    respondentLabel(a, n),
    dateText(a),
    relationText(a),
    a.about.years,
    frequencyText(a),
    placesText(a),
    knewText(a),
    a.start.threeWords,
    a.start.valued,
    ...ADULT_ITEMS.flatMap((i) => {
      const s = a.scale[i.id];
      return [SCALE_LABEL[s?.v] ?? "", s?.when ? WHEN_LABEL[s.when] : ""];
    }),
    ...OPEN_ITEMS.map((i) => a.open[i.id]),
    agesText(a),
    ...CHILD_ITEMS.map((i) => {
      const v = a.child?.scale[i.id]?.v;
      return v ? SCALE_CHILD_LABEL[v] : "";
    }),
    ...OPEN_CHILD.map((i) => a.child?.open[i.id]),
    ...indicesFor(a).map((x) => indexText(x.mean)),
  ]);
  const legend = [[""], ["Тексты вопросов"], ...questionLegend(names)];
  return toCsv([head, ...rows, ...legend]);
}

function questionLegend(names: SubjectNames): Cell[][] {
  return [...ADULT_ITEMS, ...OPEN_ITEMS, ...CHILD_ITEMS, ...OPEN_CHILD].map((i) => [
    itemLabel(i.id),
    fillName(i.text, names),
  ]);
}

// Сводка: одна строка на пункт шкалы.
export function buildSummaryCsv(answers: ObsAnswer[]): string {
  const head: Cell[] = [
    "Пункт",
    "Текст",
    "Ответили",
    ...SCALE.map(([, l]) => l + (l === "Не знаю" ? " / Не помню" : "")),
    "Среднее 0–4",
    ...WHEN.map(([, l]) => `С какого времени: ${l}`),
  ];
  const rows = [...ADULT_ITEMS, ...CHILD_ITEMS].map((i) => {
    const s = itemSummary(answers, i.id);
    const child = i.id.startsWith("Z");
    return [
      itemLabel(i.id),
      i.text,
      s.answered,
      ...SCALE.map(([v]) => s.counts[v]),
      indexText(s.mean),
      ...WHEN.map(([v]) => (child ? "" : s.when[v])),
    ];
  });
  return toCsv([head, ...rows]);
}

// Ответы одного человека: вопрос — ответ.
export function buildPersonCsv(a: ObsAnswer, n: number, names: SubjectNames): string {
  const t = (s: string) => fillName(s, names);
  const rows: Cell[][] = [
    ["Вопрос", "Ответ", "С какого времени"],
    ["Респондент", respondentLabel(a, n)],
    ["Дата", dateText(a)],
    [t("Кем вы приходитесь {D}?"), relationText(a)],
    [t("Сколько лет вы знаете {A}?"), a.about.years],
    ["Как часто вы общаетесь сейчас?", frequencyText(a)],
    ["Где вы её чаще всего видите?", placesText(a)],
    [t("Вы знали {A} в детстве или подростком?"), knewText(a)],
    [t("Опишите {A} тремя словами."), a.start.threeWords],
    ["За что её ценят окружающие?", a.start.valued],
  ];
  for (const b of BLOCKS) {
    rows.push([`Блок ${itemLabel(b.id)}. ${b.title}`]);
    for (const i of b.items) {
      const s = a.scale[i.id];
      rows.push([
        `${itemLabel(i.id)}. ${i.text}`,
        SCALE_LABEL[s?.v] ?? "",
        s?.when ? WHEN_LABEL[s.when] : "",
      ]);
    }
  }
  for (const i of OPEN_ITEMS) rows.push([`${itemLabel(i.id)}. ${t(i.text)}`, a.open[i.id]]);
  if (a.child) {
    rows.push(["Блок Ж. Детство"], ["В каком возрасте вы её знали?", agesText(a)]);
    for (const g of CHILD_GROUPS)
      for (const i of g.items)
        rows.push([
          `${itemLabel(i.id)}. ${i.text}`,
          SCALE_CHILD_LABEL[a.child.scale[i.id]?.v] ?? "",
        ]);
    for (const i of OPEN_CHILD) rows.push([`${itemLabel(i.id)}. ${i.text}`, a.child.open[i.id]]);
  }
  rows.push(["Индексы"]);
  indicesFor(a).forEach((x, k) =>
    rows.push([
      INDICES[k].title,
      indexText(x.mean),
      x.total ? `учтено ${x.answered} из ${x.total}` : "",
    ]),
  );
  return toCsv(rows);
}
