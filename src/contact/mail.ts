import nodemailer from "nodemailer";
import type { SMTPTransportOptions, SendMailOptions } from "nodemailer";
import { Socket } from "node:net";
import type { ContactData } from "./validation";
import { isEmail } from "./validation";
import { renderContactEmail } from "./template";

export const CONTACT_RECIPIENT = "contatovmc3567@gmail.com";
export const CONTACT_FROM = '"Vem Comigo" <' + CONTACT_RECIPIENT + ">";
export interface MailConfig {
  user: string;
  appPassword: string;
}
export type MailSender = (
  data: ContactData,
  receivedAt?: Date,
) => Promise<void>;
export interface SmtpTransport {
  sendMail(message: SendMailOptions): Promise<{
    accepted: unknown[];
    rejected?: unknown[];
    response: string;
  }>;
  close(): void;
}
export type TransportFactory = (options: SMTPTransportOptions) => SmtpTransport;

export function createMailSender(
  config: MailConfig,
  createTransport: TransportFactory = (options) =>
    nodemailer.createTransport(options),
  now = () => new Date(),
  timeoutMs = 10000,
): MailSender | undefined {
  // Gmail displays app passwords in groups. Only ordinary spaces are removed.
  const user = config.user.trim().toLowerCase();
  const pass = config.appPassword.replace(/ /g, "");
  if (user !== CONTACT_RECIPIENT || !/^[a-zA-Z0-9]{16}$/.test(pass))
    return undefined;
  return async (data, receivedAt) => {
    if (!isEmail(data.email) || /[\r\n]/.test(data.school))
      throw new Error("Dados inválidos");
    // One non-pooled transport per submission: no background queues or retries.
    // Owning the socket lets the total deadline actually stop SMTP I/O.
    const socket = new Socket();
    let transport: SmtpTransport | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      transport = createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user, pass },
        socket,
        tls: {
          minVersion: "TLSv1.2",
          rejectUnauthorized: true,
          servername: "smtp.gmail.com",
        },
        connectionTimeout: timeoutMs,
        greetingTimeout: timeoutMs,
        socketTimeout: timeoutMs,
        dnsTimeout: timeoutMs,
        logger: false,
        debug: false,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Tempo de envio excedido");
          error.name = "TimeoutError";
          reject(error);
          socket.destroy();
        }, timeoutMs);
      });
      const result = await Promise.race([
        transport.sendMail({
          from: CONTACT_FROM,
          to: CONTACT_RECIPIENT,
          replyTo: data.email,
          envelope: { from: CONTACT_RECIPIENT, to: [CONTACT_RECIPIENT] },
          ...renderContactEmail(data, receivedAt ?? now()),
        }),
        deadline,
      ]);
      // Resolution follows DATA; require SMTP acceptance of the fixed recipient.
      if (
        !Array.isArray(result.accepted) ||
        !result.accepted.some(
          (address) =>
            typeof address === "string" &&
            address.toLowerCase() === CONTACT_RECIPIENT,
        ) ||
        (result.rejected?.length ?? 0) > 0 ||
        !/^250(?:[ -]|$)/.test(result.response)
      ) {
        throw new Error("Envio não confirmado");
      }
    } finally {
      clearTimeout(timer);
      socket.destroy();
      transport?.close();
    }
  };
}
