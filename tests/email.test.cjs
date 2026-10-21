const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderContactEmail, escapeHtml } = require("../dist/contact/template");
const { createMailSender, CONTACT_RECIPIENT } = require("../dist/contact/mail");
const { validateContact } = require("../dist/contact/validation");
const {
  createSharedLimiter,
  sharedRateLimit,
} = require("../dist/contact/sharedRateLimit");
const { createApp } = require("../dist/app");
const { once } = require("node:events");

const data = {
  name: "Pessoa Fictícia",
  school: "Escola Exemplo",
  role: "Professora",
  city: "São Paulo / SP",
  email: "docente@example.invalid",
  phone: "",
  interest: "Formação de professores",
  message: "Olá, equipe!\nSegunda linha com acentos: ação e convivência.",
};
const received = new Date("2026-10-21T15:30:00Z");
const mailConfig = { apiKey: "fake-key", from: "portal@example.invalid" };
const proxyKey = "fictitious-test-secret-with-32-characters-minimum";
const clientId = "a".repeat(64);

test("template contém os campos, horário de São Paulo, HTML e texto simples", () => {
  const email = renderContactEmail(data, received);
  assert.match(email.subject, /\[Vem Comigo\] Novo contato — Escola Exemplo/);
  for (const value of [
    "Pessoa Fictícia",
    "Escola Exemplo",
    "Professora",
    "São Paulo / SP",
    "docente@example.invalid",
    "Formação de professores",
    "21/10/2026",
    "12:30:00",
    "America/Sao_Paulo",
  ]) {
    assert.ok(email.html.includes(value));
    assert.ok(email.text.includes(value));
  }
  assert.ok(email.html.includes("Olá, equipe!<br />Segunda linha"));
  assert.ok(email.text.includes(data.message));
  assert.ok(!email.html.includes(">Telefone<"));
  assert.ok(
    !/<script|<form|display:\s*(?:flex|grid)|@import/i.test(email.html),
  );
  assert.match(email.html, /role="presentation"/);
  assert.match(
    renderContactEmail({ ...data, phone: "(00) 00000-0000" }, received).html,
    />Telefone</,
  );
  assert.match(
    renderContactEmail({ ...data, school: "" }, received).subject,
    /Solicitação institucional/,
  );
});
test("escapa todas as entradas, normaliza quebras e acomoda sequências extensas", () => {
  assert.equal(escapeHtml("&<>\"'"), "&amp;&lt;&gt;&quot;&#39;");
  const malicious = '<img src=x onerror="alert(1)">&\'';
  const email = renderContactEmail(
    {
      ...data,
      name: malicious,
      school: malicious,
      role: malicious,
      city: malicious,
      phone: malicious,
      message:
        malicious + "\r\n<script>alert(1)</script>\rFim\n" + "X".repeat(2900),
    },
    received,
  );
  assert.ok(!email.html.includes("<img"));
  assert.ok(!email.html.includes("<script>"));
  assert.ok(email.html.includes("&lt;img"));
  assert.ok(email.html.includes("&quot;"));
  assert.ok(email.html.includes("<br />Fim<br />"));
  assert.ok(email.html.includes("&#8203;"));
  assert.ok(email.text.includes(malicious));
  assert.ok(Buffer.byteLength(email.html) < 100 * 1024);
  assert.ok(
    !/[\r\n]/.test(
      renderContactEmail(
        { ...data, school: "Escola\r\nBcc: atacante" },
        received,
      ).subject,
    ),
  );
});
test("validação aceita opcionais vazios e 3000 caracteres, bloqueia parâmetros internos", () => {
  assert.ok(
    validateContact({ ...data, website: "", message: "á".repeat(3000) }),
  );
  for (const key of [
    "to",
    "from",
    "cc",
    "bcc",
    "reply_to",
    "subject",
    "html",
    "receivedAt",
  ])
    assert.equal(
      validateContact({ ...data, website: "", [key]: "não permitido" }),
      null,
    );
  assert.equal(validateContact({ ...data, website: "bot" }), null);
  assert.equal(
    validateContact({ ...data, website: "", message: "x".repeat(3001) }),
    null,
  );
});
test("adaptador ignora destinatário externo, não envia confirmação e preserva Reply-To", async () => {
  let calls = 0;
  const send = createMailSender(
    { ...mailConfig, to: "atacante@example.invalid" },
    async (_url, options) => {
      calls++;
      const body = JSON.parse(options.body);
      assert.deepEqual(body.to, [CONTACT_RECIPIENT]);
      assert.equal(body.reply_to, data.email);
      assert.equal(body.from, "Vem Comigo <portal@example.invalid>");
      assert.equal(body.cc, undefined);
      assert.equal(body.bcc, undefined);
      assert.ok(body.html.includes("12:30:00"));
      assert.ok(body.text.includes("12:30:00"));
      assert.equal(options.redirect, "error");
      return Response.json({ id: "fictitious-provider-id" });
    },
  );
  await send(data, received);
  assert.equal(calls, 1);
  await assert.rejects(
    send({ ...data, email: "x@example.invalid\r\nBcc: x@example.org" }),
  );
});
test("timeout do provedor aborta sem repetir o envio", async () => {
  let calls = 0;
  const send = createMailSender(
    mailConfig,
    async (_url, { signal }) => {
      calls++;
      return new Promise((_resolve, reject) => {
        const keepAlive = setTimeout(
          () => reject(new Error("Timeout não aplicado")),
          100,
        );
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(keepAlive);
            reject(signal.reason);
          },
          { once: true },
        );
      });
    },
    () => received,
    5,
  );
  await assert.rejects(send(data), (error) => error.name === "TimeoutError");
  assert.equal(calls, 1);
});
test("limite compartilhado usa chave sem IP bruto e operação atômica com expiração", async () => {
  let count = 4;
  const mock = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body[0], "EVAL");
    assert.ok(body[1].includes("'EXPIRE'"));
    assert.ok(body[1].includes("900"));
    assert.ok(!options.body.includes("192.0.2.1"));
    assert.match(body[3], /^vmc:contact:v1:[a-f0-9]{64}$/);
    return Response.json({ result: [++count, 870] });
  };
  const first = createSharedLimiter(
    { url: "https://redis.example.invalid", token: "fake-token" },
    mock,
  );
  const second = createSharedLimiter(
    { url: "https://redis.example.invalid", token: "fake-token" },
    mock,
  );
  assert.deepEqual(await first("192.0.2.1"), {
    allowed: true,
    retryAfter: 870,
  });
  assert.deepEqual(await second("192.0.2.1"), {
    allowed: false,
    retryAfter: 870,
  });
});
test("falha, timeout e respostas inválidas do limitador não liberam envio", async () => {
  assert.equal(
    createSharedLimiter({ url: "http://redis.example.invalid", token: "fake" }),
    undefined,
  );
  for (const response of [
    Response.json({ error: "privado" }),
    Response.json({ result: [1, -1] }),
    Response.json({ result: [1, 900] }, { status: 500 }),
    new Response("não é json"),
  ]) {
    const consume = createSharedLimiter(
      { url: "https://redis.example.invalid", token: "fake" },
      async () => response,
    );
    await assert.rejects(consume(clientId));
  }
  const consume = createSharedLimiter(
    { url: "https://redis.example.invalid", token: "fake" },
    async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        const keepAlive = setTimeout(
          () => reject(new Error("Timeout não aplicado")),
          100,
        );
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(keepAlive);
            reject(signal.reason);
          },
          { once: true },
        );
      }),
    5,
  );
  await assert.rejects(
    consume(clientId),
    (error) => error.name === "TimeoutError",
  );
});

async function serverless(options, run) {
  let sends = 0;
  const app = createApp({
    origin: "https://portal.example.invalid",
    serverless: true,
    proxyKey,
    sendMail: async (_data, date) => {
      sends++;
      assert.ok(date instanceof Date);
    },
    ...options,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const post = (headers = {}, body = { ...data, website: "" }) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/contact`, {
      method: "POST",
      headers: {
        Origin: "https://portal.example.invalid",
        "Content-Type": "application/json",
        "x-contact-proxy-key": proxyKey,
        "x-contact-client-id": clientId,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  try {
    await run(post, () => sends);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
test("serverless exige proxy autenticado e limite compartilhado; falha fechada", async () => {
  await serverless({}, async (post, sends) => {
    assert.equal((await post()).status, 503);
    assert.equal(sends(), 0);
  });
  await serverless(
    {
      limiter: sharedRateLimit(async () => ({
        allowed: true,
        retryAfter: 900,
      })),
    },
    async (post, sends) => {
      assert.equal(
        (await post({ "x-contact-proxy-key": "forjada" })).status,
        403,
      );
      assert.equal(
        (await post({ "x-contact-proxy-key": "é".repeat(proxyKey.length) }))
          .status,
        403,
      );
      assert.equal(
        (await post({ "x-contact-client-id": "forjado" })).status,
        503,
      );
      assert.equal((await post()).status, 202);
      assert.equal(sends(), 1);
    },
  );
});
test("bloqueio e indisponibilidade compartilhada não chamam o provedor", async () => {
  await serverless(
    {
      limiter: sharedRateLimit(async () => ({
        allowed: false,
        retryAfter: 333,
      })),
    },
    async (post, sends) => {
      const response = await post();
      assert.equal(response.status, 429);
      assert.equal(response.headers.get("retry-after"), "333");
      assert.equal(sends(), 0);
    },
  );
  await serverless(
    {
      limiter: sharedRateLimit(async () => {
        throw new Error("segredo");
      }),
    },
    async (post, sends) => {
      const response = await post();
      assert.equal(response.status, 503);
      assert.doesNotMatch(await response.text(), /segredo/);
      assert.equal(sends(), 0);
    },
  );
});
