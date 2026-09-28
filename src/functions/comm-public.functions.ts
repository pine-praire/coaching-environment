// Серверные функции для участников опроса /comm. Без логина.
// Тела запросов и ответов не логируются.
import { createServerFn } from "@tanstack/react-start";
import { ATTEMPT_DELAY_MS, sleep } from "@/server/comm-rate-limit";
import { callerKey, codeLimiter } from "@/server/comm-guard.server";
import { commRepo } from "@/server/comm-repo.server";
import * as svc from "@/server/comm-service";

const passthrough = (d: unknown) => d as { code?: unknown; payload?: unknown };

export const checkCodeFn = createServerFn({ method: "POST" })
  .inputValidator(passthrough)
  .handler(async ({ data }) => {
    const key = callerKey();
    await sleep(ATTEMPT_DELAY_MS);
    if (codeLimiter.isBlocked(key)) return { ok: false } as const;
    const res = await svc.checkCode(commRepo(), data?.code);
    if (!res.ok) codeLimiter.recordFailure(key);
    return res;
  });

export const submitResponseFn = createServerFn({ method: "POST" })
  .inputValidator(passthrough)
  .handler(async ({ data }) => {
    const key = callerKey();
    if (codeLimiter.isBlocked(key)) return { ok: false } as const;
    const res = await svc.submitResponse(commRepo(), data?.code, data?.payload);
    if (!res.ok) codeLimiter.recordFailure(key);
    return res;
  });
