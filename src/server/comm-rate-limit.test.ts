import { describe, expect, it } from "vitest";
import { FailureLimiter, limiterKey } from "./comm-rate-limit";

describe("FailureLimiter", () => {
  it("blocks after the max number of failures within the window", () => {
    const l = new FailureLimiter(3, 1000);
    const k = limiterKey("203.0.113.5");
    l.recordFailure(k, 0);
    l.recordFailure(k, 10);
    expect(l.isBlocked(k, 20)).toBe(false);
    l.recordFailure(k, 30);
    expect(l.isBlocked(k, 40)).toBe(true);
  });

  it("unblocks after the window", () => {
    const l = new FailureLimiter(1, 1000);
    const k = limiterKey("203.0.113.5");
    l.recordFailure(k, 0);
    expect(l.isBlocked(k, 999)).toBe(true);
    expect(l.isBlocked(k, 1000)).toBe(false);
  });

  it("keys are per caller and never contain the IP", () => {
    const l = new FailureLimiter(1, 1000);
    const a = limiterKey("203.0.113.5");
    const b = limiterKey("198.51.100.7");
    l.recordFailure(a, 0);
    expect(l.isBlocked(b, 1)).toBe(false);
    expect(a).not.toContain("203.0.113.5");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
