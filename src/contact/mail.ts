import type { ContactData } from "./validation";
import { isEmail } from "./validation";
import { renderContactEmail } from "./template";

export const CONTACT_RECIPIENT = "contatovmc3567@gmail.com";

export interface MailConfig {
  apiKey: string;
  from: string;
}
export type MailSender = (
  data: ContactData,
  receivedAt?: Date,
) => Promise<void>;

export function createMailSender(
  config: MailConfig,
  request: typeof fetch = fetch,
  now = () => new Date(),
  timeoutMs = 10000,
): MailSender | undefined {
  if (!config.apiKey || /\s/.test(config.apiKey) || !isEmail(config.from))
    return undefined;
  return async (data, receivedAt) => {
    if (!isEmail(data.email) || /[\r\n]/.test(data.school))
      throw new Error("Dados inválidos");
    const template = renderContactEmail(data, receivedAt ?? now());
    const response = await request("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Vem Comigo <${config.from}>`,
        to: [CONTACT_RECIPIENT],
        reply_to: data.email,
        ...template,
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
