import type { ContactData } from "./validation";
import { isEmail } from "./validation";

export interface MailConfig {
  apiKey: string;
  from: string;
  to: string;
}
export type MailSender = (data: ContactData) => Promise<void>;

export function createMailSender(
  config: MailConfig,
  request: typeof fetch = fetch,
): MailSender | undefined {
  if (
    !config.apiKey ||
    /\s/.test(config.apiKey) ||
    !isEmail(config.from) ||
    !isEmail(config.to)
  )
    return undefined;
  return async (data) => {
    const text = [
      `Nome: ${data.name}`,
      `Escola: ${data.school}`,
      `Cargo ou função: ${data.role}`,
      `Cidade/UF: ${data.city}`,
      `E-mail: ${data.email}`,
      `Telefone: ${data.phone || "Não informado"}`,
      `Interesse: ${data.interest}`,
      "",
      "Mensagem:",
      data.message,
    ].join("\n");
    const response = await request("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [config.to],
        reply_to: data.email,
        subject: "Vem Comigo — contato institucional",
        text,
      }),
    });
    const result: unknown = await response.json().catch(() => null);
    if (
      !response.ok ||
      !result ||
      typeof result !== "object" ||
      !("id" in result) ||
      typeof result.id !== "string" ||
      !result.id
    )
      throw new Error("Envio não confirmado");
  };
}
