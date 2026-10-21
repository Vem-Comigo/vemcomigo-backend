import express from "express";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { validateContact } from "./contact/validation";
import { contactRateLimit } from "./contact/rateLimit";
import type { MailSender } from "./contact/mail";
import { createMailSender } from "./contact/mail";
import {
  createSharedLimiter,
  isProxySecret,
  proxyAuthenticated,
  sharedRateLimit,
} from "./contact/sharedRateLimit";
import { env } from "./config/env";

export interface AppOptions {
  origin: string;
  sendMail?: MailSender | undefined;
  serverless?: boolean;
  proxyKey?: string;
  limiter?: RequestHandler;
}

export function createApp({
  origin,
  sendMail,
  serverless = false,
  proxyKey = "",
  limiter,
}: AppOptions) {
  const limitContact =
    limiter ?? (serverless ? sharedRateLimit() : contactRateLimit());
  if (new URL(origin).origin !== origin)
    throw new Error(
      "CONTACT_ORIGIN deve conter somente a origem, sem caminho ou barra final.",
    );
  const app = express();
  app.disable("x-powered-by");
  // Não confiar em X-Forwarded-For sem conhecer a topologia do proxy de produção.
  app.set("trust proxy", false);
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=()",
      "Content-Security-Policy":
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "Cache-Control": "no-store",
    });
    next();
  });
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.post(
    "/api/contact",
    (req, res, next) => {
      res.locals.receivedAt = new Date();
      // JSON + origem exata: sem cookies de autenticação e sem CORS público.
      if (req.get("origin") !== origin) {
        res.status(403).json({ error: "Origem não permitida." });
        return;
      }
      if (!req.is("application/json")) {
        res.status(415).json({ error: "Formato inválido." });
        return;
      }
      if (serverless) {
        if (!isProxySecret(proxyKey)) {
          res
            .status(503)
            .json({ error: "Contato temporariamente indisponível." });
          return;
        }
        if (!proxyAuthenticated(req, proxyKey)) {
          res.status(403).json({ error: "Solicitação não permitida." });
          return;
        }
      }
      next();
    },
    limitContact,
    express.json({ limit: "16kb", strict: true }),
    async (req, res) => {
      const data = validateContact(req.body);
      if (!data) {
        res.status(400).json({ error: "Revise os campos e tente novamente." });
        return;
      }
      if (!sendMail) {
        res
          .status(503)
          .json({ error: "Contato temporariamente indisponível." });
        return;
      }
      try {
        await sendMail(data, res.locals.receivedAt as Date);
        res.status(202).json({ accepted: true });
      } catch {
        // Não registrar corpo, dados pessoais, credenciais ou resposta do provedor.
        res.status(502).json({ error: "Não foi possível confirmar o envio." });
      }
    },
  );
  app.use((_req, res) => {
    res.status(404).json({ error: "Recurso não encontrado." });
  });
  const handleError: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    _next,
  ) => {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? error.status
        : undefined;
    res
      .status(status === 413 ? 413 : status === 400 ? 400 : 500)
      .json({ error: "Não foi possível processar a solicitação." });
  };
  app.use(handleError);
  return app;
}

// A Vercel reconhece src/app.ts com export default como aplicação Express.
// A fábrica acima continua disponível para testes, sem disparar chamadas externas.
export default createApp({
  origin: env.contactOrigin,
  sendMail: createMailSender({
    user: env.smtpUser,
    appPassword: env.smtpAppPassword,
  }),
  serverless: env.serverless,
  proxyKey: env.proxyKey,
  limiter: env.serverless
    ? sharedRateLimit(
        createSharedLimiter({
          url: env.rateLimitUrl,
          token: env.rateLimitToken,
        }),
      )
    : contactRateLimit(),
});
