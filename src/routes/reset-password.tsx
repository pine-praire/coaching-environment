import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/integrations/firebase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>) => ({
    oobCode: typeof s.oobCode === "string" ? s.oobCode : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { oobCode } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!oobCode) return;
    verifyPasswordResetCode(auth, oobCode)
      .then(() => setReady(true))
      .catch(() => toast.error("Ссылка недействительна или устарела"));
  }, [oobCode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Пароли не совпадают");
      return;
    }
    if (!oobCode) return;
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      toast.success("Пароль успешно изменён");
      navigate({ to: "/auth", search: { mode: "login" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--gradient-soft)" }}
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-8" style={{ boxShadow: "var(--shadow-elegant)" }}>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← На главную
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Новый пароль</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Введите новый пароль для вашего аккаунта
        </p>

        {!oobCode || !ready ? (
          <p className="mt-6 text-sm text-muted-foreground">Проверка ссылки...</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="password">Новый пароль</Label>
              <PasswordInput id="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="confirm">Повторите пароль</Label>
              <PasswordInput id="confirm" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "..." : "Сохранить пароль"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
