import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/lib/auth";
import { APGAR_QUESTIONS, getVerdict, type ApgarKey } from "@/lib/apgar";

export const Route = createFileRoute("/result/$id")({
  component: ResultPage,
});

function ResultPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<{
    score: number;
    scores: Record<ApgarKey, number>;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notFound" | "error">("loading");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { mode: "login" } });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    setStatus("loading");
    getDoc(doc(db, "apgar_results", id))
      .then((snap) => {
        if (snap.exists()) {
          setData(snap.data() as { score: number; scores: Record<ApgarKey, number> });
          setStatus("ready");
        } else {
          setStatus("notFound");
        }
      })
      .catch(() => setStatus("error"));
  }, [id, user]);

  if (status !== "ready" || !data) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: "var(--gradient-soft)" }}
      >
        {status === "loading" ? (
          <div className="flex items-center gap-3 text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Загружаем результат…</span>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-muted-foreground">
              {status === "notFound"
                ? "Результат не найден."
                : "Не удалось загрузить результат. Попробуйте обновить страницу."}
            </p>
            <Link to="/dashboard" className="mt-4 inline-block text-primary underline">
              В личный кабинет
            </Link>
          </div>
        )}
      </div>
    );
  }
  const v = getVerdict(data.score);
  const accent =
    v.level === "good" ? "var(--success)" : v.level === "warning" ? "var(--warning)" : "var(--destructive)";

  return (
    <div className="min-h-screen px-4 py-12" style={{ background: "var(--gradient-soft)" }}>
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border bg-card p-10 text-center" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <p className="text-sm uppercase tracking-wider text-muted-foreground">Ваш результат</p>
          <div className="mt-4 text-8xl font-bold" style={{ color: accent }}>
            {data.score}
            <span className="text-3xl text-muted-foreground">/10</span>
          </div>
          <h2 className="mt-4 text-2xl font-bold">{v.title}</h2>
          <p className="mt-3 text-muted-foreground">{v.description}</p>
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-6">
          <h3 className="font-semibold">Расшифровка по параметрам</h3>
          <ul className="mt-4 space-y-3">
            {APGAR_QUESTIONS.map((q) => {
              const val = data.scores[q.key] ?? 0;
              const opt = q.options.find((o) => o.value === val);
              return (
                <li key={q.key} className="flex items-start gap-3 border-t pt-3 first:border-0 first:pt-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent font-bold text-primary">
                    {q.letter}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{q.title}</p>
                    <p className="text-sm text-muted-foreground">{opt?.label}</p>
                  </div>
                  <span
                    className="text-2xl font-bold"
                    style={{ color: val === 2 ? "var(--success)" : val === 1 ? "var(--warning)" : "var(--destructive)" }}
                  >
                    {val}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild className="flex-1">
            <Link to="/test">Пройти снова</Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link to="/dashboard">На главную</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
