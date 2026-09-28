// Серверные функции для участников опроса /comm. Без логина.
// Тела запросов и ответов не логируются.
import { createServerFn } from "@tanstack/react-start";
import { ATTEMPT_DELAY_MS, sleep } from "@/server/comm-rate-limit";
import { callerKey, codeLimiter } from "@/server/comm-guard.server";
import { commRepo } from "@/server/comm-repo.server";
import * as svc from "@/server/comm-service";

const passthrough = (d: unknown) => d as { code?: unknown; payload?: unknown };

// Сбой хранилища не должен раскрывать участнику внутренние сообщения (они уходят в браузер).
// В лог пишется только текст ошибки, без тела запроса.
function logFailure(fn: string, err: unknown) {
  console.error(`[comm] ${fn} failed:`, err instanceof Error ? err.message : "unknown error");
}

export const checkCodeFn = createServerFn({ method: "POST" })
  .inputValidator(passthrough)
  .handler(async ({ data }) => {
    const key = callerKey();
    await sleep(ATTEMPT_DELAY_MS);
    if (codeLimiter.isBlocked(key)) return { ok: false } as const;
    let res: Awaited<ReturnType<typeof svc.checkCode>>;
    try {
      res = await svc.checkCode(commRepo(), data?.code);
    } catch (err) {
      logFailure("checkCode", err);
      return { ok: false } as const;
    }
    if (!res.ok) codeLimiter.recordFailure(key);
    return res;
  });

export const submitResponseFn = createServerFn({ method: "POST" })
  .inputValidator(passthrough)
  .handler(async ({ data }) => {
    const key = callerKey();
    if (codeLimiter.isBlocked(key)) return { ok: false } as const;
    let res: Awaited<ReturnType<typeof svc.submitResponse>>;
    try {
      res = await svc.submitResponse(commRepo(), data?.code, data?.payload);
    } catch (err) {
      logFailure("submitResponse", err);
      // Ошибка, а не { ok: false }: страница покажет «Couldn’t send… try again», а не «опрос закрыт».
      throw new Error("Service unavailable");
    }
    if (!res.ok) codeLimiter.recordFailure(key);
    return res;
  });
