import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";

export interface SharedLimitConfig {
  url: string;
  token: string;
}
export type ConsumeLimit = (
  client: string,
) => Promise<{ allowed: boolean; retryAfter: number }>;
// Contagem e expiração atômicas, compartilhadas entre instâncias. Sem mensagens ou IP bruto.
const SCRIPT = `local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('EXPIRE',KEYS[1],900) end; local ttl=redis.call('TTL',KEYS[1]); if ttl<0 then redis.call('EXPIRE',KEYS[1],900); ttl=900 end; return {count,ttl}`;

export function createSharedLimiter(
  config: SharedLimitConfig,
  request: typeof fetch = fetch,
  timeoutMs = 2500,
): ConsumeLimit | undefined {
  let url: URL;
  try {
    url = new URL(config.url);
  } catch {
    return undefined;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !config.token ||
    /\s/.test(config.token)
  )
    return undefined;
  return async (client) => {
    const key =
      "vmc:contact:v1:" + createHash("sha256").update(client).digest("hex");
    const response = await request(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EVAL", SCRIPT, "1", key]),
    });
    const payload: unknown = await response.json().catch(() => null);
    const result =
      payload && typeof payload === "object" && "result" in payload
        ? payload.result
        : null;
    if (
      !response.ok ||
      !Array.isArray(result) ||
      result.length !== 2 ||
      !Number.isSafeInteger(result[0]) ||
      result[0] < 1 ||
      !Number.isSafeInteger(result[1]) ||
      result[1] < 0 ||
      result[1] > 900
    )
      throw new Error("Proteção indisponível");
    return { allowed: result[0] <= 5, retryAfter: Math.max(1, result[1]) };
  };
}

export function isProxySecret(value: string): boolean {
  return value.length >= 32 && value.length <= 256 && !/\s/.test(value);
}

export function proxyAuthenticated(req: Request, secret: string): boolean {
  const incoming = req.get("x-contact-proxy-key") ?? "";
  const candidate = Buffer.from(incoming);
  const expected = Buffer.from(secret);
  return (
    isProxySecret(secret) &&
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected)
  );
}

export function sharedRateLimit(consume?: ConsumeLimit): RequestHandler {
  return async (req, res, next) => {
    const identifier = req.get("x-contact-client-id") ?? "";
    if (!consume || !/^[a-f0-9]{64}$/.test(identifier)) {
      res.status(503).json({ error: "Contato temporariamente indisponível." });
      return;
    }
    try {
      const result = await consume(identifier);
      if (!result.allowed) {
        res.set("Retry-After", String(result.retryAfter));
        res.status(429).json({ error: "Aguarde antes de tentar novamente." });
        return;
      }
      next();
    } catch {
      res.status(503).json({ error: "Contato temporariamente indisponível." });
    }
  };
}
