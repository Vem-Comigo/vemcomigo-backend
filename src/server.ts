import app from "./app";
import { env } from "./config/env";

if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535)
  throw new Error("PORT inválida.");
if (!env.smtpUser || !env.smtpAppPassword)
  console.warn(
    "Contato indisponível: configure SMTP_USER e SMTP_APP_PASSWORD no servidor.",
  );
const server = app.listen(env.port, () => {
  console.log(`Servidor iniciado na porta ${env.port}.`);
});
server.requestTimeout = 20000;
server.headersTimeout = 15000;
server.on("error", () => {
  console.error("Não foi possível iniciar o servidor.");
  process.exitCode = 1;
});
