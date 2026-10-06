import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  fmtDate,
  fmtIndex,
  frequencyText,
  indexAverage,
  indicesFor,
  itemSummary,
  numbered,
  relationText,
  respondentLabel,
} from "@/lib/obs-analysis";
import { buildAllCsv, buildPersonCsv, buildSummaryCsv } from "@/lib/obs-csv";
import type { ObsResponse } from "@/lib/obs-schema";
import { PASSWORD_MIN } from "@/lib/obs-schema";
import {
  AGES,
  BLOCK_LETTER,
  BLOCKS,
  CHILD_GROUPS,
  INDEX_NOTE,
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
  type Item,
  type SubjectNames,
} from "@/lib/obs-survey";
import {
  deleteObsResponseFn,
  getObsSettingsFn,
  listObsResponsesFn,
  updateObsSettingsFn,
} from "@/functions/obs-admin.functions";

export const Route = createFileRoute("/admin_/blizkie")({
  head: () => ({
    meta: [{ title: "Опрос близких · админка" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ObsDashboardPage,
});

interface Settings {
  names: SubjectNames | null;
  open: boolean;
  hasPassword: boolean;
}

const NO_NAMES: SubjectNames = { nom: "…", acc: "…", dat: "…" };
const SCALE_LABEL = Object.fromEntries(SCALE) as Record<string, string>;
const SCALE_CHILD_LABEL = Object.fromEntries(SCALE_CHILD) as Record<string, string>;
const WHEN_LABEL = Object.fromEntries(WHEN) as Record<string, string>;
const PLACE_LABEL = Object.fromEntries(PLACES) as Record<string, string>;
const AGE_LABEL = Object.fromEntries(AGES) as Record<string, string>;

function download(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

function ObsDashboardPage() {
  const { user, loading, isAdmin, roleLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || (user && roleLoading)) return;
    if (!user) {
      navigate({ to: "/auth", search: { mode: "login" } });
      return;
    }
    if (!isAdmin) navigate({ to: "/dashboard" });
  }, [loading, roleLoading, user, isAdmin, navigate]);

  if (loading || roleLoading || !user || !isAdmin) return null;
  return <ObsDashboard />;
}

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section
      className="mb-6 rounded-2xl border bg-card"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <h2 className="font-semibold">{title}</h2>
        {aside}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function ObsDashboard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [responses, setResponses] = useState<ObsResponse[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([getObsSettingsFn(), listObsResponsesFn()]);
      setSettings(s);
      setResponses(r);
      setError(null);
    } catch {
      setError("Не удалось загрузить данные опроса.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const names = settings?.names ?? NO_NAMES;
  const list = useMemo(() => numbered(responses ?? []), [responses]);
  const person = list.find((x) => x.a.id === selected);

  const flash = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice((cur) => (cur === m ? null : cur)), 3000);
  };

  return (
    <div className="min-h-screen px-4 py-12" style={{ background: "var(--gradient-soft)" }}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold">Опрос близких</h1>
            <p className="text-sm text-muted-foreground">
              {settings?.names ? `О ком: ${settings.names.nom}` : "Имя человека не задано"}
            </p>
          </div>
          <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">
            ← Панель администратора
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="mb-6 rounded-xl border bg-accent p-4 text-sm print:hidden">
            {notice}
          </div>
        )}

        {person ? (
          <PersonView
            r={person.a}
            n={person.n}
            names={names}
            onBack={() => setSelected(null)}
            onDeleted={async () => {
              setSelected(null);
              await load();
              flash("Ответ удалён.");
            }}
            onError={setError}
          />
        ) : (
          <>
            {settings && <SettingsSection settings={settings} onSaved={load} flash={flash} />}
            {responses && (
              <>
                <ResponsesSection list={list} names={names} onOpen={setSelected} />
                {responses.length > 0 && (
                  <>
                    <IndicesSection list={list} />
                    <ItemsSection responses={responses} />
                    <OpenSection list={list} names={names} />
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- настройки ----------

function SettingsSection(props: {
  settings: Settings;
  onSaved: () => Promise<void>;
  flash: (m: string) => void;
}) {
  const { settings, onSaved, flash } = props;
  const [names, setNames] = useState<SubjectNames>(settings.names ?? { nom: "", acc: "", dat: "" });
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = !!settings.names && settings.hasPassword;

  const save = async (
    patch: { names?: SubjectNames; password?: string; open?: boolean },
    done: string,
  ) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await updateObsSettingsFn({ data: patch });
      if (!res.ok) {
        setErr(
          res.error === "invalid_password"
            ? `Пароль должен быть не короче ${PASSWORD_MIN} символов.`
            : res.error === "invalid_names"
              ? "Заполните все три формы имени."
              : "Не удалось сохранить.",
        );
        return;
      }
      await onSaved();
      flash(done);
      if (patch.password) setPassword("");
    } catch {
      setErr("Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  };

  const link = typeof window !== "undefined" ? `${window.location.origin}/blizkie` : "/blizkie";
  const copyLink = () => {
    try {
      navigator.clipboard.writeText(link).then(
        () => flash("Ссылка скопирована."),
        () => flash(link),
      );
    } catch {
      flash(link);
    }
  };

  return (
    <Section
      title="Настройки"
      aside={
        <div className="flex items-center gap-3">
          <Label htmlFor="obs-open" className="text-sm">
            {settings.open ? "Опрос открыт" : "Опрос закрыт"}
          </Label>
          <Switch
            id="obs-open"
            checked={settings.open}
            disabled={busy || (!ready && !settings.open)}
            onCheckedChange={(v) =>
              save(
                { open: v },
                v
                  ? "Опрос открыт: пароль снова пускает."
                  : "Опрос закрыт: пароль больше не пускает.",
              )
            }
          />
        </div>
      }
    >
      {!ready && (
        <p className="mb-4 text-sm text-muted-foreground">
          Чтобы открыть опрос, задайте имя человека и пароль.
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save({ names }, "Имя сохранено.");
          }}
        >
          <p className="text-sm font-medium">Имя человека, о котором опрос</p>
          {(
            [
              ["nom", "Кто? (Вера)"],
              ["acc", "Кого? (Веру)"],
              ["dat", "Кому? (Вере)"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`name-${k}`} className="text-xs text-muted-foreground">
                {label}
              </Label>
              <Input
                id={`name-${k}`}
                value={names[k]}
                maxLength={60}
                onChange={(e) => setNames((p) => ({ ...p, [k]: e.target.value }))}
              />
            </div>
          ))}
          <Button type="submit" size="sm" disabled={busy}>
            Сохранить имя
          </Button>
        </form>

        <div className="space-y-5">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save({ password }, "Пароль сохранён. Старый больше не работает.");
            }}
          >
            <p className="text-sm font-medium">
              Пароль{" "}
              {settings.hasPassword ? (
                <span className="text-muted-foreground">(задан)</span>
              ) : (
                "(не задан)"
              )}
            </p>
            <Input
              id="obs-password"
              aria-label="Новый пароль"
              autoComplete="off"
              placeholder="Новый пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Не короче {PASSWORD_MIN} символов. Посмотреть пароль потом нельзя, сохраните его у
              себя.
            </p>
            <Button type="submit" size="sm" disabled={busy || !password}>
              {settings.hasPassword ? "Сменить пароль" : "Задать пароль"}
            </Button>
          </form>

          <div className="space-y-2">
            <p className="text-sm font-medium">Ссылка для участников</p>
            <div className="flex gap-2">
              <Input readOnly value={link} aria-label="Ссылка на опрос" />
              <Button type="button" size="sm" variant="outline" onClick={copyLink}>
                Копировать
              </Button>
            </div>
          </div>
        </div>
      </div>
      {err && <p className="mt-4 text-sm text-destructive">{err}</p>}
    </Section>
  );
}

// ---------- список ответов ----------

type Numbered = { a: ObsResponse; n: number };

function ResponsesSection({
  list,
  names,
  onOpen,
}: {
  list: Numbered[];
  names: SubjectNames;
  onOpen: (id: string) => void;
}) {
  const answers = list.map((x) => x.a);
  return (
    <Section
      title={`Ответы (${list.length})`}
      aside={
        list.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => download(`blizkie-otvety-${today()}.csv`, buildAllCsv(answers, names))}
            >
              Скачать все ответы (CSV)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => download(`blizkie-svodka-${today()}.csv`, buildSummaryCsv(answers))}
            >
              Скачать сводку (CSV)
            </Button>
          </div>
        )
      }
    >
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ответов пока нет.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Респондент</th>
                <th className="py-2 pr-4 font-medium">Кем приходится</th>
                <th className="py-2 pr-4 font-medium">Знакомы, лет</th>
                <th className="py-2 pr-4 font-medium">Знал(а) в детстве</th>
                <th className="py-2 pr-4 font-medium">Дата</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map(({ a, n }) => (
                <tr key={a.id} className="border-t">
                  <td className="py-2 pr-4 font-medium">{respondentLabel(a, n)}</td>
                  <td className="py-2 pr-4">{relationText(a)}</td>
                  <td className="py-2 pr-4">{a.about.years}</td>
                  <td className="py-2 pr-4">{a.about.knewAsChild === "yes" ? "Да" : "Нет"}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(a.submittedAt)}</td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => onOpen(a.id)}>
                      Открыть
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ---------- сводка ----------

function IndicesSection({ list }: { list: Numbered[] }) {
  const answers = list.map((x) => x.a);
  const perPerson = list.map(({ a }) => indicesFor(a));
  return (
    <Section title="Индексы">
      <p className="mb-4 text-xs text-muted-foreground">{INDEX_NOTE}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 font-medium">Индекс</th>
              <th className="py-2 pr-4 font-medium">Среднее</th>
              {list.map(({ a, n }) => (
                <th key={a.id} className="py-2 pr-4 font-medium whitespace-nowrap">
                  {respondentLabel(a, n)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INDICES.map((def, k) => {
              const avg = indexAverage(answers, def);
              return (
                <tr key={def.id} className="border-t">
                  <td className="py-2 pr-4">{def.title}</td>
                  <td className="py-2 pr-4 font-semibold tabular-nums">
                    {fmtIndex(avg.mean)}
                    {avg.n > 0 && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        n={avg.n}
                      </span>
                    )}
                  </td>
                  {perPerson.map((vals, i) => (
                    <td key={list[i].a.id} className="py-2 pr-4 tabular-nums">
                      {fmtIndex(vals[k].mean)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function ItemTable({
  responses,
  items,
  child,
}: {
  responses: ObsResponse[];
  items: Item[];
  child?: boolean;
}) {
  const scale = child ? SCALE_CHILD : SCALE;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-2 pr-4 font-medium">Пункт</th>
            {scale.map(([v, l]) => (
              <th key={v} className="py-2 pr-2 text-center font-medium">
                {l}
              </th>
            ))}
            <th className="py-2 pr-2 text-center font-medium">Среднее</th>
            {!child && <th className="py-2 text-center font-medium">Появилось в последние годы</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const s = itemSummary(responses, i.id);
            return (
              <tr key={i.id} className="border-t align-top">
                <td className="py-2 pr-4">
                  <span className="mr-1 text-muted-foreground">{itemLabel(i.id)}.</span>
                  {i.text}
                </td>
                {scale.map(([v]) => (
                  <td
                    key={v}
                    className={`py-2 pr-2 text-center tabular-nums ${s.counts[v] ? "" : "text-muted-foreground/40"}`}
                  >
                    {s.counts[v]}
                  </td>
                ))}
                <td className="py-2 pr-2 text-center font-semibold tabular-nums">
                  {fmtIndex(s.mean)}
                </td>
                {!child && (
                  <td
                    className={`py-2 text-center tabular-nums ${s.when.recent ? "font-semibold" : "text-muted-foreground/40"}`}
                  >
                    {s.when.recent}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ItemsSection({ responses }: { responses: ObsResponse[] }) {
  const withChild = responses.filter((r) => r.child);
  return (
    <Section title="Ответы по пунктам">
      <p className="mb-4 text-xs text-muted-foreground">
        Число людей, выбравших каждый вариант. Среднее по исходной шкале 0–4 без «Не знаю».
      </p>
      {BLOCKS.map((b) => (
        <div key={b.id} className="mb-6">
          <h3 className="mb-2 text-sm font-semibold">
            Блок {BLOCK_LETTER[b.id]}. {b.title}
          </h3>
          <ItemTable responses={responses} items={b.items} />
        </div>
      ))}
      <h3 className="mb-2 text-sm font-semibold">Блок Ж. Детство (ответили: {withChild.length})</h3>
      {withChild.length === 0 ? (
        <p className="text-sm text-muted-foreground">Никто не отметил, что знал её в детстве.</p>
      ) : (
        <ItemTable responses={withChild} items={CHILD_GROUPS.flatMap((g) => g.items)} child />
      )}
    </Section>
  );
}

function OpenSection({ list, names }: { list: Numbered[]; names: SubjectNames }) {
  const t = (s: string) => fillName(s, names);
  const groups: {
    id: string;
    title: string;
    get: (a: ObsResponse) => string | null | undefined;
  }[] = [
    { id: "w3", title: t("7. Опишите {A} тремя словами."), get: (a) => a.start.threeWords },
    { id: "valued", title: "8. За что её ценят окружающие?", get: (a) => a.start.valued },
    ...[...OPEN_CHANGES, ...OPEN_FINAL].map((i) => ({
      id: i.id,
      title: `${itemLabel(i.id)}. ${t(i.text)}`,
      get: (a: ObsResponse) => a.open[i.id],
    })),
    ...OPEN_CHILD.map((i) => ({
      id: i.id,
      title: `${itemLabel(i.id)}. ${i.text}`,
      get: (a: ObsResponse) => a.child?.open[i.id],
    })),
  ];
  return (
    <Section title="Открытые ответы">
      {groups.map((g) => {
        const rows = list.filter(({ a }) => g.get(a));
        return (
          <div key={g.id} className="mb-5">
            <h3 className="mb-2 text-sm font-semibold">{g.title}</h3>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет ответов.</p>
            ) : (
              <ul className="space-y-2">
                {rows.map(({ a, n }) => (
                  <li key={a.id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <p className="whitespace-pre-wrap">{g.get(a)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {respondentLabel(a, n)} · {relationText(a)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </Section>
  );
}

// ---------- карточка человека ----------

function Answer({ label, value, extra }: { label: string; value: ReactNode; extra?: string }) {
  return (
    <div className="grid gap-1 border-t py-2 text-sm sm:grid-cols-[1fr_auto] sm:gap-4 break-inside-avoid">
      <div>{label}</div>
      <div className="font-medium sm:text-right">
        {value || <span className="text-muted-foreground">—</span>}
        {extra && <div className="text-xs font-normal text-muted-foreground">{extra}</div>}
      </div>
    </div>
  );
}

function PersonView(props: {
  r: ObsResponse;
  n: number;
  names: SubjectNames;
  onBack: () => void;
  onDeleted: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const { r, n, names } = props;
  const t = (s: string) => fillName(s, names);
  const label = respondentLabel(r, n);
  const vals = indicesFor(r);

  const remove = async () => {
    try {
      const res = await deleteObsResponseFn({ data: { id: r.id } });
      if (!res.ok) return props.onError("Ответ не найден: возможно, он уже удалён.");
      await props.onDeleted();
    } catch {
      props.onError("Не удалось удалить ответ.");
    }
  };

  const open = (i: Item, text: string | null | undefined) => (
    <div key={i.id} className="border-t py-3 text-sm break-inside-avoid">
      <p className="mb-1 text-muted-foreground">
        {itemLabel(i.id)}. {t(i.text)}
      </p>
      <p className="whitespace-pre-wrap">{text || "—"}</p>
    </div>
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={props.onBack}>
          ← Все ответы
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            download(`blizkie-${n}-${r.submittedAt.slice(0, 10)}.csv`, buildPersonCsv(r, n, names))
          }
        >
          Скачать CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          Печать / PDF
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-destructive">
              Удалить
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить ответ «{label}»?</AlertDialogTitle>
              <AlertDialogDescription>
                Ответ удалится из базы навсегда, восстановить его будет нельзя.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>Удалить</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="rounded-2xl border bg-card px-6 py-6 print:border-0 print:px-0 print:shadow-none">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("Опрос близких: {N}")}
        </p>
        <h2 className="mb-1 text-xl font-bold">{label}</h2>
        <p className="mb-6 text-sm text-muted-foreground">{fmtDate(r.submittedAt)}</p>

        <h3 className="mb-1 font-semibold">О респонденте</h3>
        <div className="mb-6">
          <Answer label={t("Кем приходится {D}")} value={relationText(r)} />
          <Answer label="Знакомы, лет" value={r.about.years} />
          <Answer label="Как часто общаются" value={frequencyText(r)} />
          <Answer
            label="Где видятся"
            value={r.about.places.map((p) => PLACE_LABEL[p]).join(", ")}
          />
          <Answer
            label="Знал(а) в детстве"
            value={r.child ? `Да: ${r.child.ages.map((x) => AGE_LABEL[x]).join(", ")}` : "Нет"}
          />
          <Answer label={t("Опишите {A} тремя словами")} value={r.start.threeWords} />
          <Answer label="За что её ценят окружающие" value={r.start.valued} />
        </div>

        <h3 className="mb-1 font-semibold">Индексы</h3>
        <p className="mb-2 text-xs text-muted-foreground">{INDEX_NOTE}</p>
        <div className="mb-6">
          {INDICES.map((def, k) =>
            def.child && !r.child ? null : (
              <Answer
                key={def.id}
                label={def.title}
                value={fmtIndex(vals[k].mean)}
                extra={`учтено ${vals[k].answered} из ${vals[k].total}`}
              />
            ),
          )}
        </div>

        {BLOCKS.map((b) => (
          <div key={b.id} className="mb-6">
            <h3 className="mb-1 font-semibold">
              Блок {BLOCK_LETTER[b.id]}. {b.title}
            </h3>
            {b.items.map((i) => {
              const s = r.scale[i.id];
              return (
                <Answer
                  key={i.id}
                  label={`${itemLabel(i.id)}. ${i.text}`}
                  value={SCALE_LABEL[s?.v]}
                  extra={s?.when ? WHEN_LABEL[s.when] : undefined}
                />
              );
            })}
          </div>
        ))}

        <div className="mb-6">
          <h3 className="mb-1 font-semibold">Блоки Д и Е. Своими словами</h3>
          {[...OPEN_CHANGES, ...OPEN_FINAL].map((i) => open(i, r.open[i.id]))}
        </div>

        {r.child && (
          <div className="mb-2">
            <h3 className="mb-1 font-semibold">Блок Ж. Детство</h3>
            {CHILD_GROUPS.map((g) => (
              <div key={g.title} className="mb-3">
                <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                  {g.title}
                </p>
                {g.items.map((i) => (
                  <Answer
                    key={i.id}
                    label={`${itemLabel(i.id)}. ${i.text}`}
                    value={SCALE_CHILD_LABEL[r.child!.scale[i.id]?.v]}
                  />
                ))}
              </div>
            ))}
            {OPEN_CHILD.map((i) => open(i, r.child!.open[i.id]))}
          </div>
        )}
      </div>
    </>
  );
}
