import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import type { CommAnswer } from "@/lib/comm-analysis";

const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();
const fns = {
  listWavesFn: vi.fn(),
  getWaveResultsFn: vi.fn(),
  createWaveFn: vi.fn(),
  updateWaveFn: vi.fn(),
  setStarFn: vi.fn(),
};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  useNavigate: () => mockNavigate,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/functions/comm-admin.functions", () => fns);

const { Route } = await import("./admin_.communication");
const Page = (Route as unknown as { component: React.ComponentType }).component;

function answer(i: number): CommAnswer {
  const ratings: Record<string, number> = {};
  for (let n = 1; n <= 34; n++) ratings[String(n)] = n === 6 ? (i % 2 ? 1 : 5) : 4;
  return {
    key: i.toString(16).padStart(16, "0"),
    ratings,
    quick: i % 2 ? ["unclear_tasks", "other"] : ["unclear_tasks"],
    quickOther: i % 2 ? `Other ${i}` : null,
    open: {
      ambiguous_phrase: `Phrase ${i}`,
      where_it_breaks: null,
      one_rule: i < 2 ? `Rule ${i}` : null,
    },
  };
}

const WAVE = {
  id: "w1",
  name: "Team Alpha · before training",
  code: "ALPHA-OCT",
  open: true,
  count: 6,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: "admin" }, loading: false, isAdmin: true });
  fns.listWavesFn.mockResolvedValue([WAVE]);
  fns.getWaveResultsFn.mockResolvedValue({
    locked: false,
    count: 6,
    answers: Array.from({ length: 6 }, (_, i) => answer(i)),
    starred: [`${"0".repeat(15)}1_ambiguous_phrase`],
  });
  fns.setStarFn.mockResolvedValue({ ok: true });
  fns.updateWaveFn.mockResolvedValue({ ok: true });
  fns.createWaveFn.mockResolvedValue({ ok: true, waveId: "w2" });
});

describe("/admin/communication", () => {
  it("redirects a non-admin and renders nothing", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "u" }, loading: false, isAdmin: false });
    const { container } = render(<Page />);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
    expect(container.innerHTML).toBe("");
    expect(fns.listWavesFn).not.toHaveBeenCalled();
  });

  it("redirects a guest to login", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false, isAdmin: false });
    render(<Page />);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/auth", search: { mode: "login" } });
  });

  it("renders all blocks from server data", async () => {
    render(<Page />);
    await screen.findByText("Team profile");
    expect(screen.getByText("ALPHA-OCT")).toBeInTheDocument();
    expect(screen.getByText("Where the team sees things differently")).toBeInTheDocument();
    expect(screen.getByText("Top problems (quick pick)")).toBeInTheDocument();
    expect(screen.getByText("All questions")).toBeInTheDocument();
    expect(screen.getByText("Open answers")).toBeInTheDocument();
    // вопрос 6: половина ответила 1, половина 5 → split
    const splitCard = screen
      .getByText("Where the team sees things differently")
      .closest("section")!;
    expect(
      within(splitCard).getByText(/It can be hard for me to tell how urgent/),
    ).toBeInTheDocument();
    expect(screen.getByText("Other 1")).toBeInTheDocument();
    expect(screen.getByText("6 answers · 1 starred")).toBeInTheDocument();
  });

  it("with no responses shows only the count", async () => {
    fns.listWavesFn.mockResolvedValue([{ ...WAVE, count: 0 }]);
    fns.getWaveResultsFn.mockResolvedValue({ locked: true, count: 0 });
    render(<Page />);
    await screen.findByText("responses so far");
    expect(
      screen.getByText("Results will appear here after the first response."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Team profile")).not.toBeInTheDocument();
    expect(screen.getByText("Download all answers (CSV)")).toBeDisabled();
  });

  it("star toggles through setStar and survives in state", async () => {
    render(<Page />);
    await screen.findByText("Open answers");
    const stars = screen.getAllByLabelText("Star this answer");
    const firstUnstarred = stars.find((s) => s.getAttribute("aria-pressed") === "false")!;
    fireEvent.click(firstUnstarred);
    await waitFor(() => expect(fns.setStarFn).toHaveBeenCalledTimes(1));
    const call = fns.setStarFn.mock.calls[0][0].data;
    expect(call).toMatchObject({ waveId: "w1", starred: true });
    expect(call.key).toMatch(/^[0-9a-f]{16}_ambiguous_phrase$/);
    expect(screen.getByText("6 answers · 2 starred")).toBeInTheDocument();
  });

  it("close the survey calls updateWave(open: false)", async () => {
    render(<Page />);
    fireEvent.click(await screen.findByText("Close the survey"));
    await waitFor(() =>
      expect(fns.updateWaveFn).toHaveBeenCalledWith({ data: { waveId: "w1", open: false } }),
    );
  });

  it("change code warns and calls updateWave(code)", async () => {
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Change code" }));
    expect(
      screen.getByText(/The old code ALPHA-OCT will stop working immediately/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New access code"), { target: { value: "alpha-nov" } });
    const buttons = screen.getAllByRole("button", { name: "Change code" });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(fns.updateWaveFn).toHaveBeenCalledWith({ data: { waveId: "w1", code: "alpha-nov" } }),
    );
  });

  it("new run form calls createWave and shows server errors", async () => {
    fns.createWaveFn.mockResolvedValueOnce({ ok: false, error: "code_taken" });
    render(<Page />);
    fireEvent.click(await screen.findByText("+ New run"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Team Beta" } });
    fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "ALPHA-OCT" } });
    fireEvent.click(screen.getByText("Create"));
    await screen.findByText("This code is already used by another run.");
    expect(fns.createWaveFn).toHaveBeenCalledWith({
      data: { name: "Team Beta", code: "ALPHA-OCT" },
    });
  });

  it("copies the link and the code separately", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Page />);
    fireEvent.click(await screen.findByText("Copy link"));
    expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/comm`);
    fireEvent.click(screen.getByText("Copy code"));
    expect(writeText).toHaveBeenLastCalledWith("ALPHA-OCT");
  });

  it("waits for the admin role on page reload instead of redirecting", () => {
    mockUseAuth.mockReturnValue({
      user: { uid: "admin" },
      loading: false,
      isAdmin: false,
      roleLoading: true,
    });
    const { container } = render(<Page />);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });
});
