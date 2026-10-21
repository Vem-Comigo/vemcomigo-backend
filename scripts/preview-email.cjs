const { mkdirSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createServer } = require("node:http");
const { renderContactEmail } = require("../dist/contact/template");

const email = renderContactEmail(
  {
    name: "Pessoa Fictícia — prévia de teste",
    school: "Escola Exemplo (dados fictícios)",
    role: "Professora fictícia",
    city: "Cidade Exemplo / UF",
    email: "docente@example.invalid",
    phone: "",
    interest: "Formação de professores",
    message:
      "PRÉVIA COM DADOS FICTÍCIOS — NÃO ENVIADA.\n\nOlá, equipe Vem Comigo!\nGostaríamos de conhecer a formação de professores e o acompanhamento das CCAs.\n\nPodemos conversar sobre as possibilidades para nossa escola?",
  },
  new Date("2026-10-21T15:30:00Z"),
);
const output = resolve(".cache/email-preview");
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, "contato.html"), email.html, "utf8");
writeFileSync(resolve(output, "contato.txt"), email.text, "utf8");
console.log(`Prévia fictícia, sem envio: ${resolve(output, "contato.html")}`);
if (process.argv.includes("--serve")) {
  createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type":
        req.url === "/texto"
          ? "text/plain; charset=utf-8"
          : "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(req.url === "/texto" ? email.text : email.html);
  }).listen(4174, "127.0.0.1", () =>
    console.log("Prévia local: http://127.0.0.1:4174"),
  );
}
