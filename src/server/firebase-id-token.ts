// Проверка Firebase ID token без firebase-admin/auth: тот тянет jwks-rsa -> jose (только ESM),
// а загрузчик функций Vercel не поддерживает require() ESM-модулей, и функция падает при импорте.
// Алгоритм — из документации Firebase «Verify ID tokens using a third-party JWT library».
import { createPublicKey, verify } from "node:crypto";

export const FIREBASE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

// Допуск на расхождение часов между серверами, секунды.
const CLOCK_SKEW_S = 60;
// Реальные ID token ~1 КБ; всё сильно больше отбрасываем до разбора.
const MAX_TOKEN_LENGTH = 4096;
const FETCH_TIMEOUT_MS = 5000;
// Незнакомый kid может означать ротацию ключей: перезапрос не чаще раза в минуту.
const FORCED_REFRESH_INTERVAL_MS = 60_000;

export type Certs = Record<string, string>;
export type CertsFetcher = (forceRefresh: boolean) => Promise<Certs>;

// Кэш сертификатов Google. Фабрика нужна для тестов; в коде используется один общий экземпляр.
export function createCertsFetcher(
  load: () => Promise<{ certs: Certs; maxAgeS: number }> = loadFromGoogle,
  now: () => number = Date.now,
): CertsFetcher {
  let cached: { certs: Certs; expiresAt: number } | null = null;
  let inflight: Promise<Certs> | null = null;
  let lastForced = -Infinity;

  return async (forceRefresh) => {
    const t = now();
    if (cached && cached.expiresAt > t) {
      if (!forceRefresh || t - lastForced < FORCED_REFRESH_INTERVAL_MS) return cached.certs;
      lastForced = t;
    }
    // Кэш пуст или истёк, либо разрешён внеочередной перезапрос. Параллельные вызовы ждут один запрос.
    if (!inflight) {
      inflight = load()
        .then(({ certs, maxAgeS }) => {
          cached = { certs, expiresAt: now() + Math.max(0, maxAgeS) * 1000 };
          return certs;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };
}

async function loadFromGoogle(): Promise<{ certs: Certs; maxAgeS: number }> {
  const res = await fetch(FIREBASE_CERTS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`certs fetch failed: ${res.status}`);
  const body: unknown = await res.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("certs: bad body");
  const certs: Certs = {};
  for (const [kid, pem] of Object.entries(body)) if (typeof pem === "string") certs[kid] = pem;
  const maxAgeS = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 0);
  return { certs, maxAgeS };
}

export const fetchFirebaseCerts: CertsFetcher = createCertsFetcher();

const B64URL = /^[A-Za-z0-9_-]+$/;

function decodeSegment(seg: string): Record<string, unknown> | null {
  if (!B64URL.test(seg)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function certFor(certs: Certs, kid: string): string | null {
  return Object.hasOwn(certs, kid) && typeof certs[kid] === "string" ? certs[kid] : null;
}

/**
 * Возвращает uid, если токен выпущен Firebase Auth этого проекта, подписан действующим ключом Google
 * и его срок не истёк (с допуском 60 с). Иначе null. Отзыв токенов и блокировка пользователя в Auth
 * не проверяются, как и у verifyIdToken без checkRevoked: токен живёт не больше часа, а роль admin
 * перечитывается из user_roles при каждом запросе.
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  getCerts: CertsFetcher = fetchFirebaseCerts,
  nowMs: number = Date.now(),
): Promise<string | null> {
  if (!projectId || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  if (!B64URL.test(s)) return null;

  const header = decodeSegment(h);
  const payload = decodeSegment(p);
  if (!header || !payload) return null;
  if (header.alg !== "RS256" || typeof header.kid !== "string" || "crit" in header) return null;

  const now = Math.floor(nowMs / 1000);
  const { exp, iat, auth_time: authTime, aud, iss, sub } = payload;
  if (!isNum(exp) || exp + CLOCK_SKEW_S <= now) return null;
  if (!isNum(iat) || iat - CLOCK_SKEW_S > now) return null;
  if (!isNum(authTime) || authTime - CLOCK_SKEW_S > now) return null;
  if (aud !== projectId) return null;
  if (iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof sub !== "string" || sub.length === 0 || sub.length > 128) return null;

  const pem =
    certFor(await getCerts(false), header.kid) ?? certFor(await getCerts(true), header.kid);
  if (!pem) return null;
  try {
    const ok = verify(
      "RSA-SHA256",
      Buffer.from(`${h}.${p}`),
      createPublicKey(pem),
      Buffer.from(s, "base64url"),
    );
    return ok ? sub : null;
  } catch {
    return null;
  }
}
