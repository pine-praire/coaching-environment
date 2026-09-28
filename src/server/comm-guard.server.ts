// Состояние защиты от перебора на уровне экземпляра сервера.
import { getRequestIP } from "@tanstack/react-start/server";
import { FailureLimiter, limiterKey } from "./comm-rate-limit";

export const codeLimiter = new FailureLimiter();

// На Vercel X-Forwarded-For выставляет сама платформа. IP нигде не сохраняется: только хеш с солью в памяти.
export function callerKey(): string {
  return limiterKey(getRequestIP({ xForwardedFor: true }));
}
