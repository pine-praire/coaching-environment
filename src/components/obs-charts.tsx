// Графики дашборда опроса близких. Цвета — токены --obs-* в styles.css: один синий тон от светлого
// к тёмному для шкалы частоты, серый для «Не знаю». Текст всегда в цветах текста, не в цвете серии.
import type { ScaleValue } from "@/lib/obs-survey";
import { SCALE, SCALE_CHILD } from "@/lib/obs-survey";
import { fmtIndex } from "@/lib/obs-analysis";

const STEPS: ScaleValue[] = ["never", "rarely", "sometimes", "often", "almost_always"];

const scaleColor = (v: ScaleValue) =>
  v === "unknown" ? "var(--obs-unknown)" : `var(--obs-scale-${STEPS.indexOf(v)})`;

// Цвета графиков должны попадать в PDF при печати.
const exact = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as const;

const pct = (v: number) => `${(Math.min(4, Math.max(0, v)) / 4) * 100}%`;

export interface Dot {
  key: string;
  label: string;
  value: number;
}

// Шкала 0–4: заливка до среднего и точки по людям (если людей больше одного).
export function ScaleTrack({
  mean,
  dots = [],
  label,
}: {
  mean: number | null;
  dots?: Dot[];
  label: string;
}) {
  const aria =
    mean === null
      ? `${label}: нет данных`
      : `${label}: ${fmtIndex(mean)} из 4` +
        (dots.length > 1
          ? `; ${dots.map((d) => `${d.label} ${fmtIndex(d.value)}`).join(", ")}`
          : "");
  return (
    <div role="img" aria-label={aria} className="relative h-5 w-full" style={exact}>
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--obs-track)]" />
      {[1, 2, 3].map((t) => (
        <div
          key={t}
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-background/80"
          style={{ left: pct(t) }}
        />
      ))}
      {mean !== null && (
        <div
          className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--obs-fill)]"
          style={{ width: pct(mean) }}
          title={`Среднее: ${fmtIndex(mean)}`}
        />
      )}
      {dots.length > 1 &&
        dots.map((d) => (
          <div
            key={d.key}
            title={`${d.label}: ${fmtIndex(d.value)}`}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-default rounded-full border-2 border-card bg-[var(--obs-dot)] hover:scale-125"
            style={{ left: pct(d.value) }}
          />
        ))}
    </div>
  );
}

// Подписи шкалы под графиками: какой ответ соответствует 0, 1, 2, 3, 4.
export function ScaleAxis({ className = "" }: { className?: string }) {
  return (
    <div className={`relative h-4 text-[11px] text-muted-foreground ${className}`} aria-hidden>
      {SCALE.slice(0, 5).map(([v, l], i) => (
        <span
          key={v}
          // На узком экране только крайние подписи, иначе они налезают друг на друга.
          className={`absolute whitespace-nowrap ${i === 0 || i === 4 ? "" : "hidden sm:inline"}`}
          style={{
            left: pct(i),
            transform: i === 0 ? "none" : i === 4 ? "translateX(-100%)" : "translateX(-50%)",
          }}
        >
          {l}
        </span>
      ))}
    </div>
  );
}

// Доли ответов по пункту: сегменты от «Никогда» к «Почти всегда», «Не знаю» в конце серым.
export function DistributionBar({
  counts,
  child,
}: {
  counts: Record<ScaleValue, number>;
  child?: boolean;
}) {
  const labels = Object.fromEntries(child ? SCALE_CHILD : SCALE) as Record<string, string>;
  const order: ScaleValue[] = [...STEPS, "unknown"];
  const total = order.reduce((s, v) => s + counts[v], 0);
  if (!total) return <div className="text-xs text-muted-foreground">нет ответов</div>;
  const aria = order
    .filter((v) => counts[v])
    .map((v) => `${labels[v]}: ${counts[v]}`)
    .join(", ");
  return (
    <div role="img" aria-label={aria} className="flex h-4 w-full gap-[2px]" style={exact}>
      {order
        .filter((v) => counts[v])
        .map((v) => (
          <div
            key={v}
            title={`${labels[v]}: ${counts[v]} из ${total}`}
            className="h-full cursor-default first:rounded-l last:rounded-r hover:opacity-80"
            style={{ flexGrow: counts[v], flexBasis: 0, background: scaleColor(v) }}
          />
        ))}
    </div>
  );
}

export function ScaleLegend({ child }: { child?: boolean }) {
  const scale = child ? SCALE_CHILD : SCALE;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" style={exact}>
      {scale.map(([v, l]) => (
        <span key={v} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: scaleColor(v) }} />
          {l}
        </span>
      ))}
    </div>
  );
}

// Ответ одного человека: цветная метка шкалы и текст ответа.
export function AnswerMark({ v, label }: { v: ScaleValue | undefined; label: string | undefined }) {
  if (!v || !label) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-2" style={exact}>
      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: scaleColor(v) }} />
      {label}
    </span>
  );
}
