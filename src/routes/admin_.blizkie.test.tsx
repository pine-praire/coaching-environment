import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { obsAnswer } from "@/test/obs-fixtures";

const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();
const fns = {
  getObsSettingsFn: vi.fn(),
  listObsResponsesFn: vi.fn(),
  updateObsSettingsFn: vi.fn(),
  deleteObsResponseFn: vi.fn(),
};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  useNavigate: () => mockNavigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/functions/obs-admin.functions", () => fns);

const { Route } = await import("./admin_.blizkie");
const Page = (Route as unknown as { component: React.ComponentType }).component;

const NAMES = { nom: "Вера", acc: "Веру", dat: "Вере" };

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { uid: "a" },
    loading: false,
    roleLoading: false,
    isAdmin: true,
  });
  fns.getObsSettingsFn.mockResolvedValue({ names: NAMES, open: true, hasPassword: true });
  fns.listObsResponsesFn.mockResolvedValue([
    { ...obsAnswer({ name: "Ольга", child: true, v: "often" }, "2026-10-01T10:00:00Z"), id: "r1" },
    { ...obsAnswer({ name: null }, "2026-10-02T10:00:00Z"), id: "r2" },
  ]);
  fns.updateObsSettingsFn.mockResolvedValue({ ok: true });
  fns.deleteObsResponseFn.mockResolvedValue({ ok: true });
});

describe("/admin/blizkie", () => {
  it("redirects non-admins and loads nothing", async () => {
    mockUseAuth.mockReturnValue({
      user: { uid: "u" },
      loading: false,
      roleLoading: false,
      isAdmin: false,
    });
    render(<Page />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" }));
    expect(fns.listObsResponsesFn).not.toHaveBeenCalled();
  });

  it("lists respondents, summary and open answers", async () => {
    render(<Page />);
    expect(await screen.findByText("Ответы (2)")).toBeTruthy();
    expect(screen.getAllByText("Ольга").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Без имени №2").length).toBeGreaterThan(0);
    expect(screen.getByText("Блок Ж. Детство (ответили: 1)")).toBeTruthy();
    expect(screen.getByText("7. Опишите Веру тремя словами.")).toBeTruthy();
  });

  it("changes the password and validates its length on the server reply", async () => {
    fns.updateObsSettingsFn.mockResolvedValueOnce({ ok: false, error: "invalid_password" });
    render(<Page />);
    await screen.findByText("Ответы (2)");
    fireEvent.change(screen.getByLabelText("Новый пароль"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Сменить пароль" }));
    expect(await screen.findByText(/не короче 8 символов/)).toBeTruthy();
    expect(fns.updateObsSettingsFn).toHaveBeenCalledWith({ data: { password: "short" } });
  });

  it("opens one person and deletes the answer after confirmation", async () => {
    render(<Page />);
    await screen.findByText("Ответы (2)");
    fireEvent.click(screen.getAllByRole("button", { name: "Открыть" })[0]);
    expect(await screen.findByText("Опрос близких: Вера")).toBeTruthy();
    expect(screen.getByText("Кем приходится Вере")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    fireEvent.click(await screen.findByRole("button", { name: "Удалить" }));
    await waitFor(() =>
      expect(fns.deleteObsResponseFn).toHaveBeenCalledWith({ data: { id: "r1" } }),
    );
  });
});
