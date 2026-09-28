import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const mockGetDoc = vi.fn();
const mockUseAuth = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: object) => ({ ...opts, useParams: () => ({ id: "r1" }) }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn().mockReturnValue("doc-ref"),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));
vi.mock("@/integrations/firebase/client", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useAuth: () => mockUseAuth() }));

const { Route } = await import("./result.$id");
const Page = (Route as unknown as { component: React.ComponentType }).component;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: "u1" }, loading: false });
});

describe("/result/$id", () => {
  it("shows a loading indicator instead of a blank page", () => {
    mockGetDoc.mockReturnValue(new Promise(() => {}));
    render(<Page />);
    expect(screen.getByRole("status")).toHaveTextContent("Загружаем результат…");
  });

  it("shows a message when the result does not exist", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    render(<Page />);
    expect(await screen.findByText("Результат не найден.")).toBeInTheDocument();
    expect(screen.getByText("В личный кабинет")).toHaveAttribute("href", "/dashboard");
  });

  it("shows an error message when loading fails", async () => {
    mockGetDoc.mockRejectedValue(new Error("permission-denied"));
    render(<Page />);
    expect(
      await screen.findByText("Не удалось загрузить результат. Попробуйте обновить страницу."),
    ).toBeInTheDocument();
  });

  it("renders the score when loaded", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ score: 5, scores: { a: 1, p: 1, g: 1, ar: 1, r: 1 } }),
    });
    render(<Page />);
    expect(await screen.findByText("Ваш результат")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
