import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import {
  analyse,
  band,
  BAND_LABEL,
  fmt,
  splitQuestions,
  starKey,
  type Band,
  type CommAnswer,
} from "@/lib/comm-analysis";
import { buildCsv } from "@/lib/comm-csv";
import { OPEN, QUICK_LABEL, THRESHOLD, ZONES, type OpenId } from "@/lib/comm-survey";
import {
  createWaveFn,
  deleteWaveFn,
  getWaveResultsFn,
  listWavesFn,
  setStarFn,
  updateWaveFn,
} from "@/functions/comm-admin.functions";
import dashCss from "../styles/comm-dashboard.css?url";

export const Route = createFileRoute("/admin_/communication")({
  head: () => ({
    meta: [{ title: "Communication Dashboard" }, { name: "robots", content: "noindex, nofollow" }],
    links: [{ rel: "stylesheet", href: dashCss }],
  }),
  component: CommDashboardPage,
});

interface Wave {
  id: string;
  name: string;
  code: string;
  open: boolean;
  count: number;
}

type Results =
  | { locked: true; count: number }
  | { locked: false; count: number; answers: CommAnswer[]; starred: string[] };

const questionText: Record<number, string> = {};
const zoneOfQuestion: Record<number, string> = {};
ZONES.forEach((z) =>
  z.questions.forEach((q) => {
    questionText[q.n] = q.text;
    zoneOfQuestion[q.n] = z.title;
  }),
);

const TAB_LABEL: Record<OpenId, string> = {
  ambiguous_phrase: "Ambiguous phrases",
  where_it_breaks: "Where it breaks",
  one_rule: "One rule to change",
};

const WAVE_ERROR: Record<string, string> = {
  invalid_name: "Enter a name.",
  invalid_code: "The code needs at least 6 characters: letters, digits or hyphens.",
  code_taken: "This code is already used by another run.",
  not_found: "This run no longer exists.",
};

/* ---------- tooltip & toast ---------- */

type TipApi = {
  show: (content: ReactNode, e: React.MouseEvent) => void;
  move: (e: React.MouseEvent) => void;
  hide: () => void;
};

function useTip(): [TipApi, ReactNode] {
  const [content, setContent] = useState<ReactNode>(null);
  const ref = useRef<HTMLDivElement>(null);
  const place = (e: React.MouseEvent) => {
    const t = ref.current;
    if (!t) return;
    const x = Math.min(e.clientX + 14, window.innerWidth - t.offsetWidth - 8);
    const y =
      e.clientY + 16 + t.offsetHeight > window.innerHeight
        ? e.clientY - t.offsetHeight - 10
        : e.clientY + 16;
    t.style.left = x + "px";
    t.style.top = y + "px";
  };
  const api: TipApi = {
    show: (c, e) => {
      setContent(c);
      place(e);
    },
    move: place,
    hide: () => setContent(null),
  };
  const node = (
    <div ref={ref} className={`tip ${content ? "on" : ""}`} role="tooltip">
      {content}
    </div>
  );
  return [api, node];
}

const tipProps = (tip: TipApi, content: ReactNode) => ({
  onMouseEnter: (e: React.MouseEvent) => tip.show(content, e),
  onMouseMove: tip.move,
  onMouseLeave: tip.hide,
});

function useToast(): [(m: string) => void, ReactNode] {
  const [msg, setMsg] = useState("");
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((m: string) => {
    setMsg(m);
    setOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), 2600);
  }, []);
  return [
    toast,
    <div key="toast" className={`toast ${on ? "on" : ""}`} role="status">
      {msg}
    </div>,
  ];
}

/* ---------- small pieces ---------- */

function BandIcon({ b }: { b: Band }) {
  if (b === "hot")
    return (
      <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 1 11 10.5H1Z" fill="var(--st-hot)" />
      </svg>
    );
  if (b === "mid")
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <rect
          x="1.5"
          y="1.5"
          width="9"
          height="9"
          rx="1.5"
          transform="rotate(45 6 6)"
          fill="var(--st-mid)"
        />
      </svg>
    );
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="4.5" fill="var(--st-low)" />
    </svg>
  );
}

function StTag({ m }: { m: number }) {
  const b = band(m);
  return (
    <span className="st">
      <BandIcon b={b} />
      {BAND_LABEL[b]}
    </span>
  );
}

function Hist({ d, N, tip }: { d: number[]; N: number; tip: TipApi }) {
  const max = Math.max(...d, 1);
  return (
    <>
      <div className="hist" role="img" aria-label={`Answers 1 to 5: ${d.join(", ")}`}>
        {d.map((c, i) => (
          <div
            key={i}
            className={`b ${c ? "" : "zero"}`}
            style={{ height: `${c ? Math.max(8, (c / max) * 100) : 3}%` }}
            {...tipProps(
              tip,
              <>
                <b>{i + 1}</b>: {c} of {N} ({Math.round((c / N) * 100)}%)
              </>,
            )}
          />
        ))}
      </div>
      <div className="hist-lbl">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i}>{i}</span>
        ))}
      </div>
    </>
  );
}

/* ---------- page ---------- */

function CommDashboardPage() {
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
  return <CommDashboard />;
}

function CommDashboard() {
  const [waves, setWaves] = useState<Wave[] | null>(null);
  const [waveId, setWaveId] = useState<string | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "new" | "code">("none");
  const [tip, tipNode] = useTip();
  const [toast, toastNode] = useToast();

  const loadWaves = useCallback(async (select?: string) => {
    try {
      const list = await listWavesFn();
      setWaves(list);
      setWaveId(
        (cur) => select ?? (cur && list.some((w) => w.id === cur) ? cur : (list[0]?.id ?? null)),
      );
      setLoadError(null);
    } catch {
      setLoadError("Couldn’t load survey runs.");
    }
  }, []);

  const loadResults = useCallback(async (id: string) => {
    setResults(null);
    try {
      const r = await getWaveResultsFn({ data: { waveId: id } });
      setResults(r);
    } catch {
      setLoadError("Couldn’t load results.");
    }
  }, []);

  useEffect(() => {
    loadWaves();
  }, [loadWaves]);

  useEffect(() => {
    if (waveId) loadResults(waveId);
  }, [waveId, loadResults]);

  const wave = waves?.find((w) => w.id === waveId) ?? null;

  const toggleOpen = async () => {
    if (!wave) return;
    const res = await updateWaveFn({ data: { waveId: wave.id, open: !wave.open } });
    if (!res.ok) return toast(WAVE_ERROR[res.error] ?? "Something went wrong.");
    await loadWaves();
    toast(
      !wave.open
        ? "The survey is open again. The code works."
        : "The survey is closed. The code no longer lets anyone in.",
    );
  };

  // Если буфер обмена недоступен, показываем текст в тосте, чтобы его можно было переписать.
  const copy = (text: string, done: string) => {
    try {
      navigator.clipboard.writeText(text).then(
        () => toast(done),
        () => toast(text),
      );
    } catch {
      toast(text);
    }
  };
  const copyLink = () => copy(`${window.location.origin}/comm`, "Link copied");
  const copyCode = () => wave && copy(wave.code, "Code copied");

  const exportCsv = () => {
    if (!wave || !results || results.locked) return;
    const csv = buildCsv(results.answers);
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `communication-survey-${wave.id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("File downloaded");
  };

  return (
    <div className="comm-dash" lang="en">
      <main className="wrap">
        <div className="top">
          <div>
            <div className="brand">Communication Debugger · Admin</div>
            <h1>Survey results</h1>
          </div>
        </div>

        {loadError && (
          <section className="card">
            <p className="muted">{loadError}</p>
          </section>
        )}

        {waves && (
          <RunList
            waves={waves}
            selectedId={waveId}
            onSelect={setWaveId}
            onNew={() => setPanel(panel === "new" ? "none" : "new")}
            onDeleted={async (name) => {
              setPanel("none");
              await loadWaves();
              toast(`“${name}” deleted`);
            }}
            toast={toast}
          />
        )}

        {panel === "new" && (
          <NewRunForm
            onCancel={() => setPanel("none")}
            onCreated={async (id) => {
              setPanel("none");
              await loadWaves(id);
              toast("The run is created and collecting answers.");
            }}
          />
        )}

        {wave && (
          <section className="card" id="waveCard">
            <div className="wave-bar">
              <div className="tile">
                <div className="k">Responses</div>
                <div className="v">{wave.count}</div>
              </div>
              <div className="tile">
                <div className="k">Access code</div>
                <div className="v code">{wave.code}</div>
              </div>
              <div className="tile">
                <div className="k">Collecting answers</div>
                <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
                  <span className={`pill ${wave.open ? "open" : "closed"}`}>
                    <i />
                    {wave.open ? "Open" : "Closed"}
                  </span>
                </div>
              </div>
              <div className="tile">
                <div className="k">Survey link</div>
                <div className="v" style={{ fontSize: 13, fontWeight: 600, paddingTop: 6 }}>
                  /comm
                </div>
              </div>
            </div>
            <div className="wave-actions">
              <button className="btn" onClick={toggleOpen}>
                {wave.open ? "Close the survey" : "Reopen the survey"}
              </button>
              <button className="btn" onClick={() => setPanel(panel === "code" ? "none" : "code")}>
                Change code
              </button>
              <button className="btn" onClick={copyLink}>
                Copy link
              </button>
              <button className="btn" onClick={copyCode}>
                Copy code
              </button>
              <button
                className="btn solid"
                onClick={exportCsv}
                disabled={wave.count < THRESHOLD || !results || results.locked}
                title={wave.count < THRESHOLD ? "Available after the first response" : undefined}
              >
                Download all answers (CSV)
              </button>
            </div>
            {panel === "code" && (
              <ChangeCodeForm
                wave={wave}
                onCancel={() => setPanel("none")}
                onChanged={async () => {
                  setPanel("none");
                  await loadWaves();
                  toast("Code changed. The old code no longer works.");
                }}
              />
            )}
          </section>
        )}

        {wave && results && (
          <Content key={wave.id} waveId={wave.id} results={results} tip={tip} toast={toast} />
        )}
      </main>
      {tipNode}
      {toastNode}
    </div>
  );
}

function RunList({
  waves,
  selectedId,
  onSelect,
  onNew,
  onDeleted,
  toast,
}: {
  waves: Wave[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleted: (name: string) => void;
  toast: (m: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async (w: Wave) => {
    setBusy(true);
    try {
      const res = await deleteWaveFn({ data: { waveId: w.id } });
      if (!res.ok) toast(WAVE_ERROR[res.error] ?? "Something went wrong.");
      else {
        setConfirmId(null);
        onDeleted(w.name);
      }
    } catch {
      toast("Couldn’t delete the run. Try again.");
    }
    setBusy(false);
  };

  return (
    <section className="card">
      <div className="card-head">
        <div className="desc">
          <h2>Survey runs</h2>
        </div>
        <button className="btn" id="newWave" onClick={onNew}>
          + New run
        </button>
      </div>
      {!waves.length ? (
        <div className="empty">No survey runs yet. Create one with “+ New run”.</div>
      ) : (
        <ul className="runs">
          {waves.map((w) =>
            confirmId === w.id ? (
              <li key={w.id} className="run confirm">
                <span className="small">
                  <b>
                    Delete “{w.name}” and its {w.count} response{w.count === 1 ? "" : "s"}?
                  </b>{" "}
                  <span className="muted">This can’t be undone.</span>
                </span>
                <span className="run-btns">
                  <button className="btn danger" onClick={() => remove(w)} disabled={busy}>
                    Delete
                  </button>
                  <button className="btn" onClick={() => setConfirmId(null)} disabled={busy}>
                    Cancel
                  </button>
                </span>
              </li>
            ) : (
              <li key={w.id} className={`run ${w.id === selectedId ? "on" : ""}`}>
                <button
                  className="run-main"
                  aria-current={w.id === selectedId}
                  onClick={() => onSelect(w.id)}
                >
                  <span className="run-name">{w.name}</span>
                  <span className="run-code">{w.code}</span>
                  <span className="small muted">
                    {w.count} response{w.count === 1 ? "" : "s"}
                  </span>
                  <span className={`pill ${w.open ? "open" : "closed"}`}>
                    <i />
                    {w.open ? "Open" : "Closed"}
                  </span>
                </button>
                <button
                  className="btn"
                  aria-label={`Delete “${w.name}”`}
                  onClick={() => setConfirmId(w.id)}
                >
                  Delete
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function NewRunForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await createWaveFn({ data: { name, code } });
      if (res.ok) onCreated(res.waveId);
      else setErr(WAVE_ERROR[res.error] ?? "Something went wrong.");
    } catch {
      setErr("Something went wrong.");
    }
    setBusy(false);
  };
  return (
    <section className="card">
      <div className="card-head">
        <div className="desc">
          <h2>New survey run</h2>
          <p className="muted small">
            Name the run and set a code. It starts collecting answers right away.
          </p>
        </div>
      </div>
      <div className="form-grid">
        <div>
          <label htmlFor="newName">Name</label>
          <input
            id="newName"
            type="text"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            placeholder="Team Alpha · before training"
          />
        </div>
        <div>
          <label htmlFor="newCode">Access code</label>
          <input
            id="newCode"
            type="text"
            value={code}
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
      </div>
      <div className="form-err" role="alert">
        {err}
      </div>
      <div className="wave-actions">
        <button className="btn solid" onClick={submit} disabled={busy}>
          Create
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function ChangeCodeForm({
  wave,
  onCancel,
  onChanged,
}: {
  wave: Wave;
  onCancel: () => void;
  onChanged: () => void;
}) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await updateWaveFn({ data: { waveId: wave.id, code } });
      if (res.ok) onChanged();
      else setErr(WAVE_ERROR[res.error] ?? "Something went wrong.");
    } catch {
      setErr("Something went wrong.");
    }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
      <p className="small" style={{ marginBottom: 8 }}>
        <b>The old code {wave.code} will stop working immediately.</b>{" "}
        <span className="muted">
          Anyone who hasn’t sent their answers yet will need the new code.
        </span>
      </p>
      <div className="form-grid">
        <div>
          <label htmlFor="changeCode">New access code</label>
          <input
            id="changeCode"
            type="text"
            value={code}
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
      </div>
      <div className="form-err" role="alert">
        {err}
      </div>
      <div className="wave-actions">
        <button className="btn solid" onClick={submit} disabled={busy}>
          Change code
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Content({
  waveId,
  results,
  tip,
  toast,
}: {
  waveId: string;
  results: Results;
  tip: TipApi;
  toast: (m: string) => void;
}) {
  const N = results.count;
  const answers = useMemo(() => (results.locked ? [] : results.answers), [results]);
  const A = useMemo(() => (results.locked ? null : analyse(answers)), [results, answers]);
  const allRef = useRef<HTMLElement>(null);
  const [allOpen, setAllOpen] = useState(false);

  if (results.locked || !A) {
    return (
      <section className="card locked">
        <div className="big">{N}</div>
        <h2>response{N === 1 ? "" : "s"} so far</h2>
        <p className="muted" style={{ maxWidth: 460, margin: "8px auto 0" }}>
          Results will appear here after the first response.
        </p>
      </section>
    );
  }

  const zSorted = A.zones.slice().sort((a, b) => b.mean - a.mean);
  const splits = splitQuestions(A.qs);
  const qEntries = Object.entries(A.quick)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);
  const qMax = Math.max(...qEntries.map((e) => e[1]), 1);

  const toggleAll = () => {
    const ds = [
      ...(allRef.current?.querySelectorAll("details.zone") ?? []),
    ] as HTMLDetailsElement[];
    const open = ds.some((d) => !d.open);
    ds.forEach((d) => (d.open = open));
    setAllOpen(open);
  };

  return (
    <div id="content">
      <section className="card">
        <div className="card-head">
          <div className="desc">
            <h2>Team profile</h2>
            <p className="muted small">
              Average score per area, from the most friction to the least. 1 means “almost never a
              problem”, 5 means “very often / systematically”.
            </p>
          </div>
          <div className="legend">
            <span className="st">
              <BandIcon b="hot" />
              Hot spot · 3.5+
            </span>
            <span className="st">
              <BandIcon b="mid" />
              Noticeable · 2.5–3.4
            </span>
            <span className="st">
              <BandIcon b="low" />
              Low friction · below 2.5
            </span>
          </div>
        </div>
        <div className="axis">
          <span className="sp" />
          <div className="nums">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i}>{i}</span>
            ))}
          </div>
          <span className="sp" />
          <span className="sp" />
        </div>
        {zSorted.map((z) => (
          <div
            key={z.id}
            className="prow"
            {...tipProps(
              tip,
              <>
                <b>{z.title}</b>
                <br />
                Average {fmt(z.mean)} · spread {fmt(z.sd)}
                <br />
                {z.nums.length} questions · {N} responses
              </>,
            )}
          >
            <div className="name">{z.title}</div>
            <div className="track">
              <div className="ticks">
                {[0, 1, 2, 3, 4].map((i) => (
                  <i key={i} />
                ))}
              </div>
              <div className="fill" style={{ width: `${((z.mean - 1) / 4) * 100}%` }} />
            </div>
            <div className="val">{fmt(z.mean)}</div>
            <StTag m={z.mean} />
          </div>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <div className="desc">
            <h2>Where the team sees things differently</h2>
            <p className="muted small">
              Questions where at least a quarter of people answered 1–2 and at least a quarter
              answered 4–5. The average hides this: people are living different versions of the same
              team. Good material for the workshop.
            </p>
          </div>
        </div>
        {splits.length ? (
          <div className="split-grid">
            {splits.map((q) => (
              <div key={q.n} className="split">
                <div>
                  <div className="zone">{zoneOfQuestion[q.n]}</div>
                  <div className="q">
                    <b>{q.n}.</b> {questionText[q.n]}
                  </div>
                  <div className="share">
                    <b>{Math.round(q.low * 100)}%</b> rarely see it ·{" "}
                    <b>{Math.round(q.high * 100)}%</b> see it often
                  </div>
                </div>
                <div>
                  <Hist d={q.dist} N={q.N} tip={tip} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">No strong splits: people mostly see things the same way.</div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <div className="desc">
            <h2>Top problems (quick pick)</h2>
            <p className="muted small">
              How many people put each item in their top 3. Options nobody picked are hidden.
            </p>
          </div>
        </div>
        {qEntries.map(([k, c]) => (
          <div
            key={k}
            className="qrow"
            {...tipProps(
              tip,
              <>
                <b>{QUICK_LABEL[k]}</b>
                <br />
                {c} of {N} people ({Math.round((c / N) * 100)}%)
              </>,
            )}
          >
            <div>{QUICK_LABEL[k]}</div>
            <div className="bar">
              <i style={{ width: `${(c / qMax) * 100}%` }} />
            </div>
            <div className="c">
              <b>{c}</b> <span className="faint">{Math.round((c / N) * 100)}%</span>
            </div>
          </div>
        ))}
        {A.others.length > 0 && (
          <div className="others">
            <h3>Written under “Other”</h3>
            <ul>
              {A.others.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card" ref={allRef}>
        <div className="card-head">
          <div className="desc">
            <h2>All questions</h2>
            <p className="muted small">
              Open an area to see each question. Spread shows how much answers differ: under 1 means
              people largely agree, above 1.3 means opinions diverge.
            </p>
          </div>
          <button className="btn" id="toggleAll" onClick={toggleAll}>
            {allOpen ? "Close all" : "Open all"}
          </button>
        </div>
        {A.zones.map((z) => (
          <details key={z.id} className="zone">
            <summary>
              <span>{z.title}</span>
              <span style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <span className="small muted">avg {fmt(z.mean)}</span>
                <StTag m={z.mean} />
                <span className="chev">›</span>
              </span>
            </summary>
            <table className="qtable">
              <thead>
                <tr>
                  <th>Question</th>
                  <th style={{ textAlign: "right" }}>Avg</th>
                  <th className="sd" style={{ textAlign: "right" }}>
                    Spread
                  </th>
                  <th>Answers 1–5</th>
                </tr>
              </thead>
              <tbody>
                {z.nums.map((n) => {
                  const q = A.qs[n];
                  return (
                    <tr key={n}>
                      <td>
                        <span className="n">{n}.</span>
                        {questionText[n]}
                        {q.split && <span className="flag">split</span>}
                      </td>
                      <td className="num">{fmt(q.mean)}</td>
                      <td className="num sd">{fmt(q.sd)}</td>
                      <td className="h">
                        <Hist d={q.dist} N={q.N} tip={tip} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        ))}
      </section>

      <OpenAnswers
        waveId={waveId}
        answers={answers}
        initialStarred={results.starred}
        toast={toast}
      />
    </div>
  );
}

function OpenAnswers({
  waveId,
  answers,
  initialStarred,
  toast,
}: {
  waveId: string;
  answers: CommAnswer[];
  initialStarred: string[];
  toast: (m: string) => void;
}) {
  const [tab, setTab] = useState<OpenId>("ambiguous_phrase");
  const [starred, setStarred] = useState<Set<string>>(() => new Set(initialStarred));
  const q = OPEN.find((o) => o.id === tab)!;

  // Порядок — по непрозрачному ключу ответа: стабилен между визитами и не совпадает с порядком отправки.
  const list = answers
    .map((r) => ({ key: starKey(r.key, tab), text: r.open[tab] }))
    .filter((a): a is { key: string; text: string } => Boolean(a.text))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  const starredHere = list.filter((a) => starred.has(a.key));

  const toggleStar = async (key: string) => {
    const on = !starred.has(key);
    const apply = (value: boolean) =>
      setStarred((prev) => {
        const next = new Set(prev);
        if (value) next.add(key);
        else next.delete(key);
        return next;
      });
    apply(on);
    try {
      const res = await setStarFn({ data: { waveId, key, starred: on } });
      if (!res.ok) throw new Error();
    } catch {
      apply(!on);
      toast("Couldn’t save the star. Try again.");
    }
  };

  const copyStarred = () => {
    const text = starredHere.map((a) => "• " + a.text).join("\n");
    try {
      navigator.clipboard.writeText(text).then(
        () => toast(`Copied ${starredHere.length}`),
        () => toast("Couldn’t copy. Your browser blocked access to the clipboard."),
      );
    } catch {
      toast("Couldn’t copy. Your browser blocked access to the clipboard.");
    }
  };

  return (
    <section className="card" id="openCard">
      <div className="card-head">
        <div className="desc">
          <h2>Open answers</h2>
          <p className="muted small">
            Shown in random order, not in the order they were sent. Star the phrases you want to use
            in exercises.
          </p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {OPEN.map((o) => {
          const c = answers.filter((r) => r.open[o.id]).length;
          return (
            <button
              key={o.id}
              className="tab"
              role="tab"
              aria-selected={o.id === tab}
              onClick={() => setTab(o.id)}
            >
              {o.n}. {TAB_LABEL[o.id]} · {c}
            </button>
          );
        })}
      </div>
      <div className="open-q">
        {q.n}. {q.text}
      </div>
      <div className="answers">
        {list.length ? (
          list.map((a) => {
            const on = starred.has(a.key);
            return (
              <div key={a.key} className={`ans ${on ? "starred" : ""}`}>
                <div>{a.text}</div>
                <button
                  className="star"
                  aria-pressed={on}
                  aria-label="Star this answer"
                  onClick={() => toggleStar(a.key)}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill={on ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  >
                    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
                  </svg>
                </button>
              </div>
            );
          })
        ) : (
          <div className="empty">No answers to this question yet.</div>
        )}
      </div>
      <div className="open-foot">
        <span className="small muted">
          {list.length} answer{list.length === 1 ? "" : "s"} · {starredHere.length} starred
        </span>
        <button
          className="btn"
          id="copyStarred"
          disabled={!starredHere.length}
          onClick={copyStarred}
        >
          Copy starred
        </button>
      </div>
    </section>
  );
}
