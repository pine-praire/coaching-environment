import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { payloadSchema } from "@/lib/obs-schema";

const fns = { checkObsPasswordFn: vi.fn(), submitObsResponseFn: vi.fn() };

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (opts: unknown) => opts }));
vi.mock("@/functions/obs-public.functions", () => fns);
vi.mock("../styles/obs-survey.css?url", () => ({ default: "" }));

const { Route } = await import("./blizkie");
const Page = (Route as unknown as { component: React.ComponentType }).component;

const NAMES = { nom: "Вера", acc: "Веру", dat: "Вере", gender: "f" as const };
const OLEG = { nom: "Олег", acc: "Олега", dat: "Олегу", gender: "m" as const };
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: /Дальше|Начать|Войти|Отправить/ }));
const pick = (q: string, option: string) =>
  fireEvent.click(within(document.getElementById("q-" + q)!).getByRole("button", { name: option }));

async function login() {
  fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "secret-pass" } });
  fireEvent.change(screen.getByLabelText(/Ваше имя/), { target: { value: "Ольга" } });
  next();
  await screen.findByText("Спасибо, Ольга");
}

function fillAbout(child: "Да" | "Нет") {
  pick("relation", "Друг или подруга");
  fireEvent.change(screen.getByLabelText(/Сколько лет вы знаете/), {
    target: { value: "10" },
  });
  pick("frequency", "Раз в неделю");
  pick("places", "Дома");
  pick("child", child);
}

function answerAllOnScreen(option: string) {
  document.querySelectorAll(".q[id^='q-']").forEach((q) => {
    const btn = within(q as HTMLElement).queryByRole("button", { name: option });
    if (btn) fireEvent.click(btn);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn(); // в jsdom его нет
  localStorage.clear();
  fns.checkObsPasswordFn.mockResolvedValue({ ok: true, surveyId: "s1", subject: NAMES });
  fns.submitObsResponseFn.mockResolvedValue({ ok: true });
});

describe("/blizkie", () => {
  it("shows no name before the password and rejects a wrong one", async () => {
    fns.checkObsPasswordFn.mockResolvedValue({ ok: false });
    render(<Page />);
    expect(document.body.textContent).not.toContain(NAMES.nom);
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "nope" } });
    next();
    expect(await screen.findByText(/Пароль не подошёл/)).toBeTruthy();
  });

  it("walks the whole survey with childhood and sends a payload the server accepts", async () => {
    render(<Page />);
    await login();
    expect(document.body.textContent).toContain("какая Вера в обычной жизни");
    next(); // intro → about

    next(); // пустой экран не пускает дальше
    expect(screen.getByRole("alert").textContent).toMatch(/Осталось вопросов без ответа: 5/);
    fillAbout("Да");
    next(); // → start
    next(); // → блок А
    for (let b = 0; b < 4; b++) {
      answerAllOnScreen("Часто");
      next();
    }
    next(); // Д → Е
    fireEvent.change(screen.getByLabelText(/Что ещё важно знать/), {
      target: { value: "  Всё  " },
    });
    next(); // Е → детство 1
    pick("ages", "6–12 лет");
    answerAllOnScreen("Не помню");
    next();
    answerAllOnScreen("Редко");
    next();
    expect(screen.getByRole("button", { name: "Отправить" })).toBeTruthy();
    next();

    await screen.findByText("Спасибо!");
    const { password, payload } = fns.submitObsResponseFn.mock.calls[0][0].data;
    expect(password).toBe("secret-pass");
    const parsed = payloadSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(payload.name).toBe("Ольга");
    expect(payload.open.E4).toBe("Всё");
    expect(payload.child.scale.Z1).toEqual({ v: "unknown" });
    expect(localStorage.getItem("blizkie-draft")).toBeNull();
  });

  it("lets the next person on the same device start from scratch after sending", async () => {
    localStorage.setItem("blizkie-sent", "1"); // отметка из старой версии ничего не блокирует
    render(<Page />);
    await login();
    expect(screen.getByRole("heading", { name: "Спасибо, Ольга" })).toBeTruthy();
    expect(screen.queryByText("Спасибо!")).toBeNull();
  });

  it("asks «since when» only after often and skips childhood when not known", async () => {
    render(<Page />);
    await login();
    next();
    fillAbout("Нет");
    next();
    next();
    pick("A1", "Часто");
    expect(
      within(document.getElementById("q-A1")!).getByText("С какого времени это так?"),
    ).toBeTruthy();
    pick("A1", "Редко");
    expect(
      within(document.getElementById("q-A1")!).queryByText("С какого времени это так?"),
    ).toBeNull();
    expect(screen.getByText(/Шаг 4 из 9/)).toBeTruthy();
  });

  it("keeps a draft without the password and restores it after login", async () => {
    const { unmount } = render(<Page />);
    await login();
    next();
    fillAbout("Нет");
    await waitFor(() => expect(localStorage.getItem("blizkie-draft")).toContain("friend"));
    expect(localStorage.getItem("blizkie-draft")).not.toContain("secret-pass");
    unmount();

    render(<Page />);
    await waitFor(() =>
      expect((screen.getByLabelText(/Ваше имя/) as HTMLInputElement).value).toBe("Ольга"),
    );
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "secret-pass" } });
    next();
    expect(await screen.findByText("Немного о вас и вашем знакомстве")).toBeTruthy();
    expect(
      within(document.getElementById("q-relation")!)
        .getByRole("button", { name: "Друг или подруга" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("keeps answers when sending fails", async () => {
    fns.submitObsResponseFn.mockRejectedValue(new Error("network"));
    render(<Page />);
    await login();
    next();
    fillAbout("Нет");
    next();
    next();
    for (let b = 0; b < 4; b++) {
      answerAllOnScreen("Иногда");
      next();
    }
    next();
    next(); // Отправить
    expect(await screen.findByText(/Не получилось отправить ответы/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Отправить" })).toBeTruthy();
  });

  it("uses masculine forms for a man", async () => {
    fns.checkObsPasswordFn.mockResolvedValue({ ok: true, surveyId: "s2", subject: OLEG });
    render(<Page />);
    await login();
    expect(document.body.textContent).toContain("какой Олег в обычной жизни: как он общается");
    next();
    expect(screen.getByText("Где вы его чаще всего видите?")).toBeTruthy();
    fillAbout("Да");
    next();
    next();
    expect(screen.getByText(/выглядит вымотанным, ему нужно побыть одному/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[[\]|]/);
  });

  it("drops a draft that belongs to another survey but keeps the name", async () => {
    const { unmount } = render(<Page />);
    await login();
    next();
    fillAbout("Нет");
    await waitFor(() => expect(localStorage.getItem("blizkie-draft")).toContain('"s1"'));
    unmount();

    fns.checkObsPasswordFn.mockResolvedValue({ ok: true, surveyId: "s2", subject: OLEG });
    render(<Page />);
    await waitFor(() =>
      expect((screen.getByLabelText(/Ваше имя/) as HTMLInputElement).value).toBe("Ольга"),
    );
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "oleg-pass" } });
    next();
    expect(await screen.findByText("Спасибо, Ольга")).toBeTruthy();
    next();
    expect(
      within(document.getElementById("q-relation")!)
        .getByRole("button", { name: "Друг или подруга" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
