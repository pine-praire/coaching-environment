// Серверные функции для участников опроса близких /blizkie. Без логина, вход по общему паролю.
// Тела запросов и ответов не логируются.
import { createServerFn } from "@tanstack/react-start";
import { ATTEMPT_DELAY_MS, sleep } from "@/server/comm-rate-limit";
import { callerKey } from "@/server/comm-guard.server";
import { obsLimiter } from "@/server/obs-guard.server";
import { obsRepo } from "@/server/obs-repo.server";
import * as svc from "@/server/obs-service";

const passthrough = (d: unknown) => d as { password?: unknown; payload?: unknown };

function logFailure(fn: string, err: unknown) {
  console.error(`[obs] ${fn} failed:`, err instanceof Error ? err.message : "unknown error");
}

export const checkObsPasswordFn = createServerFn({ method: "POST" })
  .inputValidator(passthrough)
  .handler(async ({ data }) => {
    const key = callerKey();
    await sleep(ATTEMPT_DELAY_MS);
    if (obsLimiter.isBlocked(key)) return { ok: false } as const;
    let res: Awaited<ReturnType<typeof svc.checkPassword>>;
    try {
      res = await svc.checkPassword(obsRepo(), data?.password);
    } catch (err) {
      logFailure("checkPassword", err);
      return { ok: false } as const;
    }
    if (!res.ok) obsLimiter.recordFailure(key);
    return res;
  });

export const submitObsResponseFn = createServerFn({ method: "POST" })
  .inputValidator(passthrough)
  .handler(async ({ data }) => {
    const key = callerKey();
    if (obsLimiter.isBlocked(key)) return { ok: false, error: "auth" } as const;
    let res: Awaited<ReturnType<typeof svc.submitResponse>>;
    try {
      res = await svc.submitResponse(obsRepo(), data?.password, data?.payload);
    } catch (err) {
      logFailure("submitResponse", err);
      // Ошибка, а не { ok: false }: страница предложит отправить ещё раз, ответы не потеряются.
      throw new Error("Service unavailable");
    }
    if (!res.ok && res.error === "auth") obsLimiter.recordFailure(key);
    return res;
  });
