import express from "express";
import type { ErrorRequestHandler } from "express";
import { validateContact } from "./contact/validation";
import { contactRateLimit } from "./contact/rateLimit";
import type { MailSender } from "./contact/mail";

export interface AppOptions {
  origin: string;
  sendMail?: MailSender | undefined;
}

export function createApp({ origin, sendMail }: AppOptions) {
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
    contactRateLimit(),
    (req, res, next) => {
      // JSON + origem exata: sem cookies de autenticação e sem CORS público.
      if (req.get("origin") !== origin) {
        res.status(403).json({ error: "Origem não permitida." });
        return;
      }
      if (!req.is("application/json")) {
        res.status(415).json({ error: "Formato inválido." });
        return;
      }
      next();
    },
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
        await sendMail(data);
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
