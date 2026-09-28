import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { OPEN, QUICK, QUICK_MAX, SCALE, ZONES, type OpenId } from "@/lib/comm-survey";
import { checkCodeFn, submitResponseFn } from "@/functions/comm-public.functions";
import surveyCss from "../styles/comm-survey.css?url";

export const Route = createFileRoute("/comm")({
  head: () => ({
    meta: [
      { title: "Communication Debugger" },
      { name: "description", content: "communication test" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "stylesheet", href: surveyCss }],
  }),
  component: CommSurvey,
});

type Step = "code" | "intro" | "zone" | "quick" | "open" | "done";

const TOTAL_STEPS = ZONES.length + 2; // зоны + быстрый выбор + открытые вопросы

// Мягкая защита от повторной отправки: только waveId и отметка «отправлено».
const doneKey = (waveId: string) => `comm-sent:${waveId}`;
function wasSent(waveId: string) {
  try {
    return localStorage.getItem(doneKey(waveId)) === "1";
  } catch {
    return false;
  }
}
function markSent(waveId: string) {
  try {
    localStorage.setItem(doneKey(waveId), "1");
  } catch {
    /* хранилище недоступно: просто не запоминаем */
  }
}

function Header({ stepNo, name }: { stepNo: number; name: string }) {
  const pct = Math.round((stepNo / TOTAL_STEPS) * 100);
  return (
    <>
      <div className="progress-row">
        <span className="zone-name">{name}</span>
        <span>
          {stepNo} of {TOTAL_STEPS}
        </span>
      </div>
      <div className="bar">
        <i style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

function CommSurvey() {
  const [step, setStep] = useState<Step>("code");
  const [zoneIdx, setZoneIdx] = useState(0);
  const [code, setCode] = useState("");
  const [waveId, setWaveId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [quick, setQuick] = useState<string[]>([]);
  const [quickOther, setQuickOther] = useState("");
  const [open, setOpen] = useState<Record<OpenId, string>>({
    ambiguous_phrase: "",
    where_it_breaks: "",
    one_rule: "",
  });
  const [showMissing, setShowMissing] = useState(false);

  const go = (next: Step, z?: number) => {
    setStep(next);
    if (z !== undefined) setZoneIdx(z);
    setShowMissing(false);
    try {
      window.scrollTo(0, 0);
    } catch {
      /* ignore */
    }
  };

  const buildPayload = () => {
    const r: Record<string, number | null> = {};
    ZONES.forEach((z) => z.questions.forEach((q) => (r[q.n] = ratings[q.n] ?? null)));
    const trim = (s: string) => (s || "").trim() || null;
    return {
      version: 1 as const,
      ratings: r,
      quick,
      quickOther: quick.includes("other") ? trim(quickOther) : null,
      open: {
        ambiguous_phrase: trim(open.ambiguous_phrase),
        where_it_breaks: trim(open.where_it_breaks),
        one_rule: trim(open.one_rule),
      },
    };
  };

  return (
    <div className="comm-survey" lang="en">
      <main className="wrap">
        {step === "code" && (
          <CodeScreen
            initial={code}
            onOk={(val, id) => {
              setCode(val);
              setWaveId(id);
              go(wasSent(id) ? "done" : "intro");
            }}
          />
        )}
        {step === "intro" && <IntroScreen onStart={() => go("zone", 0)} />}
        {step === "zone" && (
          <ZoneScreen
            zoneIdx={zoneIdx}
            ratings={ratings}
            showMissing={showMissing}
            setShowMissing={setShowMissing}
            onRate={(n, v) => setRatings((prev) => ({ ...prev, [n]: v }))}
            onBack={() => (zoneIdx === 0 ? go("intro") : go("zone", zoneIdx - 1))}
            onNext={() => (zoneIdx < ZONES.length - 1 ? go("zone", zoneIdx + 1) : go("quick"))}
          />
        )}
        {step === "quick" && (
          <QuickScreen
            quick={quick}
            quickOther={quickOther}
            setQuick={setQuick}
            setQuickOther={setQuickOther}
            onBack={() => go("zone", ZONES.length - 1)}
            onNext={() => go("open")}
          />
        )}
        {step === "open" && (
          <OpenScreen
            open={open}
            setOpen={setOpen}
            onBack={() => go("quick")}
            onSend={async () => {
              const res = await submitResponseFn({ data: { code, payload: buildPayload() } });
              if (res.ok && waveId) markSent(waveId);
              return res.ok;
            }}
            onDone={() => go("done")}
          />
        )}
        {step === "done" && <DoneScreen />}
      </main>
    </div>
  );
}

function CodeScreen({
  initial,
  onOk,
}: {
  initial: string;
  onOk: (code: string, waveId: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const tryCode = async () => {
    if (busy) return;
    const val = value.trim();
    if (!val) {
      setErr("Please enter the code.");
      return;
    }
    setBusy(true);
    setErr("");
    let res: { ok: boolean; waveId?: string } = { ok: false };
    try {
      res = await checkCodeFn({ data: { code: val } });
    } catch {
      res = { ok: false };
    }
    setBusy(false);
    if (!res.ok || !res.waveId) {
      setErr("This code didn’t work. Check the spelling or ask the organiser.");
      return;
    }
    onOk(val, res.waveId);
  };

  return (
    <>
      <div className="brand">Communication Debugger</div>
      <h1>Workplace communication survey</h1>
      <div className="card">
        <div id="codeForm">
          <label htmlFor="code" className="lead" style={{ display: "block", marginBottom: 12 }}>
            Enter the access code you received
          </label>
          <input
            ref={inputRef}
            id="code"
            className="code-input"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                tryCode();
              }
            }}
          />
          <div className="err" id="codeErr" role="alert">
            {err}
          </div>
          <div className="nav">
            <button className="btn" type="button" id="codeBtn" disabled={busy} onClick={tryCode}>
              Continue
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <>
      <div className="brand">Communication Debugger</div>
      <h1>Workplace communication survey</h1>
      <div className="card">
        <p className="lead">
          This survey helps us understand how you see communication in your team. It is completely
          anonymous. The data will be used only to make the training on 8 October as useful as
          possible for your team specifically.
        </p>
        <p>
          Answer based on how things usually happen in your actual work, not how they “should” be.
        </p>
        <p>
          <b>The survey is anonymous.</b>
        </p>
        <p className="muted small" style={{ marginTop: 20, marginBottom: 0 }}>
          Scale
        </p>
        <ul className="scale">
          {SCALE.map((s) => (
            <li key={s.v}>
              <b>{s.v}</b>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
        <div className="nav">
          <button className="btn" id="start" onClick={onStart}>
            Start
          </button>
        </div>
      </div>
    </>
  );
}

function ZoneScreen(props: {
  zoneIdx: number;
  ratings: Record<number, number>;
  showMissing: boolean;
  setShowMissing: (v: boolean) => void;
  onRate: (n: number, v: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { zoneIdx, ratings, showMissing } = props;
  const z = ZONES[zoneIdx];
  const missing = z.questions.filter((q) => !ratings[q.n]);
  const [scrollTo, setScrollTo] = useState<number | null>(null);

  useEffect(() => {
    if (scrollTo === null) return;
    document
      .querySelector(`.q[data-q="${scrollTo}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setScrollTo(null);
  }, [scrollTo]);

  return (
    <>
      <Header stepNo={zoneIdx + 1} name={`${zoneIdx + 1}. ${z.title}`} />
      <div className="card">
        {z.questions.map((q) => (
          <div
            key={q.n}
            className={`q ${showMissing && !ratings[q.n] ? "missing" : ""}`}
            data-q={q.n}
          >
            <div className="q-text" id={`qt${q.n}`}>
              <span className="q-num">{q.n}.</span>
              {q.text}
            </div>
            <div className="opts" role="group" aria-labelledby={`qt${q.n}`}>
              {SCALE.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  className="opt"
                  aria-pressed={ratings[q.n] === s.v}
                  onClick={() => props.onRate(q.n, s.v)}
                >
                  <span className="n">{s.v}</span>
                  <span className="l">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="err" id="zoneErr" role="alert">
          {showMissing && missing.length ? "Please answer all the questions in this section." : ""}
        </div>
        <div className="nav">
          <button className="btn ghost" id="back" onClick={props.onBack}>
            Back
          </button>
          <button
            className="btn"
            id="next"
            onClick={() => {
              if (missing.length) {
                props.setShowMissing(true);
                setScrollTo(missing[0].n);
                return;
              }
              props.onNext();
            }}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}

function QuickScreen(props: {
  quick: string[];
  quickOther: string;
  setQuick: (q: string[]) => void;
  setQuickOther: (s: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const sel = props.quick;
  const full = sel.length >= QUICK_MAX;
  const otherRef = useRef<HTMLInputElement>(null);
  const [focusOther, setFocusOther] = useState(false);

  useEffect(() => {
    if (focusOther) {
      otherRef.current?.focus();
      setFocusOther(false);
    }
  }, [focusOther]);

  return (
    <>
      <Header stepNo={ZONES.length + 1} name="9. Quick pick" />
      <div className="card">
        <h2>
          Choose up to 3 things that currently cause the most communication problems in the team
        </h2>
        <div className="chips" role="group">
          {QUICK.map((o) => {
            const on = sel.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                className="chip"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => {
                  const next = on ? sel.filter((x) => x !== o.id) : [...sel, o.id];
                  props.setQuick(next);
                  if (o.id === "other" && !next.includes("other")) props.setQuickOther("");
                  if (o.id === "other" && next.includes("other")) setFocusOther(true);
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <div className={`other-box ${sel.includes("other") ? "on" : ""}`}>
          <input
            ref={otherRef}
            type="text"
            id="other"
            placeholder="What exactly?"
            maxLength={300}
            value={props.quickOther}
            onChange={(e) => props.setQuickOther(e.target.value)}
          />
        </div>
        <div className="counter">
          {sel.length} of {QUICK_MAX} selected. You can skip this.
        </div>
        <div className="nav">
          <button className="btn ghost" id="back" onClick={props.onBack}>
            Back
          </button>
          <button className="btn" id="next" onClick={props.onNext}>
            Next
          </button>
        </div>
      </div>
    </>
  );
}

function OpenScreen(props: {
  open: Record<OpenId, string>;
  setOpen: (fn: (prev: Record<OpenId, string>) => Record<OpenId, string>) => void;
  onBack: () => void;
  onSend: () => Promise<boolean>;
  onDone: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  const send = async () => {
    setSending(true);
    setErr("");
    let ok: boolean;
    try {
      ok = await props.onSend();
    } catch {
      setSending(false);
      setErr("Couldn’t send your answers. Check your connection and try again.");
      return;
    }
    if (!ok) {
      setSending(false);
      setErr("This survey is no longer accepting answers.");
      return;
    }
    props.onDone();
  };

  return (
    <>
      <Header stepNo={ZONES.length + 2} name="10. Three open questions" />
      <div className="card">
        <p className="muted small" style={{ margin: 0 }}>
          Optional, but very valuable. Write in your own words, as it is.
        </p>
        {OPEN.map((q) => (
          <div key={q.id} className="open-q">
            <label htmlFor={`o_${q.id}`}>
              <span className="q-num">{q.n}.</span>
              {q.text}
            </label>
            <div className="hint">{q.hint ?? ""}</div>
            <textarea
              id={`o_${q.id}`}
              maxLength={2000}
              value={props.open[q.id]}
              onChange={(e) => {
                const v = e.target.value;
                props.setOpen((prev) => ({ ...prev, [q.id]: v }));
              }}
            />
          </div>
        ))}
        <div className="err" id="sendErr" role="alert">
          {err}
        </div>
        <div className="nav">
          <button className="btn ghost" id="back" onClick={props.onBack}>
            Back
          </button>
          <button className="btn" id="send" disabled={sending} onClick={send}>
            {sending ? "Sending…" : "Send answers"}
          </button>
        </div>
      </div>
    </>
  );
}

function DoneScreen() {
  return (
    <>
      <div className="brand">Communication Debugger</div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="done-icon" aria-hidden="true">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h2>Thank you, your answers have been received</h2>
        <p className="muted" style={{ margin: 0 }}>
          Results will only be seen in aggregate, never linked to individuals. You can close this
          page.
        </p>
      </div>
    </>
  );
}
