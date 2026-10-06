// Экран «Анализ» дашборда опроса близких: один ответ или все ответы опроса.
// Описательная картина по направлениям для специалиста. Порогов и диагнозов нет: анкета не валидирована.
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ScaleAxis, ScaleTrack } from "@/components/obs-charts";
import {
  BACKGROUND_INDICES,
  DOMAINS,
  analyseDomain,
  fmtIndex,
  indexValue,
  levelLabel,
  type DomainResult,
} from "@/lib/obs-analysis";
import type { ObsAnswer } from "@/lib/obs-schema";
import {
  ADULT_ITEMS,
  CHILD_ITEMS,
  INDICES,
  WHEN,
  fillName,
  itemLabel,
  type SubjectNames,
} from "@/lib/obs-survey";

export interface AnalysedPerson {
  a: ObsAnswer;
  key: string;
  label: string;
}

const ITEM_TEXT = Object.fromEntries([...ADULT_ITEMS, ...CHILD_ITEMS].map((i) => [i.id, i.text]));
const WHEN_LABEL = Object.fromEntries(WHEN) as Record<string, string>;

function Row({ label, children, value }: { label: string; children: ReactNode; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_3rem] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[6.5rem_1fr_3rem]">
      <span className="col-span-2 text-muted-foreground sm:col-span-1">{label}</span>
      {children}
      <span className="text-right font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function range(people: { value: number }[]) {
  const v = people.map((p) => p.value);
  return `${fmtIndex(Math.min(...v))}–${fmtIndex(Math.max(...v))}`;
}

function DomainCard({ r, names, many }: { r: DomainResult; names: SubjectNames; many: boolean }) {
  const t = (s: string) => fillName(s, names);
  const onsetTotal = Object.values(r.onset).reduce((x, y) => x + y, 0);
  const onset = (["always", "recent", "episodes", "unknown"] as const)
    .filter((k) => r.onset[k])
    .map((k) => `${WHEN_LABEL[k]}: ${r.onset[k]}`);
  if (r.onset.none) onset.push(`не указано: ${r.onset.none}`);

  return (
    <section
      className="mb-5 break-inside-avoid rounded-2xl border bg-card px-6 py-5 print:border print:shadow-none"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{r.def.title}</h3>
        {r.now.mean !== null && (
          <span className="text-sm text-muted-foreground">
            сейчас в среднем ближе к «{levelLabel(r.now.mean)}»
          </span>
        )}
      </div>

      <div className="space-y-3">
        <Row label="Сейчас" value={fmtIndex(r.now.mean)}>
          <ScaleTrack mean={r.now.mean} dots={r.now.people} label={`${r.def.title}, сейчас`} />
        </Row>
        {r.def.child.length > 0 && (
          <Row label="В детстве" value={fmtIndex(r.child.mean)}>
            {r.child.people.length ? (
              <ScaleTrack
                mean={r.child.mean}
                dots={r.child.people}
                label={`${r.def.title}, в детстве`}
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {t(
                  many
                    ? "никто не отметил, что знал [её|его] в детстве"
                    : "человек не знал [её|его] в детстве",
                )}
              </span>
            )}
          </Row>
        )}
        <ScaleAxis className="mr-[3.75rem] sm:ml-[7.25rem]" />
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        {onsetTotal > 0 && (
          <div>
            <dt className="inline text-muted-foreground">Частые признаки, с какого времени: </dt>
            <dd className="inline">{onset.join(" · ")}</dd>
          </div>
        )}
        {many && r.now.people.length > 1 && (
          <div>
            <dt className="inline text-muted-foreground">Разброс между людьми: </dt>
            <dd className="inline tabular-nums">
              сейчас {range(r.now.people)}
              {r.child.people.length > 1 && `, в детстве ${range(r.child.people)}`}
            </dd>
          </div>
        )}
        {r.top.length > 0 && (
          <div>
            <dt className="text-muted-foreground">Самые выраженные признаки:</dt>
            <dd>
              <ul className="mt-1 space-y-1">
                {r.top.map((x) => (
                  <li key={x.id} className="flex justify-between gap-4">
                    <span>
                      <span className="mr-1 text-muted-foreground">{itemLabel(x.id)}.</span>
                      {t(ITEM_TEXT[x.id])}
                    </span>
                    <span className="shrink-0 tabular-nums">{fmtIndex(x.mean)}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">{t(r.def.note)}</p>
    </section>
  );
}

function BackgroundCard({ people }: { people: AnalysedPerson[] }) {
  return (
    <section
      className="mb-5 break-inside-avoid rounded-2xl border bg-card px-6 py-5 print:shadow-none"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <h3 className="mb-1 text-lg font-semibold">Фон</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Учитывать, чтобы не принять одно за другое: подъём и раздражительность, тревога и истощение,
        настроение в детстве.
      </p>
      <div className="space-y-3">
        {BACKGROUND_INDICES.map((id) => {
          const def = INDICES.find((d) => d.id === id)!;
          const dots = people.flatMap(({ a, key, label }) => {
            const v = indexValue(a, def).mean;
            return v === null ? [] : [{ key, label, value: v }];
          });
          const mean = dots.length ? dots.reduce((s, d) => s + d.value, 0) / dots.length : null;
          return (
            <div key={id} className="space-y-1">
              <div className="text-sm">{def.title}</div>
              <div className="grid grid-cols-[1fr_3rem] items-center gap-3">
                <ScaleTrack mean={mean} dots={dots} label={def.title} />
                <span className="text-right text-sm font-semibold tabular-nums">
                  {fmtIndex(mean)}
                </span>
              </div>
            </div>
          );
        })}
        <ScaleAxis className="mr-[3.75rem]" />
      </div>
    </section>
  );
}

export function AnalysisView(props: {
  people: AnalysedPerson[];
  names: SubjectNames;
  title: string;
  onBack: () => void;
}) {
  const { people, names } = props;
  const many = people.length > 1;
  const results = DOMAINS.map((d) => analyseDomain(people, d));
  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={props.onBack}>
          ← Назад
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          Печать / PDF
        </Button>
      </div>

      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {fillName("Опрос близких: {N}", names)}
      </p>
      <h2 className="mb-1 text-xl font-bold">Анализ: {props.title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {many ? `Ответов: ${people.length}. Точки на шкалах — отдельные люди.` : "Один ответ."}
      </p>
      <div className="mb-6 rounded-xl border bg-muted/40 p-4 text-sm">
        Предварительная описательная картина по наблюдениям близких, а не диагноз. Анкета не
        валидирована, порогов нет: шкала показывает, как часто близкие замечают признаки (0 —
        никогда, 4 — почти всегда, пункты с обратной шкалой перевёрнуты, «Не знаю» не учитывается).
        Выводы делает специалист.
      </div>

      {results.map((r) => (
        <DomainCard key={r.def.id} r={r} names={names} many={many} />
      ))}
      <BackgroundCard people={people} />
    </>
  );
}
