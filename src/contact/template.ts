import type { ContactData } from "./validation";

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

function wrapText(value: string): string {
  // Pontos de quebra só no HTML: a versão em texto mantém o conteúdo original.
  return value
    .split(/(\s+)/u)
    .map((part) =>
      Array.from(part).reduce(
        (text, char, index) =>
          text +
          (index && index % 40 === 0 ? "&#8203;" : "") +
          escapeHtml(char),
        "",
      ),
    )
    .join("");
}

export function renderContactEmail(data: ContactData, receivedAt: Date) {
  const received = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
    hour12: false,
  }).format(receivedAt);
  const fields: [string, string][] = [
    ["Nome", data.name],
    ["Escola ou instituição", data.school || "Não informada"],
    ["Cargo ou função", data.role],
    ["Cidade/UF", data.city],
    ["E-mail", data.email],
    ...(data.phone ? [["Telefone", data.phone] as [string, string]] : []),
    ["Tipo de interesse", data.interest],
  ];
  const school = (data.school || "Solicitação institucional")
    .replace(/[\r\n\t]/g, " ")
    .trim();
  const subject = `[Vem Comigo] Novo contato — ${school}`;
  const text = [
    "Vem Comigo",
    "Nova solicitação de contato",
    "",
    `Recebido em: ${received} (America/Sao_Paulo)`,
    "",
    ...fields.map(([label, value]) => `${label}: ${value}`),
    "",
    "Mensagem:",
    data.message,
    "",
    "Mensagem enviada pelo formulário do portal Vem Comigo",
  ].join("\n");
  const rows = fields
    .map(
      ([label, value]) =>
        `<tr><td style="padding:0 0 20px;word-wrap:break-word;overflow-wrap:anywhere;word-break:break-word;"><p style="margin:0 0 5px;color:#66388c;font:700 12px/1.5 Arial,sans-serif;">${label}</p><p style="margin:0;color:#302537;font:400 16px/1.6 Arial,sans-serif;">${wrapText(value)}</p></td></tr>`,
    )
    .join("");
  const message = wrapText(data.message).replace(/\r\n|\r|\n/g, "<br />");
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Nova solicitação de contato — Vem Comigo</title></head>
<body style="margin:0;padding:0;background-color:#f5f2f8;color:#302537;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f2f8"><tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;table-layout:fixed;border:1px solid #e4dce9;border-radius:20px;background-color:#ffffff;">
<tr><td bgcolor="#66388c" style="padding:28px 28px 24px;border-radius:20px 20px 0 0;"><p style="margin:0 0 6px;color:#ffffff;font:700 26px/1.3 Arial,sans-serif;">Vem Comigo<span style="color:#fab900;">.</span></p><p style="margin:0;color:#f2e9fa;font:400 13px/1.6 Arial,sans-serif;">Diálogo, cuidado e convivência escolar.</p></td></tr>
<tr><td height="5" bgcolor="#fab900" style="height:5px;line-height:5px;font-size:1px;">&nbsp;</td></tr>
<tr><td style="padding:28px 24px 0;"><h1 style="margin:0 0 14px;color:#302537;font:700 27px/1.3 Arial,sans-serif;">Nova solicitação<br>de contato</h1><p style="margin:0 0 24px;color:#635b69;font:400 14px/1.7 Arial,sans-serif;">Uma nova conversa chegou pelo portal. Confira os dados informados e responda diretamente pelo e-mail do visitante.</p><p style="margin:0 0 28px;padding:12px 14px;background-color:#f4eff9;border-radius:8px;color:#66388c;font:400 12px/1.7 Arial,sans-serif;"><strong>Recebido em</strong><br>${escapeHtml(received)} · America/Sao_Paulo</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">${rows}</table></td></tr>
<tr><td style="padding:0 24px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;"><tr><td bgcolor="#f4eff9" style="padding:20px 18px;border-left:4px solid #66388c;word-wrap:break-word;overflow-wrap:anywhere;word-break:break-word;"><p style="margin:0 0 12px;color:#66388c;font:700 13px/1.5 Arial,sans-serif;">Mensagem do visitante</p><p style="margin:0;color:#302537;font:400 16px/1.8 Arial,sans-serif;">${message}</p></td></tr></table></td></tr>
<tr><td style="padding:20px 24px;border-top:1px solid #e4dce9;"><p style="margin:0;color:#635b69;font:400 12px/1.8 Arial,sans-serif;">Mensagem enviada pelo formulário do portal Vem Comigo</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { subject, html, text };
}
