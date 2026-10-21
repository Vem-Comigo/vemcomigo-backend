import type { RequestHandler } from "express";

// Um processo: sem persistir mensagens. Para múltiplas instâncias, usar o limitador da infraestrutura.
export function contactRateLimit(now = Date.now): RequestHandler {
  const requests = new Map<string, { count: number; until: number }>();
  const windowMs = 15 * 60 * 1000;
  return (req, res, next) => {
    const timestamp = now();
    for (const [key, value] of requests)
      if (value.until <= timestamp) requests.delete(key);
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const entry = requests.get(key);
    if ((entry && entry.count >= 5) || (!entry && requests.size >= 10000)) {
      res.set(
        "Retry-After",
        String(
          Math.ceil(
            ((entry?.until ?? timestamp + windowMs) - timestamp) / 1000,
          ),
        ),
      );
      res.status(429).json({ error: "Aguarde antes de tentar novamente." });
      return;
    }
    requests.set(key, {
      count: (entry?.count ?? 0) + 1,
      until: entry?.until ?? timestamp + windowMs,
    });
    next();
  };
}
