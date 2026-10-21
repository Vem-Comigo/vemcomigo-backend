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

test("API aguarda SMTP e não expõe falha de autenticação", async () => {
  let accept;
  let started;
  const sending = new Promise((resolve) => {
    started = resolve;
  });
  const sendMail = createMailSender(
    { user: CONTACT_RECIPIENT, appPassword: "abcdefghijklmnop" },
    () => ({
      sendMail() {
        started();
        return new Promise((resolve) => {
          accept = resolve;
        });
      },
      close() {},
    }),
  );
  await withApp({ sendMail }, async (post) => {
    let finished = false;
    const pending = post().then((response) => {
      finished = true;
      return response;
    });
    await sending;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(finished, false);
    accept({ accepted: [CONTACT_RECIPIENT], rejected: [], response: "250 OK" });
    assert.equal((await pending).status, 202);
  });
  await withApp(
    {
      sendMail: createMailSender(
        { user: CONTACT_RECIPIENT, appPassword: "abcdefghijklmnop" },
        () => ({
          async sendMail() {
            throw new Error("EAUTH private SMTP detail");
          },
          close() {},
        }),
      ),
    },
    async (post) => {
      const response = await post();
      assert.equal(response.status, 502);
      assert.doesNotMatch(await response.text(), /EAUTH|private|SMTP|accepted/);
    },
  );
});

test("SMTP exige conta fixa, senha de app e aceitação após DATA", async () => {
  const config = { user: CONTACT_RECIPIENT, appPassword: "abcdefghijklmnop" };
  let options,
    message,
    closed = 0;
  const send = createMailSender(config, (settings) => {
    options = settings;
    return {
      async sendMail(body) {
        message = body;
        return {
          accepted: [CONTACT_RECIPIENT],
          rejected: [],
          response: "250 2.0.0 OK",
        };
      },
      close() {
        closed++;
      },
    };
  });
  await send(valid);
  assert.equal(options.host, "smtp.gmail.com");
  assert.equal(options.port, 465);
  assert.equal(options.secure, true);
  assert.equal(options.tls.rejectUnauthorized, true);
  assert.equal(options.tls.minVersion, "TLSv1.2");
  assert.equal(options.logger, false);
  assert.equal(options.debug, false);
  assert.equal(options.disableFileAccess, true);
  assert.equal(options.disableUrlAccess, true);
  assert.equal(options.connectionTimeout, 10000);
  assert.equal(options.socket.destroyed, true);
  assert.equal(message.to, CONTACT_RECIPIENT);
  assert.equal(message.from, '"Vem Comigo" <' + CONTACT_RECIPIENT + ">");
  assert.equal(message.replyTo, valid.email);
  assert.deepEqual(message.envelope, {
    from: CONTACT_RECIPIENT,
    to: [CONTACT_RECIPIENT],
  });
  assert.ok(message.html.includes("Nova solicitação"));
  assert.ok(message.text.includes(valid.message));
  assert.equal(closed, 1);
  for (const invalid of [
    { ...config, user: "other@gmail.com" },
    { ...config, user: "" },
    { ...config, user: CONTACT_RECIPIENT + "\r\nBcc: x@example.org" },
    { ...config, appPassword: "" },
    { ...config, appPassword: "short" },
    { ...config, appPassword: "abcdefghijklmnop\n" },
  ])
    assert.equal(createMailSender(invalid), undefined);
  for (const result of [
    { accepted: [], rejected: [], response: "250 OK" },
    { accepted: [CONTACT_RECIPIENT], rejected: [], response: "354 Continue" },
    {
      accepted: [CONTACT_RECIPIENT],
      rejected: [CONTACT_RECIPIENT],
      response: "250 OK",
    },
    { accepted: ["other@gmail.com"], response: "250 OK" },
    {},
  ]) {
    let released = false;
    await assert.rejects(
      createMailSender(config, () => ({
        sendMail: async () => result,
        close() {
          released = true;
        },
      }))(valid),
    );
    assert.equal(released, true);
  }
});
