import { createPublicKey, createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCertsFetcher, verifyFirebaseIdToken } from "./firebase-id-token";

// Ключ для подписи создаётся на лету; «сертификат» — его публичная часть в PEM.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
// Публичный самоподписанный x509-сертификат: в таком виде Google отдаёт ключи.
const X509_FIXTURE = `-----BEGIN CERTIFICATE-----
MIICpjCCAY4CCQCj5HFFWFSovjANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAl0
ZXN0LW9ubHkwIBcNMjYwOTI4MTU0NjAxWhgPMjEyNjA5MDQxNTQ2MDFaMBQxEjAQ
BgNVBAMMCXRlc3Qtb25seTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEB
ANq7bhyU3Ufi36sivG/bbGlE/EkT8c3QQ58bNR81f8uinnG3S2V0KYEXmE9jARl9
cwlnyzaD1o7hDW3rCH2w8+1ZbYnhV4IXyDslP6H+dIBXlLcMtPGA+8Fbk0vBFhDB
VOFWOp2vBSKneYCqLFF0fZC81WL5ti5PCPtfYU4VoII6t5RXadh0JnOeb5kry5KH
a3jLEHMACl2APbTIZbQmZvNcQCCwicoh2idtC8InM2FtB5dLxX0gSYB1fKkR5bri
d+33xm70YUb2Qk66QdDxp4YHcPVC2kHCGum/Ly9WGIqB9HNT6my5xOkVp/LMqpFc
7wznKlcE1/fXaN6DjxNuU+cCAwEAATANBgkqhkiG9w0BAQsFAAOCAQEAB+gPvgqR
gkPcSzgJn0ZmUMFxBbQafR2qgARF7JzwvgtR2/cuHo0qF9mmXxeaM9+9KnfFyOu9
zCdD6uvXyw1xpkAzdeUqM7DgQaV5BvnKwvG9AtTvBoQhGezwU5QYbQF6fsb4DQJN
42AzJLVy1ar6Us11RZl0PwDK8HrancwzRUlSEVUiQpwoBot2chsZKrzaEdfF/Rkm
JenxU2A8cCYRWjJTqfsdyeWHhCeFWUd9YCphmTWqecfuX8GRmBaH+9exDvlAKRMA
gaboIaKOgmrloVMCK2HmCgFAcHrcQIBtHgJwK3d2RPPh2okp9WQE7P857NUZao0H
963EtXNbKKkq3Q==
-----END CERTIFICATE-----`;
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PROJECT = "samovyvoz-685ae";
const NOW = 1_800_000_000_000; // мс
const nowS = NOW / 1000;

const certs = async () => ({ k1: PEM });

function sign(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = {},
  key = privateKey,
) {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = enc({ alg: "RS256", kid: "k1", typ: "JWT", ...header });
  const p = enc(payload);
  const s = createSign("RSA-SHA256").update(`${h}.${p}`).sign(key).toString("base64url");
  return `${h}.${p}.${s}`;
}

const good = {
  iss: `https://securetoken.google.com/${PROJECT}`,
  aud: PROJECT,
  sub: "6fbPUoLTqmXEhHYWxXW7K4cufzA2",
  iat: nowS - 60,
  auth_time: nowS - 120,
  exp: nowS + 3000,
};

const check = (token: string) => verifyFirebaseIdToken(token, PROJECT, certs, NOW);

describe("verifyFirebaseIdToken", () => {
  it("accepts a valid token and returns the uid", async () => {
    expect(await check(sign(good))).toBe(good.sub);
  });

  it("rejects a token signed by another key", async () => {
    expect(await check(sign(good, {}, other.privateKey))).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const [h, , s] = sign(good).split(".");
    const p = Buffer.from(JSON.stringify({ ...good, sub: "someone-else" })).toString("base64url");
    expect(await check(`${h}.${p}.${s}`)).toBeNull();
  });

  it("rejects wrong audience, issuer or project", async () => {
    expect(await check(sign({ ...good, aud: "other-project" }))).toBeNull();
    expect(await check(sign({ ...good, iss: "https://securetoken.google.com/other" }))).toBeNull();
    expect(await verifyFirebaseIdToken(sign(good), "", certs, NOW)).toBeNull();
  });

  it("rejects expired and future-issued tokens (with 60 s clock skew)", async () => {
    expect(await check(sign({ ...good, exp: nowS - 61 }))).toBeNull();
    expect(await check(sign({ ...good, exp: nowS - 30 }))).toBe(good.sub);
    expect(await check(sign({ ...good, iat: nowS + 120 }))).toBeNull();
    expect(await check(sign({ ...good, auth_time: nowS + 120 }))).toBeNull();
  });

  it("rejects missing or bad claims", async () => {
    expect(await check(sign({ ...good, sub: "" }))).toBeNull();
    expect(await check(sign({ ...good, sub: "x".repeat(129) }))).toBeNull();
    const { exp: _exp, ...noExp } = good;
    expect(await check(sign(noExp))).toBeNull();
  });

  it("rejects other algorithms, unknown kid and malformed tokens", async () => {
    expect(await check(sign(good, { alg: "HS256" }))).toBeNull();
    expect(await check(sign(good, { alg: "none" }))).toBeNull();
    expect(await check(sign(good, { kid: "unknown" }))).toBeNull();
    expect(await check("abc.def")).toBeNull();
    expect(await check("a.b.c")).toBeNull();
    expect(await check("")).toBeNull();
  });

  it("Google-style x509 certificates are accepted as key material", () => {
    expect(createPublicKey(X509_FIXTURE).asymmetricKeyType).toBe("rsa");
  });

  it("rejects crit headers, array payloads, bad base64url and oversized tokens", async () => {
    expect(await check(sign(good, { crit: ["exp"] }))).toBeNull();
    const [h, , sig] = sign(good).split(".");
    const arr = Buffer.from(JSON.stringify([good])).toString("base64url");
    expect(await check(`${h}.${arr}.${sig}`)).toBeNull();
    expect(await check(`${h}.${"a+b/"}.${sig}`)).toBeNull();
    expect(await check(sign({ ...good, pad: "x".repeat(5000) }))).toBeNull();
  });

  it("does not pick up inherited properties as certificates", async () => {
    expect(await check(sign(good, { kid: "__proto__" }))).toBeNull();
    expect(await check(sign(good, { kid: "toString" }))).toBeNull();
  });

  it("refreshes certificates once when the kid is unknown (key rotation)", async () => {
    const calls: boolean[] = [];
    const rotating = async (force: boolean): Promise<Record<string, string>> => {
      calls.push(force);
      return force ? { k1: PEM } : { old: PEM };
    };
    expect(await verifyFirebaseIdToken(sign(good), PROJECT, rotating, NOW)).toBe(good.sub);
    expect(calls).toEqual([false, true]);
  });

  it("propagates certificate fetch failures instead of accepting the token", async () => {
    const failing = async () => {
      throw new Error("network down");
    };
    await expect(verifyFirebaseIdToken(sign(good), PROJECT, failing, NOW)).rejects.toThrow();
  });
});

describe("createCertsFetcher", () => {
  it("caches for max-age and shares one request between parallel callers", async () => {
    let t = 0;
    let loads = 0;
    const fetcher = createCertsFetcher(
      async () => {
        loads++;
        return { certs: { k: "pem" }, maxAgeS: 100 };
      },
      () => t,
    );
    await Promise.all([fetcher(false), fetcher(false), fetcher(false)]);
    expect(loads).toBe(1);
    t = 99_000;
    await fetcher(false);
    expect(loads).toBe(1);
    t = 100_000;
    await fetcher(false);
    expect(loads).toBe(2);
  });

  it("forced refresh is rate limited to once a minute while the cache is fresh", async () => {
    let t = 0;
    let loads = 0;
    const fetcher = createCertsFetcher(
      async () => {
        loads++;
        return { certs: {}, maxAgeS: 3600 };
      },
      () => t,
    );
    await fetcher(false);
    t = 1_000;
    await fetcher(true);
    await fetcher(true);
    expect(loads).toBe(2);
    t = 30_000;
    await fetcher(true);
    expect(loads).toBe(2);
    t = 62_000;
    await fetcher(true);
    expect(loads).toBe(3);
  });

  it("does not cache a failed load", async () => {
    let fail = true;
    const fetcher = createCertsFetcher(async () => {
      if (fail) throw new Error("boom");
      return { certs: { k: "pem" }, maxAgeS: 60 };
    });
    await expect(fetcher(false)).rejects.toThrow("boom");
    fail = false;
    expect(await fetcher(false)).toEqual({ k: "pem" });
  });
});
