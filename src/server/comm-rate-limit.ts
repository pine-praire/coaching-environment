// Мягкая защита от перебора кода. Счётчики живут только в памяти экземпляра сервера,
// ключ — хеш IP с солью, которая создаётся заново при каждом запуске. Ничего не записывается.
import { createHash, randomBytes } from "node:crypto";

export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;
export const ATTEMPT_DELAY_MS = 400;

const salt = randomBytes(16).toString("hex");

export function limiterKey(ip: string | null | undefined): string {
  return createHash("sha256")
    .update(salt + (ip || "unknown"))
    .digest("hex");
}

export class FailureLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private max = MAX_FAILURES,
    private windowMs = WINDOW_MS,
  ) {}

  private entry(key: string, now: number) {
    const e = this.hits.get(key);
    if (!e || e.resetAt <= now) return null;
    return e;
  }

  isBlocked(key: string, now = Date.now()): boolean {
    const e = this.entry(key, now);
    return !!e && e.count >= this.max;
  }

  recordFailure(key: string, now = Date.now()): void {
    const e = this.entry(key, now);
    if (e) e.count++;
    else this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
    if (this.hits.size > 10_000) this.prune(now);
  }

  private prune(now: number) {
    for (const [k, e] of this.hits) if (e.resetAt <= now) this.hits.delete(k);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
