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
  createObsSurveyFn,
  deleteObsResponseFn,
  deleteObsSurveyFn,
  listObsResponsesFn,
  listObsSurveysFn,
  updateObsSurveyFn,
} from "@/functions/obs-admin.functions";

export const Route = createFileRoute("/admin_/blizkie")({
  head: () => ({
    meta: [{ title: "Опрос близких · админка" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ObsDashboardPage,
});

interface Survey {
  id: string;
  subject: SubjectNames;
  password: string | null;
  hasPassword: boolean;
  open: boolean;
  count: number;
}

const EMPTY_SUBJECT: SubjectNames = { nom: "", acc: "", dat: "", gender: "f" };
const SCALE_LABEL = Object.fromEntries(SCALE) as Record<string, string>;
const SCALE_CHILD_LABEL = Object.fromEntries(SCALE_CHILD) as Record<string, string>;
const WHEN_LABEL = Object.fromEntries(WHEN) as Record<string, string>;
const PLACE_LABEL = Object.fromEntries(PLACES) as Record<string, string>;
const AGE_LABEL = Object.fromEntries(AGES) as Record<string, string>;

const SURVEY_ERROR: Record<string, string> = {
  invalid_subject: "Заполните все три формы имени.",
  invalid_password: `Пароль должен быть не короче ${PASSWORD_MIN} символов.`,
  password_taken: "Такой пароль уже у другого опроса: по паролю участник попадает в свой опрос.",
  not_found: "Этот опрос уже удалён.",
};

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
const surveyLink = () =>
  typeof window !== "undefined" ? `${window.location.origin}/blizkie` : "/blizkie";

// Латиница для имени файла: «Мария» → «mariya».
const TRANSLIT: Record<string, string> = Object.fromEntries(
  "а:a б:b в:v г:g д:d е:e ё:e ж:zh з:z и:i й:y к:k л:l м:m н:n о:o п:p р:r с:s т:t у:u ф:f х:h ц:ts ч:ch ш:sh щ:sch ъ: ы:y ь: э:e ю:yu я:ya"
    .split(" ")
    .map((p) => p.split(":")),
);
const fileSlug = (s: SubjectNames) =>
  [...s.nom.toLowerCase()]
    .map((c) => TRANSLIT[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-") || "opros";

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

function copyText(text: string, flash: (m: string) => void, done: string) {
  // Если буфер обмена недоступен, показываем текст, чтобы его можно было переписать.
  try {
    navigator.clipboard.writeText(text).then(
      () => flash(done),
      () => flash(text),
    );
  } catch {
    flash(text);
  }
}

function ObsDashboard() {
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [responses, setResponses] = useState<ObsResponse[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSurveys = useCallback(async (select?: string) => {
    try {
      const list = await listObsSurveysFn();
      setSurveys(list);
      setSurveyId(
        (cur) => select ?? (cur && list.some((s) => s.id === cur) ? cur : (list[0]?.id ?? null)),
      );
      setError(null);
    } catch {
      setError("Не удалось загрузить опросы.");
    }
  }, []);

  const loadResponses = useCallback(async (id: string) => {
    setResponses(null);
    try {
      setResponses(await listObsResponsesFn({ data: { surveyId: id } }));
    } catch {
      setError("Не удалось загрузить ответы.");
    }
  }, []);

  useEffect(() => {
    loadSurveys();
  }, [loadSurveys]);

  useEffect(() => {
    setSelected(null);
    if (surveyId) loadResponses(surveyId);
    else setResponses([]);
  }, [surveyId, loadResponses]);

  const survey = surveys?.find((s) => s.id === surveyId) ?? null;
  const list = useMemo(() => numbered(responses ?? []), [responses]);
  const person = list.find((x) => x.a.id === selected);

  const flash = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice((cur) => (cur === m ? null : cur)), 3000);
  };

  const reloadAll = async () => {
    await loadSurveys();
    if (surveyId) await loadResponses(surveyId);
  };

  return (
    <div className="min-h-screen px-4 py-12" style={{ background: "var(--gradient-soft)" }}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold">Опрос близких</h1>
            <p className="text-sm text-muted-foreground">
              {survey ? `О ком: ${survey.subject.nom}` : "Опрос не выбран"}
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

        {person && survey ? (
          <PersonView
            r={person.a}
            n={person.n}
            names={survey.subject}
            onBack={() => setSelected(null)}
            onDeleted={async () => {
              setSelected(null);
              await reloadAll();
              flash("Ответ удалён.");
            }}
            onError={setError}
          />
        ) : (
          <>
            {surveys && (
              <SurveyList
                surveys={surveys}
                selectedId={surveyId}
                onSelect={(id) => {
                  setCreating(false);
                  setSurveyId(id);
                }}
                onNew={() => setCreating((v) => !v)}
                flash={flash}
              />
            )}
            {creating && (
              <NewSurveySection
                onCancel={() => setCreating(false)}
                onCreated={async (id) => {
                  setCreating(false);
                  await loadSurveys(id);
                  flash("Опрос создан и открыт. Скопируйте ссылку и пароль для участников.");
                }}
              />
            )}
            {survey && (
              <SurveySettings
                key={survey.id}
                survey={survey}
                onSaved={() => loadSurveys()}
                onDeleted={async (name) => {
                  await loadSurveys();
                  flash(`Опрос о человеке «${name}» удалён вместе с ответами.`);
                }}
                flash={flash}
              />
            )}
            {survey && responses && (
              <>
                <ResponsesSection list={list} names={survey.subject} onOpen={setSelected} />
                {responses.length > 0 && (
                  <>
                    <IndicesSection list={list} />
                    <ItemsSection responses={responses} names={survey.subject} />
                    <OpenSection list={list} names={survey.subject} />
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

// ---------- опросы ----------

function SurveyList(props: {
  surveys: Survey[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  flash: (m: string) => void;
}) {
  return (
    <Section
      title="Опросы"
      aside={
        <Button size="sm" onClick={props.onNew}>
          Новый опрос
        </Button>
      }
    >
      {props.surveys.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Опросов пока нет. Создайте первый: укажите, о ком он, и задайте пароль.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">О ком</th>
                <th className="py-2 pr-4 font-medium">Пароль</th>
                <th className="py-2 pr-4 font-medium">Статус</th>
                <th className="py-2 pr-4 font-medium">Ответов</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {props.surveys.map((s) => (
                <tr
                  key={s.id}
                  className={`border-t ${s.id === props.selectedId ? "bg-accent/60" : ""}`}
                >
                  <td className="py-2 pr-4 font-medium">{s.subject.nom}</td>
                  <td className="py-2 pr-4 font-mono">
                    {s.password ?? (
                      <span className="font-sans text-muted-foreground">
                        {s.hasPassword ? "старый, задайте новый" : "не задан"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">{s.open ? "Открыт" : "Закрыт"}</td>
                  <td className="py-2 pr-4 tabular-nums">{s.count}</td>
                  <td className="py-2 text-right">
                    {s.id === props.selectedId ? (
                      <span className="px-3 text-xs text-muted-foreground">выбран</span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => props.onSelect(s.id)}>
                        Открыть
                      </Button>
                    )}
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

function SubjectFields({
  value,
  onChange,
  idPrefix,
}: {
  value: SubjectNames;
  onChange: (v: SubjectNames) => void;
  idPrefix: string;
}) {
  const female = value.gender === "f";
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">О ком опрос</p>
      <div className="flex gap-2" role="radiogroup" aria-label="Род">
        {(
          [
            ["f", "Женщина"],
            ["m", "Мужчина"],
          ] as const
        ).map(([g, label]) => (
          <Button
            key={g}
            type="button"
            size="sm"
            role="radio"
            aria-checked={value.gender === g}
            variant={value.gender === g ? "default" : "outline"}
            onClick={() => onChange({ ...value, gender: g })}
          >
            {label}
          </Button>
        ))}
      </div>
      {(
        [
          ["nom", female ? "Кто? (Мария)" : "Кто? (Иван)"],
          ["acc", female ? "Кого? (Марию)" : "Кого? (Ивана)"],
          ["dat", female ? "Кому? (Марии)" : "Кому? (Ивану)"],
        ] as const
      ).map(([k, label]) => (
        <div key={k} className="space-y-1">
          <Label htmlFor={`${idPrefix}-${k}`} className="text-xs text-muted-foreground">
            {label}
          </Label>
          <Input
            id={`${idPrefix}-${k}`}
            value={value[k]}
            maxLength={60}
            onChange={(e) => onChange({ ...value, [k]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

function NewSurveySection(props: {
  onCancel: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [subject, setSubject] = useState<SubjectNames>(EMPTY_SUBJECT);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await createObsSurveyFn({ data: { subject, password } });
      if (!res.ok) return setErr(SURVEY_ERROR[res.error] ?? "Не удалось создать опрос.");
      await props.onCreated(res.surveyId);
    } catch {
      setErr("Не удалось создать опрос.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Новый опрос">
      <form
        className="grid gap-6 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <SubjectFields value={subject} onChange={setSubject} idPrefix="new" />
        <div className="space-y-3">
          <Label htmlFor="new-password" className="text-sm font-medium">
            Пароль для участников
          </Label>
          <Input
            id="new-password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Не короче {PASSWORD_MIN} символов, у каждого опроса свой: по паролю участник попадает в
            нужный опрос. Пароль будет виден здесь, в админке.
          </p>
          <div className="flex gap-2 pt-2">
            <Button type="submit" size="sm" disabled={busy}>
              Создать опрос
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>
              Отмена
            </Button>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
      </form>
    </Section>
  );
}

function SurveySettings(props: {
  survey: Survey;
  onSaved: () => Promise<void>;
  onDeleted: (name: string) => Promise<void>;
  flash: (m: string) => void;
}) {
  const { survey, onSaved, flash } = props;
  const [subject, setSubject] = useState<SubjectNames>(survey.subject);
  const [password, setPassword] = useState(survey.password ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const link = surveyLink();

  const save = async (
    patch: { subject?: SubjectNames; password?: string; open?: boolean },
    done: string,
  ) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await updateObsSurveyFn({ data: { surveyId: survey.id, ...patch } });
      if (!res.ok) return setErr(SURVEY_ERROR[res.error] ?? "Не удалось сохранить.");
      await onSaved();
      flash(done);
    } catch {
      setErr("Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      const res = await deleteObsSurveyFn({ data: { surveyId: survey.id } });
      if (!res.ok) return setErr(SURVEY_ERROR[res.error] ?? "Не удалось удалить опрос.");
      await props.onDeleted(survey.subject.nom);
    } catch {
      setErr("Не удалось удалить опрос.");
    }
  };

  const passwordChanged = password.trim() !== (survey.password ?? "");

  return (
    <Section
      title={`Настройки: ${survey.subject.nom}`}
      aside={
        <div className="flex items-center gap-3">
          <Label htmlFor="obs-open" className="text-sm">
            {survey.open ? "Опрос открыт" : "Опрос закрыт"}
          </Label>
          <Switch
            id="obs-open"
            checked={survey.open}
            disabled={busy || (!survey.hasPassword && !survey.open)}
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
      <div className="grid gap-6 md:grid-cols-2">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save({ subject }, "Имя сохранено.");
          }}
        >
          <SubjectFields value={subject} onChange={setSubject} idPrefix="edit" />
          <Button type="submit" size="sm" disabled={busy}>
            Сохранить
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
            <Label htmlFor="obs-password" className="text-sm font-medium">
              Пароль
            </Label>
            <div className="flex gap-2">
              <Input
                id="obs-password"
                autoComplete="off"
                className="font-mono"
                placeholder={survey.hasPassword ? "старый пароль, задайте новый" : "не задан"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!survey.password}
                onClick={() => copyText(survey.password ?? "", flash, "Пароль скопирован.")}
              >
                Копировать
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Не короче {PASSWORD_MIN} символов. После смены старый пароль перестаёт работать.
            </p>
            <Button type="submit" size="sm" disabled={busy || !passwordChanged}>
              Сменить пароль
            </Button>
          </form>

          <div className="space-y-2">
            <p className="text-sm font-medium">Ссылка для участников</p>
            <div className="flex gap-2">
              <Input readOnly value={link} aria-label="Ссылка на опрос" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copyText(link, flash, "Ссылка скопирована.")}
              >
                Копировать
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!survey.password}
              onClick={() =>
                copyText(
                  `Ссылка: ${link}\nПароль: ${survey.password}`,
                  flash,
                  "Ссылка и пароль скопированы.",
                )
              }
            >
              Копировать ссылку и пароль
            </Button>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="text-destructive">
                Удалить опрос
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Удалить опрос о человеке «{survey.subject.nom}»?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Вместе с опросом навсегда удалятся все его ответы ({survey.count}). Восстановить
                  их будет нельзя. Сначала скачайте CSV, если ответы нужны.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={remove}>Удалить</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
              onClick={() =>
                download(
                  `blizkie-${fileSlug(names)}-otvety-${today()}.csv`,
                  buildAllCsv(answers, names),
                )
              }
            >
              Скачать все ответы (CSV)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                download(
                  `blizkie-${fileSlug(names)}-svodka-${today()}.csv`,
                  buildSummaryCsv(answers, names),
                )
              }
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
  names,
  child,
}: {
  responses: ObsResponse[];
  items: Item[];
  names: SubjectNames;
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
                  {fillName(i.text, names)}
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

function ItemsSection({ responses, names }: { responses: ObsResponse[]; names: SubjectNames }) {
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
          <ItemTable responses={responses} items={b.items} names={names} />
        </div>
      ))}
      <h3 className="mb-2 text-sm font-semibold">Блок Ж. Детство (ответили: {withChild.length})</h3>
      {withChild.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fillName("Никто не отметил, что знал [её|его] в детстве.", names)}
        </p>
      ) : (
        <ItemTable
          responses={withChild}
          items={CHILD_GROUPS.flatMap((g) => g.items)}
          names={names}
          child
        />
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
    { id: "valued", title: t("8. За что [её|его] ценят окружающие?"), get: (a) => a.start.valued },
    ...[...OPEN_CHANGES, ...OPEN_FINAL].map((i) => ({
      id: i.id,
      title: `${itemLabel(i.id)}. ${t(i.text)}`,
      get: (a: ObsResponse) => a.open[i.id],
    })),
    ...OPEN_CHILD.map((i) => ({
      id: i.id,
      title: `${itemLabel(i.id)}. ${t(i.text)}`,
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
            download(
              `blizkie-${fileSlug(names)}-${n}-${r.submittedAt.slice(0, 10)}.csv`,
              buildPersonCsv(r, n, names),
            )
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
          <Answer label={t("За что [её|его] ценят окружающие")} value={r.start.valued} />
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
                  label={`${itemLabel(i.id)}. ${t(i.text)}`}
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
                    label={`${itemLabel(i.id)}. ${t(i.text)}`}
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
