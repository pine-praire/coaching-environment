import type { CommAnswer } from "./comm-analysis";
import { OPEN, QUESTION_COUNT, QUICK_LABEL } from "./comm-survey";

export function shuffle<T>(arr: T[], random: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// CSV как в прототипе: строки перемешаны, без id и дат. BOM добавляется при скачивании.
export function buildCsv(answers: CommAnswer[], random: () => number = Math.random): string {
  const head = [
    "response",
    ...Array.from({ length: QUESTION_COUNT }, (_, i) => "q" + (i + 1)),
    "quick_pick",
    "quick_other",
    ...OPEN.map((o) => "q" + o.n + "_" + o.id),
  ];
  const rows = shuffle(answers, random).map((r, i) => [
    i + 1,
    ...Array.from({ length: QUESTION_COUNT }, (_, k) => r.ratings[String(k + 1)]),
    r.quick.map((k) => QUICK_LABEL[k]).join("; "),
    r.quickOther || "",
    ...OPEN.map((o) => r.open[o.id] || ""),
  ]);
  return [head, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}
