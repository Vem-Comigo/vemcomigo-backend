const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../dist/app");
const { validateContact } = require("../dist/contact/validation");
const { createMailSender, CONTACT_RECIPIENT } = require("../dist/contact/mail");
const { contactRateLimit } = require("../dist/contact/rateLimit");

const origin = "http://localhost:5173";
const valid = {
  name: "Pessoa de teste",
  school: "Escola fictícia",
  role: "Docente",
  city: "Cidade / UF",
  email: "teste@example.org",
  phone: "",
  interest: "Formação de professores",
  message: "Mensagem fictícia para testes.",
  website: "",
};

async function withApp(options, run) {
  const server = createApp({ origin, ...options }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/api/contact`;
  const post = (body = valid, headers = {}) =>
    fetch(url, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  try {
    await run(post);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("servidor rejeita tipos, campos extras, spam e injeção de cabeçalhos", () => {
  assert.ok(validateContact(valid));
  for (const body of [
    null,
    [],
    { ...valid, name: 4 },
    { ...valid, school: "" },
    { ...valid, to: "outra@example.org" },
    { ...valid, website: "spam" },
    { ...valid, email: "teste@example.org\r\nBcc: outra@example.org" },
    { ...valid, interest: "inválido" },
    { ...valid, message: "a".repeat(3001) },
    { ...valid, phone: "inválido" },
    { ...valid, role: "A\0B" },
  ])
    assert.equal(validateContact(body), null);
});
test("sem configuração responde 503, sem simular aceitação", async () => {
  await withApp({}, async (post) => {
    const response = await post();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).accepted, undefined);
  });
});
test("aguarda confirmação do serviço e só então responde 202", async () => {
  let called = false;
  await withApp(
    {
      sendMail: async (data) => {
        called = true;
        assert.equal(data.email, valid.email);
      },
    },
    async (post) => {
      const response = await post();
      assert.equal(response.status, 202);
      assert.equal(called, true);
      assert.deepEqual(await response.json(), { accepted: true });
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-frame-options"), "DENY");
      assert.equal(response.headers.get("x-powered-by"), null);
    },
  );
});
test("falha do serviço não expõe erro interno nem retorna sucesso", async () => {
  await withApp(
    {
      sendMail: async () => {
        throw new Error("detalhe privado");
      },
    },
    async (post) => {
      const response = await post();
      assert.equal(response.status, 502);
      assert.doesNotMatch(await response.text(), /privado|accepted/);
    },
  );
});
test("bloqueia origem externa, ausente e tipo de conteúdo incorreto", async () => {
  await withApp({}, async (post) => {
    assert.equal(
      (await post(valid, { Origin: "https://outra.example" })).status,
      403,
    );
    assert.equal((await post(valid, { Origin: "" })).status, 403);
    assert.equal(
      (await post(valid, { "Content-Type": "text/plain" })).status,
      415,
    );
  });
});
test("rejeita JSON malformado, corpo excessivo e campos inválidos", async () => {
  await withApp({}, async (post) => {
    assert.equal((await post("{")).status, 400);
    assert.equal(
      (await post({ ...valid, message: "a".repeat(20000) })).status,
      413,
    );
    assert.equal((await post({ ...valid, name: null })).status, 400);
  });
});
test("limita tentativas e ignora IP forjado em X-Forwarded-For", async () => {
  await withApp({}, async (post) => {
    for (let i = 0; i < 5; i++) assert.equal((await post()).status, 503);
    const response = await post(valid, { "X-Forwarded-For": "203.0.113.1" });
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get("retry-after")) > 0);
  });
});
test("limitador libera novamente após janela expirar", () => {
  let now = 0,
    next = 0,
    status;
  const limit = contactRateLimit(() => now);
  const req = { ip: "test", socket: {} };
  const res = {
    set() {},
    status(code) {
      status = code;
      return this;
    },
    json() {},
  };
  for (let i = 0; i < 6; i++) limit(req, res, () => next++);
  assert.equal(next, 5);
  assert.equal(status, 429);
  now = 900001;
  limit(req, res, () => next++);
  assert.equal(next, 6);
});
test("adaptador fixa destinatário, usa texto e exige ID do provedor", async () => {
  const config = {
    apiKey: "fake-test-key",
    from: "portal@example.org",
    to: "equipe@example.org",
  };
  const send = createMailSender(config, async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    const body = JSON.parse(options.body);
    assert.deepEqual(body.to, [CONTACT_RECIPIENT]);
    assert.equal(body.from, `Vem Comigo <${config.from}>`);
    assert.equal(body.reply_to, valid.email);
    assert.ok(body.html.includes("Nova solicitação"));
    assert.ok(body.text.includes(valid.message));
    return Response.json({ id: "fake-confirmation" });
  });
  await send(valid);
  assert.equal(
    createMailSender({ ...config, from: "a@example.org\r\nBcc:b@example.org" }),
    undefined,
  );
  assert.equal(createMailSender({ ...config, apiKey: "" }), undefined);
  for (const response of [
    Response.json({}, { status: 200 }),
    Response.json({ id: "fake" }, { status: 429 }),
    new Response("invalid"),
  ]) {
    await assert.rejects(createMailSender(config, async () => response)(valid));
  }
});
