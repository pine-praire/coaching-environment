// Расчёты дашборда Communication Debugger. Формулы — как в утверждённом прототипе.
import { QUESTION_COUNT, QUICK_IDS, SPLIT_SHARE, ZONES, type OpenId } from "./comm-survey";

export interface CommAnswer {
  key: string; // стабильный непрозрачный ключ ответа (хеш id документа)
  ratings: Record<string, number>;
  quick: string[];
  quickOther: string | null;
  open: Record<OpenId, string | null>;
}

export type Band = "hot" | "mid" | "low";

export const BAND_LABEL: Record<Band, string> = {
  hot: "Hot spot",
  mid: "Noticeable",
  low: "Low friction",
};

export const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

// Стандартное отклонение по генеральной совокупности, как в прототипе.
export const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
};

export const fmt = (x: number) => x.toFixed(1);

export function band(m: number): Band {
  return m >= 3.5 ? "hot" : m >= 2.5 ? "mid" : "low";
}

export function dist(vals: number[]): number[] {
  const d = [0, 0, 0, 0, 0];
  vals.forEach((v) => d[v - 1]++);
  return d;
}

export interface QuestionStat {
  n: number;
  vals: number[];
  mean: number;
  sd: number;
  dist: number[];
  N: number;
  low: number;
  high: number;
  split: boolean;
}

export interface ZoneStat {
  id: string;
  title: string;
  nums: number[];
  mean: number;
  sd: number;
}

export function isSplit(low: number, high: number, share = SPLIT_SHARE): boolean {
  return low >= share && high >= share;
}

export function questionStat(n: number, vals: number[]): QuestionStat {
  const d = dist(vals);
  const N = vals.length;
  const low = (d[0] + d[1]) / N;
  const high = (d[3] + d[4]) / N;
  return {
    n,
    vals,
    mean: mean(vals),
    sd: sd(vals),
    dist: d,
    N,
    low,
    high,
    split: isSplit(low, high),
  };
}

export function analyse(resp: CommAnswer[]) {
  const qs: Record<number, QuestionStat> = {};
  for (let n = 1; n <= QUESTION_COUNT; n++) {
    const vals = resp.map((r) => r.ratings[String(n)]).filter((v) => v);
    qs[n] = questionStat(n, vals);
  }
  // Среднее по зоне: сначала среднее каждого человека по вопросам зоны, потом по людям.
  const zones: ZoneStat[] = ZONES.map((z) => {
    const nums = z.questions.map((q) => q.n);
    const perPerson = resp.map((r) => mean(nums.map((n) => r.ratings[String(n)])));
    return { id: z.id, title: z.title, nums, mean: mean(perPerson), sd: sd(perPerson) };
  });
  const quick: Record<string, number> = {};
  QUICK_IDS.forEach((k) => (quick[k] = 0));
  resp.forEach((r) => r.quick.forEach((k) => (quick[k] = (quick[k] ?? 0) + 1)));
  const others = resp.map((r) => r.quickOther).filter((x): x is string => Boolean(x));
  return { qs, zones, quick, others };
}

// Вопросы, где команда расходится, самые резкие сверху.
export function splitQuestions(qs: Record<number, QuestionStat>): QuestionStat[] {
  return Object.values(qs)
    .filter((q) => q.split)
    .sort((a, b) => Math.min(b.low, b.high) - Math.min(a.low, a.high));
}

// Ключ звёздочки: ответ + вопрос.
export const starKey = (answerKey: string, openId: string) => `${answerKey}_${openId}`;
