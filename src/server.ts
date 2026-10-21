import { createApp } from "./app";
import { env } from "./config/env";
import { createMailSender } from "./contact/mail";

if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535)
  throw new Error("PORT inválida.");
const sendMail = createMailSender({
  apiKey: env.mailApiKey,
  from: env.mailFrom,
  to: env.mailTo,
});
if (!sendMail)
  console.warn(
    "Contato indisponível: configure MAIL_API_KEY, MAIL_FROM e MAIL_TO no servidor.",
  );
const app = createApp({ origin: env.contactOrigin, sendMail });
const server = app.listen(env.port, () => {
  console.log(`Servidor iniciado na porta ${env.port}.`);
});
server.requestTimeout = 20000;
server.headersTimeout = 15000;
server.on("error", () => {
  console.error("Não foi possível iniciar o servidor.");
  process.exitCode = 1;
});
