import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ADULT_IDS,
  AGES,
  BLOCK_LETTER,
  BLOCKS,
  CHILD_GROUPS,
  CHILD_IDS,
  FREQUENCIES,
  NAME_MAX,
  OPEN_CHANGES,
  OPEN_CHILD,
  OPEN_CHILD_IDS,
  OPEN_FINAL,
  OPEN_IDS,
  OPEN_MAX,
  PLACES,
  RELATIONS,
  SCALE,
  SCALE_CHILD,
  SHORT_MAX,
  WHEN,
  WHEN_TRIGGER,
  YEARS_MAX,
  fillName,
  itemLabel,
  type Group,
  type Item,
  type Option,
  type ScaleValue,
  type SubjectNames,
} from "@/lib/obs-survey";
import { checkObsPasswordFn, submitObsResponseFn } from "@/functions/obs-public.functions";
import surveyCss from "../styles/obs-survey.css?url";

export const Route = createFileRoute("/blizkie")({
  head: () => ({
    meta: [
      { title: "Закрытый опрос" },
      { name: "description", content: "Закрытый опрос" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "stylesheet", href: surveyCss }],
  }),
  component: ObsSurvey,
});

// ---------- состояние и черновик ----------

interface Draft {
  name: string;
  about: {
    relation: string;
    relationOther: string;
    years: string;
    frequency: string;
    places: string[];
    knewAsChild: string;
  };
  start: { threeWords: string; valued: string };
  scale: Record<string, { v: string; when?: string }>;
  open: Record<string, string>;
  child: { ages: string[]; scale: Record<string, { v: string }>; open: Record<string, string> };
  idx: number;
  surveyId?: string; // опрос, к которому относится черновик
}

const emptyDraft = (): Draft => ({
  name: "",
  about: { relation: "", relationOther: "", years: "", frequency: "", places: [], knewAsChild: "" },
  start: { threeWords: "", valued: "" },
  scale: {},
  open: {},
  child: { ages: [], scale: {}, open: {} },
  idx: 0,
});

// Черновик живёт только в браузере участника, пароль в него не попадает. После отправки удаляется.
// Отметки «уже отправлено» нет: с одного устройства могут отвечать несколько человек.
const DRAFT_KEY = "blizkie-draft";

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return { ...emptyDraft(), ...d };
  } catch {
    return null;
  }
}
function saveDraft(d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* хранилище недоступно: просто не сохраняем */
  }
}
function finish() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function screens(d: Draft): string[] {
  const list = [
    "entry",
    "intro",
    "about",
    "start",
    ...BLOCKS.map((b) => "block:" + b.id),
    "changes",
    "final",
  ];
  if (d.about.knewAsChild === "yes") list.push("child1", "child2", "childOpen");
  list.push("done");
  return list;
}

const LABELS: Record<string, string> = {
  intro: "Вступление",
  about: "О вас",
  start: "Для начала",
  changes: "Как это менялось",
  final: "Напоследок",
  child1: "Детство",
  child2: "Детство",
  childOpen: "Детство",
};

const CHILD_PART_1 = CHILD_GROUPS.slice(0, 2);
const CHILD_PART_2 = CHILD_GROUPS.slice(2);

function validYears(s: string) {
  const n = Number(s);
  return s.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= YEARS_MAX;
}

// Id вопросов без ответа на экране; пустой список — можно идти дальше.
function missingOn(key: string, d: Draft): string[] {
  const miss: string[] = [];
  const need = (ok: unknown, id: string) => {
    if (!ok) miss.push(id);
  };
  const a = d.about;
  if (key === "about") {
    need(a.relation && (a.relation !== "other" || a.relationOther.trim()), "relation");
    need(validYears(a.years), "years");
    need(a.frequency, "frequency");
    need(a.places.length, "places");
    need(a.knewAsChild, "child");
  }
  if (key.startsWith("block:"))
    BLOCKS.find((b) => b.id === key.slice(6))!.items.forEach((i) => need(d.scale[i.id]?.v, i.id));
  const childItems = (groups: Group[]) =>
    groups.forEach((g) => g.items.forEach((i) => need(d.child.scale[i.id]?.v, i.id)));
  if (key === "child1") {
    need(d.child.ages.length, "ages");
    childItems(CHILD_PART_1);
  }
  if (key === "child2") childItems(CHILD_PART_2);
  return miss;
}

function buildPayload(d: Draft) {
  const t = (s: string | undefined) => (s ?? "").trim() || null;
  const knew = d.about.knewAsChild === "yes";
  return {
    version: 1 as const,
    name: t(d.name),
    about: {
      relation: d.about.relation,
      relationOther: d.about.relation === "other" ? t(d.about.relationOther) : null,
      years: Number(d.about.years),
      frequency: d.about.frequency,
      places: d.about.places,
      knewAsChild: d.about.knewAsChild,
    },
    start: { threeWords: t(d.start.threeWords), valued: t(d.start.valued) },
    scale: Object.fromEntries(
      ADULT_IDS.map((id) => {
        const s = d.scale[id];
        const when = WHEN_TRIGGER.includes(s?.v as ScaleValue) ? s?.when || null : null;
        return [id, { v: s?.v, when }];
      }),
    ),
    open: Object.fromEntries(OPEN_IDS.map((id) => [id, t(d.open[id])])),
    child: knew
      ? {
          ages: d.child.ages,
          scale: Object.fromEntries(CHILD_IDS.map((id) => [id, { v: d.child.scale[id]?.v }])),
          open: Object.fromEntries(OPEN_CHILD_IDS.map((id) => [id, t(d.child.open[id])])),
        }
      : null,
  };
}

// ---------- страница ----------

function ObsSurvey() {
  const [d, setD] = useState<Draft>(emptyDraft);
  const [idx, setIdx] = useState(0);
  const [password, setPassword] = useState("");
  const [names, setNames] = useState<SubjectNames | null>(null);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const restored = useRef<Draft | null>(null);

  // Черновик читается после гидратации: на сервере localStorage нет.
  useEffect(() => {
    const saved = loadDraft();
    if (saved) {
      restored.current = saved;
      setD(saved);
    }
  }, []);

  useEffect(() => {
    if (names && surveyId && idx > 0 && screens(d)[idx] !== "done")
      saveDraft({ ...d, idx, surveyId });
  }, [d, idx, names, surveyId]);

  useEffect(() => {
    if (!scrollTo) return;
    document
      .getElementById("q-" + scrollTo)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setScrollTo(null);
  }, [scrollTo]);

  const list = screens(d);
  const key = list[idx];

  const goTo = (i: number) => {
    setIdx(i);
    setMissing(new Set());
    setErr("");
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* ignore */
    }
  };

  const update = (fn: (prev: Draft) => Draft, answeredId?: string) => {
    setD(fn);
    if (answeredId && missing.has(answeredId))
      setMissing((prev) => {
        const next = new Set(prev);
        next.delete(answeredId);
        return next;
      });
  };

  const login = async () => {
    if (!password) {
      setErr("Введите пароль.");
      return;
    }
    setBusy(true);
    setErr("");
    let res: { ok: boolean; surveyId?: string; subject?: SubjectNames } = { ok: false };
    try {
      res = await checkObsPasswordFn({ data: { password } });
    } catch {
      res = { ok: false };
    }
    setBusy(false);
    if (!res.ok || !res.subject || !res.surveyId) {
      setErr("Пароль не подошёл. Проверьте раскладку и регистр букв.");
      return;
    }
    setNames(res.subject);
    setSurveyId(res.surveyId);
    const saved = restored.current;
    // Черновик от другого опроса (другой пароль на том же устройстве) не подставляем, имя оставляем.
    if (saved && saved.surveyId !== res.surveyId) {
      restored.current = null;
      setD((p) => ({ ...emptyDraft(), name: p.name }));
      return goTo(1);
    }
    goTo(saved && saved.idx > 1 ? Math.min(saved.idx, screens(d).length - 2) : 1);
  };

  const send = async () => {
    setBusy(true);
    setErr("");
    let res: { ok: boolean; error?: string };
    try {
      res = await submitObsResponseFn({ data: { password, payload: buildPayload(d) } });
    } catch {
      setBusy(false);
      setErr("Не получилось отправить ответы. Проверьте подключение и попробуйте ещё раз.");
      return;
    }
    setBusy(false);
    if (!res.ok) {
      setErr(
        res.error === "auth"
          ? "Опрос закрыт или пароль изменился. Ответы сохранены на этом устройстве, напишите тому, кто прислал ссылку."
          : "Не получилось сохранить ответы. Проверьте, что на все вопросы есть ответ.",
      );
      return;
    }
    finish();
    goTo(list.length - 1);
  };

  const next = () => {
    if (key === "entry") return login();
    const miss = missingOn(key, d);
    if (miss.length) {
      setMissing(new Set(miss));
      setScrollTo(miss[0]);
      setErr(
        miss.length === 1
          ? "Остался один вопрос без ответа, он отмечен."
          : `Осталось вопросов без ответа: ${miss.length}. Они отмечены.`,
      );
      return;
    }
    if (list[idx + 1] === "done") return send();
    goTo(idx + 1);
  };

  const n: SubjectNames = names ?? { nom: "", acc: "", dat: "", gender: "f" };
  const t = (s: string) => fillName(s, n);
  const showTop = key !== "entry" && key !== "done";
  const total = list.length - 2;
  const stepLabel = key.startsWith("block:")
    ? BLOCKS.find((b) => b.id === key.slice(6))!.title
    : LABELS[key];

  const ctx: Ctx = { d, update, missing, t };

  let screen: ReactNode;
  if (key === "entry")
    screen = (
      <EntryScreen
        name={d.name}
        password={password}
        setName={(v) => setD((p) => ({ ...p, name: v }))}
        setPassword={setPassword}
        onEnter={next}
      />
    );
  else if (key === "intro") screen = <IntroScreen ctx={ctx} />;
  else if (key === "about") screen = <AboutScreen ctx={ctx} />;
  else if (key === "start") screen = <StartScreen ctx={ctx} />;
  else if (key.startsWith("block:")) screen = <BlockScreen ctx={ctx} id={key.slice(6)} />;
  else if (key === "changes")
    screen = (
      <OpenScreen ctx={ctx} eyebrow="Блок Д" title="Как это менялось" items={OPEN_CHANGES} />
    );
  else if (key === "final")
    screen = <OpenScreen ctx={ctx} eyebrow="Блок Е" title="Напоследок" items={OPEN_FINAL} />;
  else if (key === "child1") screen = <ChildScreen ctx={ctx} first />;
  else if (key === "child2") screen = <ChildScreen ctx={ctx} />;
  else if (key === "childOpen") screen = <ChildOpenScreen ctx={ctx} />;
  else screen = <DoneScreen t={t} />;

  return (
    <div className="obs-survey" lang="ru">
      <div className="wrap">
        {showTop && (
          <div className="top">
            <div className="top-row">
              <span>{stepLabel}</span>
              <span>
                Шаг {Math.max(idx, 1)} из {total}
              </span>
            </div>
            <div className="bar">
              <i style={{ width: `${(Math.max(idx, 1) / total) * 100}%` }} />
            </div>
          </div>
        )}
        <main>{screen}</main>
        {key !== "done" && (
          <div className="nav">
            {idx > 0 ? (
              <button className="btn" type="button" onClick={() => goTo(idx - 1)} disabled={busy}>
                Назад
              </button>
            ) : (
              <span />
            )}
            <button className="btn primary" type="button" onClick={next} disabled={busy}>
              {key === "entry"
                ? "Войти"
                : key === "intro"
                  ? "Начать"
                  : list[idx + 1] === "done"
                    ? busy
                      ? "Отправляем…"
                      : "Отправить"
                    : "Дальше"}
            </button>
          </div>
        )}
        <div className="err" role="alert">
          {err}
        </div>
      </div>
    </div>
  );
}

// ---------- кусочки ----------

interface Ctx {
  d: Draft;
  update: (fn: (prev: Draft) => Draft, answeredId?: string) => void;
  missing: Set<string>;
  t: (s: string) => string;
}

function Chips<T extends string>(props: {
  options: Option<T>[];
  value: string | string[];
  onChange: (v: string | string[]) => void;
  dimLast?: boolean;
  label?: string;
}) {
  const multi = Array.isArray(props.value);
  return (
    <div className="chips" role="group" aria-label={props.label}>
      {props.options.map(([val, text], i) => {
        const on = multi ? (props.value as string[]).includes(val) : props.value === val;
        return (
          <button
            key={val}
            type="button"
            className={"chip" + (props.dimLast && i === props.options.length - 1 ? " dim" : "")}
            aria-pressed={on}
            onClick={() => {
              if (!multi) return props.onChange(val);
              const cur = props.value as string[];
              props.onChange(on ? cur.filter((x) => x !== val) : [...cur, val]);
            }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

function Q(props: {
  id: string;
  num: string;
  text: string;
  missing: boolean;
  children: ReactNode;
  sub?: string;
}) {
  return (
    <div className={"q" + (props.missing ? " missing" : "")} id={"q-" + props.id}>
      <div className="q-text">
        <span className="num">{props.num}</span>
        {props.text}
      </div>
      {props.sub && <div className="sub">{props.sub}</div>}
      {props.children}
    </div>
  );
}

function Header({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <>
      <div className="eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </>
  );
}

function ScaleQ({ ctx, item, child }: { ctx: Ctx; item: Item; child?: boolean }) {
  const { d, update, missing } = ctx;
  const cur = child ? d.child.scale[item.id] : d.scale[item.id];
  const v = cur?.v ?? "";
  const when = !child ? (d.scale[item.id]?.when ?? "") : "";
  const setV = (nv: string) =>
    update(
      (p) =>
        child
          ? { ...p, child: { ...p.child, scale: { ...p.child.scale, [item.id]: { v: nv } } } }
          : {
              ...p,
              scale: {
                ...p.scale,
                [item.id]: WHEN_TRIGGER.includes(nv as ScaleValue)
                  ? { v: nv, when: p.scale[item.id]?.when }
                  : { v: nv },
              },
            },
      item.id,
    );
  return (
    <Q
      id={item.id}
      num={itemLabel(item.id) + "."}
      text={ctx.t(item.text)}
      missing={missing.has(item.id)}
    >
      <Chips
        options={child ? SCALE_CHILD : SCALE}
        value={v}
        onChange={(x) => setV(x as string)}
        dimLast
        label={ctx.t(item.text)}
      />
      {!child && WHEN_TRIGGER.includes(v as ScaleValue) && (
        <div className="follow">
          <div className="lbl">С какого времени это так?</div>
          <Chips
            options={WHEN}
            value={when}
            onChange={(x) =>
              update((p) => ({
                ...p,
                scale: { ...p.scale, [item.id]: { v, when: x as string } },
              }))
            }
            dimLast
            label="С какого времени это так?"
          />
        </div>
      )}
    </Q>
  );
}

function OpenQ(props: { item: Item; text: string; value: string; onChange: (v: string) => void }) {
  const tid = "ta-" + props.item.id;
  return (
    <div className="q">
      <label className="q-text" htmlFor={tid}>
        <span className="num">{itemLabel(props.item.id)}.</span>
        {props.text}
        <span className="hint"> (по желанию)</span>
      </label>
      <textarea
        id={tid}
        maxLength={OPEN_MAX}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

// ---------- экраны ----------

function EntryScreen(props: {
  name: string;
  password: string;
  setName: (v: string) => void;
  setPassword: (v: string) => void;
  onEnter: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      props.onEnter();
    }
  };
  return (
    <div className="stack">
      <div className="eyebrow">Закрытый опрос</div>
      <h1>Опрос близких</h1>
      <p className="lead">Введите пароль, который вам прислали. Имя можно не указывать.</p>
      <div className="card stack">
        <label className="field" htmlFor="password">
          Пароль
          <input
            ref={ref}
            type="password"
            id="password"
            autoComplete="off"
            value={props.password}
            onChange={(e) => props.setPassword(e.target.value)}
            onKeyDown={onKey}
          />
        </label>
        <label className="field" htmlFor="name">
          Ваше имя <span className="hint">(по желанию)</span>
          <input
            type="text"
            id="name"
            autoComplete="name"
            maxLength={NAME_MAX}
            value={props.name}
            onChange={(e) => props.setName(e.target.value)}
            onKeyDown={onKey}
          />
        </label>
      </div>
    </div>
  );
}

function IntroScreen({ ctx }: { ctx: Ctx }) {
  const { d, t } = ctx;
  const name = d.name.trim();
  return (
    <div className="stack">
      <h1>{name ? `Спасибо, ${name}` : "Спасибо"}</h1>
      <p className="lead">
        {t(
          "Спасибо, что согласились помочь. Мы хотим лучше понять, [какая|какой] {N} в обычной жизни: как [она|он] общается, как справляется с делами, как себя чувствует. Правильных и неправильных ответов нет. Отвечайте по тому, что видели сами, а не по тому, что слышали от других. Если не знаете, выбирайте «Не знаю», это нормальный ответ.",
        )}
      </p>
      <p className="lead">
        {t("Займёт около 15 минут, а если вы знали {A} в детстве — около 20–25 минут.")}
      </p>
    </div>
  );
}

function AboutScreen({ ctx }: { ctx: Ctx }) {
  const { d, update, missing, t } = ctx;
  const a = d.about;
  const set = (patch: Partial<Draft["about"]>, id: string) =>
    update((p) => ({ ...p, about: { ...p.about, ...patch } }), id);
  return (
    <div className="stack">
      <Header eyebrow="О вас" title="Немного о вас и вашем знакомстве" />
      <Q
        id="relation"
        num="2."
        text={t("Кем вы приходитесь {D}?")}
        missing={missing.has("relation")}
      >
        <Chips
          options={RELATIONS}
          value={a.relation}
          onChange={(v) => set({ relation: v as string }, "relation")}
        />
        {a.relation === "other" && (
          <div style={{ marginTop: 10 }}>
            <input
              type="text"
              placeholder="Кем именно"
              aria-label="Кем именно"
              maxLength={SHORT_MAX}
              value={a.relationOther}
              onChange={(e) => set({ relationOther: e.target.value }, "relation")}
            />
          </div>
        )}
      </Q>
      <div className={"q" + (missing.has("years") ? " missing" : "")} id="q-years">
        <label className="q-text" htmlFor="years">
          <span className="num">3.</span>
          {t("Сколько лет вы знаете {A}?")}
        </label>
        <input
          type="number"
          id="years"
          min={0}
          max={YEARS_MAX}
          inputMode="numeric"
          style={{ maxWidth: 140 }}
          value={a.years}
          onChange={(e) => set({ years: e.target.value }, "years")}
        />
      </div>
      <Q
        id="frequency"
        num="4."
        text="Как часто вы общаетесь сейчас?"
        missing={missing.has("frequency")}
      >
        <Chips
          options={FREQUENCIES}
          value={a.frequency}
          onChange={(v) => set({ frequency: v as string }, "frequency")}
        />
      </Q>
      <Q
        id="places"
        num="5."
        text={t("Где вы [её|его] чаще всего видите?")}
        sub="Можно выбрать несколько"
        missing={missing.has("places")}
      >
        <Chips
          options={PLACES}
          value={a.places}
          onChange={(v) => set({ places: v as string[] }, "places")}
        />
      </Q>
      <Q
        id="child"
        num="6."
        text={t("Вы знали {A} в детстве или подростком?")}
        missing={missing.has("child")}
      >
        <Chips
          options={[
            ["yes", "Да"],
            ["no", "Нет"],
          ]}
          value={a.knewAsChild}
          onChange={(v) => set({ knewAsChild: v as string }, "child")}
        />
      </Q>
    </div>
  );
}

function StartScreen({ ctx }: { ctx: Ctx }) {
  const { d, update, t } = ctx;
  const set = (patch: Partial<Draft["start"]>) =>
    update((p) => ({ ...p, start: { ...p.start, ...patch } }));
  return (
    <div className="stack">
      <Header eyebrow="Для начала" title="Своими словами" />
      <div className="q">
        <label className="q-text" htmlFor="w3">
          <span className="num">7.</span>
          {t("Опишите {A} тремя словами.")}
        </label>
        <input
          type="text"
          id="w3"
          maxLength={SHORT_MAX}
          value={d.start.threeWords}
          onChange={(e) => set({ threeWords: e.target.value })}
        />
      </div>
      <div className="q">
        <label className="q-text" htmlFor="valued">
          <span className="num">8.</span>
          {t("За что [её|его] ценят окружающие?")}
        </label>
        <textarea
          id="valued"
          maxLength={OPEN_MAX}
          value={d.start.valued}
          onChange={(e) => set({ valued: e.target.value })}
        />
      </div>
    </div>
  );
}

function BlockScreen({ ctx, id }: { ctx: Ctx; id: string }) {
  const b = BLOCKS.find((x) => x.id === id)!;
  return (
    <div className="stack">
      <Header eyebrow={"Блок " + BLOCK_LETTER[id]} title={b.title} />
      <div className="scale-legend">
        Как часто вы это замечаете? Если выбираете «Часто» или «Почти всегда», появится вопрос, с
        какого времени это так.
      </div>
      {b.items.map((i) => (
        <ScaleQ key={i.id} ctx={ctx} item={i} />
      ))}
    </div>
  );
}

function OpenScreen(props: { ctx: Ctx; eyebrow: string; title: string; items: Item[] }) {
  const { d, update, t } = props.ctx;
  return (
    <div className="stack">
      <Header eyebrow={props.eyebrow} title={props.title} />
      {props.items.map((i) => (
        <OpenQ
          key={i.id}
          item={i}
          text={t(i.text)}
          value={d.open[i.id] ?? ""}
          onChange={(v) => update((p) => ({ ...p, open: { ...p.open, [i.id]: v } }))}
        />
      ))}
    </div>
  );
}

function ChildScreen({ ctx, first }: { ctx: Ctx; first?: boolean }) {
  const { d, update, missing, t } = ctx;
  const groups = first ? CHILD_PART_1 : CHILD_PART_2;
  return (
    <div className="stack">
      <Header
        eyebrow="Блок Ж"
        title={t("[Какой|Каким] {N} [была|был] в детстве")}
        lead={
          first
            ? t(
                "Вы отметили, что знали {A} ребёнком. Вспомните, [какой она была|каким он был] тогда.",
              )
            : undefined
        }
      />
      {first && (
        <Q
          id="ages"
          num="Ж0."
          text={t("В каком возрасте вы [её|его] знали?")}
          sub="Можно выбрать несколько"
          missing={missing.has("ages")}
        >
          <Chips
            options={AGES}
            value={d.child.ages}
            onChange={(v) =>
              update((p) => ({ ...p, child: { ...p.child, ages: v as string[] } }), "ages")
            }
          />
        </Q>
      )}
      <div className="scale-legend">Как часто так было? Если не помните, выбирайте «Не помню».</div>
      {groups.map((g) => (
        <div key={g.title} className="stack">
          <div className="group-title">{g.title}</div>
          {g.items.map((i) => (
            <ScaleQ key={i.id} ctx={ctx} item={i} child />
          ))}
        </div>
      ))}
    </div>
  );
}

function ChildOpenScreen({ ctx }: { ctx: Ctx }) {
  const { d, update } = ctx;
  return (
    <div className="stack">
      <Header eyebrow="Блок Ж" title="Детство своими словами" />
      {OPEN_CHILD.map((i) => (
        <OpenQ
          key={i.id}
          item={i}
          text={ctx.t(i.text)}
          value={d.child.open[i.id] ?? ""}
          onChange={(v) =>
            update((p) => ({ ...p, child: { ...p.child, open: { ...p.child.open, [i.id]: v } } }))
          }
        />
      ))}
    </div>
  );
}

function DoneScreen({ t }: { t: (s: string) => string }) {
  return (
    <div className="stack">
      <h1>Спасибо!</h1>
      <p className="lead">{t("Ваши ответы сохранены. Это очень поможет лучше понять {A}.")}</p>
    </div>
  );
}
