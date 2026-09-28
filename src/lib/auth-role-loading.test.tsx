import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

let capturedCallback: ((u: unknown) => void) | null = null;
const mockGetDoc = vi.fn();

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    capturedCallback = cb;
    return () => {};
  },
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn().mockReturnValue("doc-ref"),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));
vi.mock("@/integrations/firebase/client", () => ({ auth: {}, db: {} }));

const { AuthProvider, useAuth } = await import("./auth");

function Probe() {
  const { loading, roleLoading, isAdmin } = useAuth();
  return <span data-testid="s">{`${loading}|${roleLoading}|${isAdmin}`}</span>;
}

describe("AuthProvider roleLoading", () => {
  it("stays true until user_roles is read, while loading is already false", async () => {
    let resolve!: (v: unknown) => void;
    mockGetDoc.mockReturnValue(new Promise((res) => (resolve = res)));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId("s").textContent).toBe("true|true|false");
    act(() => {
      capturedCallback!({ uid: "u1", displayName: null });
    });
    expect(screen.getByTestId("s").textContent).toBe("false|true|false");
    await act(async () => {
      resolve({ exists: () => true, data: () => ({ role: "admin" }) });
    });
    expect(screen.getByTestId("s").textContent).toBe("false|false|true");
  });

  it("is false right away for a signed-out visitor", () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    act(() => {
      capturedCallback!(null);
    });
    expect(screen.getByTestId("s").textContent).toBe("false|false|false");
  });
});
