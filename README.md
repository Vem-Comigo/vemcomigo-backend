# Vem Comigo — envio institucional

API Express 5 + TypeScript, preparada para Vercel. O formulário envia somente para **contatovmc3567@gmail.com**, fixado no servidor. O envio usa Nodemailer com Gmail SMTP, TLS na porta 465, HTML e texto simples. O e-mail do visitante é Reply-To; o remetente fixo é "Vem Comigo" <contatovmc3567@gmail.com>. Não há confirmação automática ao visitante.

## Executar

Requisito: Node.js 24 e npm. No PowerShell, usar `npm.cmd` se a política impedir `npm.ps1`.

```powershell
cd vemcomigo-backend
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

Iniciar também o front-end e abrir `http://localhost:5173`. Sem credenciais, o backend continua respondendo a `/api/health`, mas o contato retorna 503. Não há sucesso simulado. Nunca compartilhar o conteúdo de `.env` ou registrar mensagens completas.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd start
```

Os testes usam mocks e não enviam e-mails. Não há linter configurado neste repositório. Os arquivos de banco herdados permanecem sem conexão automática ou participação no contato.

## Configuração

| Variável | Local | Vercel/produção |
| --- | --- | --- |
| `PORT` | Padrão 3000 | Gerenciado pela plataforma |
| `CONTACT_ORIGIN` | `http://localhost:5173` | Origem HTTPS exata do portal, sem barra final |
| `SMTP_USER` | Conta institucional fixa | Conta institucional fixa |
| `SMTP_APP_PASSWORD` | Senha de app privada da mesma conta | Senha de app privada da mesma conta |
| `CONTACT_PROXY_KEY` | Para testar o proxy completo | Segredo aleatório de 32–256 caracteres, igual nos dois projetos |
| `UPSTASH_REDIS_REST_URL` | Necessário ao simular produção | Endpoint HTTPS raiz do limitador compartilhado |
| `UPSTASH_REDIS_REST_TOKEN` | Necessário ao simular produção | Token privado do limitador |

Não existe configuração `MAIL_TO`: o destinatário não pode ser escolhido por requisição ou variável. `.env.example` não contém credenciais reais. `VERCEL=1` ou `NODE_ENV=production` exige proxy autenticado e limitação compartilhada, sem fallback em memória.

Usar a conta institucional em `SMTP_USER` e sua senha de app em `SMTP_APP_PASSWORD`, nunca a senha comum da conta. A conta deve permitir senhas de app e manter verificação em duas etapas. A senha de app já foi gerada pelo responsável, mas não foi lida ou validada. Apenas espaços de agrupamento são removidos na memória. Remetente, destinatário, host e porta são fixos no código; outra conta é recusada. Não é preciso verificar domínio no Resend. `MAIL_API_KEY` e `MAIL_FROM` não são mais usadas. Ver o [guia de configuração](https://github.com/Vem-Comigo/vemcomigo-frontend/blob/main/docs/contact-vercel.md), também disponível em `../vemcomigo-frontend/docs/contact-vercel.md` no checkout.

## Vercel e proteção

`src/app.ts` exporta a aplicação Express para o preset definido em `vercel.json`. `src/server.ts` serve o desenvolvimento local. Preservamos os repositórios separados: o projeto front-end possui `/api/contact`, que encaminha por HTTPS à API com segredo privado e identificador HMAC derivado da conexão. Configurar os dois projetos e a origem exata; não é necessário CORS público.

O limite compartilhado usa Upstash Redis REST, sem SDK. Uma operação Lua atômica conta até 5 tentativas por identificador em uma janela de 900 segundos. A chave tem hash e expiração: não armazena corpo, nome, e-mail ou IP bruto do visitante. Falha/timeout/configuração ausente do limitador retorna 503 antes de enviar. O contador em memória só é usado no desenvolvimento local e não é proteção persistente.

Requisições são limitadas a 16 KB no proxy e no Express. O servidor valida tipos, campos permitidos, formatos, limites e honeypot. Campos internos extras são rejeitados. Mensagens são escapadas no HTML; cabeçalhos não aceitam CR/LF; credenciais, assunto e remetente não vêm do visitante. O corpo também tem alternativa em texto simples. Recebimento é datado no servidor e formatado em `America/Sao_Paulo`.

Timeouts: limitador 2,5 s; SMTP 10 s (deadline total com destruição do socket); proxy 16 s; cliente 20 s; funções configuradas com duração máxima de 20 s. Não há retries automáticos. 202 `{ "accepted": true }` significa aceitação pelo servidor SMTP, sem garantia de entrega na caixa de entrada. Timeout ou ausência de confirmação retorna erro e o cliente conserva os dados.

Erros públicos são genéricos; não há logs de conteúdo ou respostas privadas do provedor. API usa `no-store`, `nosniff`, `DENY`, CSP restritiva, Referrer-Policy e Permissions-Policy. O navegador usa o domínio do portal; a API não libera CORS. `trust proxy` permanece false: o IP bruto não é aceito por cabeçalhos externos no Express. O identificador recebido em produção só é usado após autenticar o proxy.

## Prévia do e-mail, sem envio

```powershell
npm.cmd run preview:email
```

Abre-se `.cache/email-preview/contato.html` no navegador; `.cache/email-preview/contato.txt` contém a alternativa em texto. Os dados são explicitamente fictícios e a data é fixa para revisão. Para servir a prévia:

```powershell
npm.cmd run preview:email -- --serve
```

Acessar `http://127.0.0.1:4174` ou `/texto`. Nenhuma credencial é necessária e o script não abre conexão SMTP. A prévia não é incluída nos arquivos públicos do portal.

O template preserva a identidade roxa/amarela já pesquisada para o portal e usa tabela de 600 px com largura fluida, estilos inline, Arial e moldura condicional para Outlook. Não depende de SVG, fontes externas, JavaScript ou imagens remotas. O `Banner Vem comigo.svg` fornecido permanece intacto no repositório de assets; o cabeçalho do e-mail é textual. Não foram inventados fotos ou depoimentos. A pesquisa complementar no Refero retornou padrões de confirmação em páginas, não provas de renderização em clientes de e-mail; a composição segue a identidade existente e as restrições deste pedido.

## Entrega e pendências

21 testes do backend e 11 do front-end passaram com mocks, mais tipos, builds e lint disponível no front-end. A prévia e os estados da interface já haviam sido inspecionados no Edge na etapa anterior, com chamadas interceptadas. Nesta troca de provedor, o template foi preservado e a prévia fictícia foi gerada novamente, sem novo teste visual no navegador. Não foi validada a renderização nos aplicativos Gmail/Outlook, o build remoto autenticado na Vercel ou a entrega real.

Ainda é necessário cadastrar/verificar SMTP_USER, SMTP_APP_PASSWORD, as credenciais Upstash, URLs e segredo compartilhado nos projetos Vercel, sem valores públicos. Cadastro e validade remotos não foram inspecionados. Não houve publicação nem envio real nesta alteração. A configuração local não depende do MongoDB.

Fontes: [Gmail no Nodemailer](https://nodemailer.com/guides/using-gmail), [SMTP](https://nodemailer.com/smtp), [SMTP na Vercel](https://vercel.com/kb/guide/serverless-functions-and-smtp), [Express na Vercel](https://vercel.com/docs/frameworks/backend/express).
