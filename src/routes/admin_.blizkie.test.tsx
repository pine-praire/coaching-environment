import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { obsAnswer } from "@/test/obs-fixtures";

const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();
const fns = {
  listObsSurveysFn: vi.fn(),
  createObsSurveyFn: vi.fn(),
  updateObsSurveyFn: vi.fn(),
  deleteObsSurveyFn: vi.fn(),
  listObsResponsesFn: vi.fn(),
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

const VERA = { nom: "Вера", acc: "Веру", dat: "Вере", gender: "f" as const };
const OLEG = { nom: "Олег", acc: "Олега", dat: "Олегу", gender: "m" as const };
const SURVEYS = [
  { id: "s2", subject: OLEG, password: "oleg-pass", hasPassword: true, open: true, count: 0 },
  { id: "s1", subject: VERA, password: "vera-pass", hasPassword: true, open: true, count: 2 },
];
const RESPONSES = [
  { ...obsAnswer({ name: "Ольга", child: true, v: "often" }, "2026-10-01T10:00:00Z"), id: "r1" },
  { ...obsAnswer({ name: null }, "2026-10-02T10:00:00Z"), id: "r2" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { uid: "a" },
    loading: false,
    roleLoading: false,
    isAdmin: true,
  });
  fns.listObsSurveysFn.mockResolvedValue(SURVEYS);
  fns.listObsResponsesFn.mockImplementation(async ({ data }: { data: { surveyId: string } }) =>
    data.surveyId === "s1" ? RESPONSES : [],
  );
  fns.createObsSurveyFn.mockResolvedValue({ ok: true, surveyId: "s3" });
  fns.updateObsSurveyFn.mockResolvedValue({ ok: true });
  fns.deleteObsSurveyFn.mockResolvedValue({ ok: true });
  fns.deleteObsResponseFn.mockResolvedValue({ ok: true });
});

const openSurvey = async (name: string) => {
  const row = (await screen.findByText(name, { selector: "td" })).closest("tr")!;
  fireEvent.click(within(row).getByRole("button", { name: "Открыть" }));
};

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
    expect(fns.listObsSurveysFn).not.toHaveBeenCalled();
  });

  it("lists surveys with visible passwords and selects the newest", async () => {
    render(<Page />);
    expect(await screen.findByText("oleg-pass")).toBeTruthy();
    expect(screen.getByText("vera-pass")).toBeTruthy();
    expect(await screen.findByText("Настройки: Олег")).toBeTruthy();
    expect((screen.getByLabelText("Пароль") as HTMLInputElement).value).toBe("oleg-pass");
    expect(await screen.findByText("Ответы (0)")).toBeTruthy();
  });

  it("switches to another survey and shows its answers with its name", async () => {
    render(<Page />);
    await openSurvey("Вера");
    expect(await screen.findByText("Ответы (2)")).toBeTruthy();
    expect(fns.listObsResponsesFn).toHaveBeenLastCalledWith({ data: { surveyId: "s1" } });
    expect(screen.getByText("Блок Ж. Детство (ответили: 1)")).toBeTruthy();
    expect(screen.getByText("7. Опишите Веру тремя словами.")).toBeTruthy();
    expect(screen.getAllByText("Без имени №2").length).toBeGreaterThan(0);
  });

  it("creates a survey about a man", async () => {
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Новый опрос" }));
    const form = within(screen.getByRole("heading", { name: "Новый опрос" }).closest("section")!);
    fireEvent.click(form.getByRole("radio", { name: "Мужчина" }));
    fireEvent.change(form.getByLabelText("Кто? (Иван)"), { target: { value: "Иван" } });
    fireEvent.change(form.getByLabelText("Кого? (Ивана)"), { target: { value: "Ивана" } });
    fireEvent.change(form.getByLabelText("Кому? (Ивану)"), { target: { value: "Ивану" } });
    fireEvent.change(form.getByLabelText("Пароль для участников"), {
      target: { value: "ivan-pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Создать опрос" }));
    await waitFor(() =>
      expect(fns.createObsSurveyFn).toHaveBeenCalledWith({
        data: {
          subject: { nom: "Иван", acc: "Ивана", dat: "Ивану", gender: "m" },
          password: "ivan-pass",
        },
      }),
    );
  });

  it("shows why a password was rejected", async () => {
    fns.updateObsSurveyFn.mockResolvedValueOnce({ ok: false, error: "password_taken" });
    render(<Page />);
    await screen.findByText("Настройки: Олег");
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "vera-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Сменить пароль" }));
    expect(await screen.findByText(/Такой пароль уже у другого опроса/)).toBeTruthy();
    expect(fns.updateObsSurveyFn).toHaveBeenCalledWith({
      data: { surveyId: "s2", password: "vera-pass" },
    });
  });

  it("deletes a survey after confirmation", async () => {
    render(<Page />);
    await screen.findByText("Настройки: Олег");
    fireEvent.click(screen.getByRole("button", { name: "Удалить опрос" }));
    fireEvent.click(await screen.findByRole("button", { name: "Удалить" }));
    await waitFor(() =>
      expect(fns.deleteObsSurveyFn).toHaveBeenCalledWith({ data: { surveyId: "s2" } }),
    );
  });

  it("opens one person and deletes the answer after confirmation", async () => {
    render(<Page />);
    await openSurvey("Вера");
    await screen.findByText("Ответы (2)");
    const table = screen.getByText("Респондент").closest("table")!;
    fireEvent.click(within(table).getAllByRole("button", { name: "Открыть" })[0]);
    expect(await screen.findByText("Опрос близких: Вера")).toBeTruthy();
    expect(screen.getByText("Кем приходится Вере")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    fireEvent.click(await screen.findByRole("button", { name: "Удалить" }));
    await waitFor(() =>
      expect(fns.deleteObsResponseFn).toHaveBeenCalledWith({ data: { id: "r1" } }),
    );
  });
});
