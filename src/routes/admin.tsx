import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/lib/auth";
import { getVerdict } from "@/lib/apgar";
import { ChevronDown, ChevronRight, Shield, Users, ClipboardList, TrendingUp, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  isAdmin: boolean;
}

interface AdminResult {
  id: string;
  userId: string;
  score: number;
  createdAt: string;
}

function AdminPage() {
  const { user, loading, isAdmin, roleLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [results, setResults] = useState<AdminResult[]>([]);
  const [fetching, setFetching] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || (user && roleLoading)) return;
    if (!user) { navigate({ to: "/auth", search: { mode: "login" } }); return; }
    if (!isAdmin) { navigate({ to: "/dashboard" }); return; }
  }, [loading, roleLoading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const fetchData = async () => {
      setFetching(true);
      try {
        const [usersSnap, resultsSnap, rolesSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "apgar_results")),
          getDocs(collection(db, "user_roles")),
        ]);

        const adminUids = new Set(
          rolesSnap.docs
            .filter((d) => d.data().role === "admin")
            .map((d) => d.id),
        );

        const userList: AdminUser[] = usersSnap.docs.map((d) => ({
          id: d.id,
          email: d.data().email ?? "",
          displayName: d.data().displayName ?? null,
          createdAt: d.data().createdAt ?? "",
          isAdmin: adminUids.has(d.id),
        }));
        userList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        const resultList: AdminResult[] = resultsSnap.docs.map((d) => ({
          id: d.id,
          userId: d.data().userId,
          score: d.data().score,
          createdAt: d.data().createdAt ?? "",
        }));
        resultList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        setUsers(userList);
        setResults(resultList);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        setFetching(false);
      }
    };

    fetchData();
  }, [user, isAdmin]);

  const toggleAdmin = async (u: AdminUser) => {
    if (u.isAdmin) {
      await deleteDoc(doc(db, "user_roles", u.id));
    } else {
      await setDoc(doc(db, "user_roles", u.id), { role: "admin" });
    }
    setUsers((prev) =>
      prev.map((p) => (p.id === u.id ? { ...p, isAdmin: !p.isAdmin } : p)),
    );
  };

  if (loading || roleLoading || !user || !isAdmin) return null;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const resultsByUser = results.reduce<Record<string, AdminResult[]>>((acc, r) => {
    (acc[r.userId] ??= []).push(r);
    return acc;
  }, {});

  const totalTests = results.length;
  const avgScore =
    results.length > 0
      ? Math.round((results.reduce((s, r) => s + r.score, 0) / results.length) * 10) / 10
      : 0;

  return (
    <div className="min-h-screen px-4 py-12" style={{ background: "var(--gradient-soft)" }}>
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Панель администратора</h1>
              <p className="text-sm text-muted-foreground">Пользователи и результаты</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/admin/communication" className="text-sm text-primary hover:underline">
              Опрос Communication Debugger →
            </Link>
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              ← На главную
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Users, label: "Пользователей", value: users.length },
            { icon: ClipboardList, label: "Тестов пройдено", value: totalTests },
            { icon: TrendingUp, label: "Средний балл", value: avgScore },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-4 rounded-2xl border bg-card p-5"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Users table */}
        <div className="rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold">Пользователи</h2>
          </div>

          {fetching ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">Загрузка...</div>
          ) : users.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">Нет пользователей</div>
          ) : (
            <ul>
              {users.map((u) => {
                const userResults = resultsByUser[u.id] ?? [];
                const latest = userResults[0];
                const isExpanded = expanded.has(u.id);

                return (
                  <li key={u.id} className="border-b last:border-0">
                    <div className="flex w-full items-center gap-4 px-6 py-4">
                      {/* Avatar */}
                      <button onClick={() => toggle(u.id)} className="flex items-center gap-4 flex-1 text-left min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-sm text-primary">
                          {(u.displayName ?? u.email).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium leading-tight">{u.displayName ?? "—"}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </button>

                      {/* Tests count */}
                      <div className="hidden shrink-0 text-right sm:block">
                        <p className="font-medium">{userResults.length}</p>
                        <p className="text-xs text-muted-foreground">
                          {userResults.length === 1 ? "тест" : userResults.length >= 2 && userResults.length <= 4 ? "теста" : "тестов"}
                        </p>
                      </div>

                      {/* Latest score */}
                      {latest ? <ScoreBadge score={latest.score} /> : (
                        <span className="shrink-0 text-xs text-muted-foreground">нет тестов</span>
                      )}

                      {/* Admin toggle */}
                      <Button
                        size="sm"
                        variant={u.isAdmin ? "destructive" : "outline"}
                        className="shrink-0 gap-1.5 text-xs"
                        onClick={() => toggleAdmin(u)}
                      >
                        {u.isAdmin ? <><UserX className="h-3.5 w-3.5" /> Убрать</> : <><UserCheck className="h-3.5 w-3.5" /> Админ</>}
                      </Button>

                      {/* Expand chevron */}
                      <button onClick={() => toggle(u.id)} className="shrink-0 text-muted-foreground">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Expanded: test history */}
                    {isExpanded && (
                      <div className="border-t bg-muted/30 px-6 py-3">
                        <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          История тестов
                        </p>
                        {userResults.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Тестов нет</p>
                        ) : (
                          <ul className="space-y-1">
                            {userResults.map((r) => {
                              const v = getVerdict(r.score);
                              return (
                                <li key={r.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-accent/40">
                                  <span className="text-muted-foreground">
                                    {new Date(r.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-muted-foreground">{v.short}</span>
                                    <ScoreBadge score={r.score} compact />
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Показаны все зарегистрированные пользователи · Firebase Firestore
        </p>
      </div>
    </div>
  );
}

function ScoreBadge({ score, compact = false }: { score: number; compact?: boolean }) {
  const v = getVerdict(score);
  const color = v.level === "good" ? "var(--success)" : v.level === "warning" ? "var(--warning)" : "var(--destructive)";
  return (
    <span className={`shrink-0 font-bold ${compact ? "text-lg" : "text-2xl"}`} style={{ color }}>
      {score}
      {!compact && <span className="text-xs font-normal text-muted-foreground">/10</span>}
    </span>
  );
}
