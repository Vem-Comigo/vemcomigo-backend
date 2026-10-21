# Vem Comigo — envio institucional

API Express 5 + TypeScript, preparada para Vercel. O formulário envia somente para **contatovmc3567@gmail.com**, fixado no servidor. Resend é o serviço já existente, mantido com `fetch` nativo, HTML e texto simples. O e-mail do visitante é Reply-To; o remetente é o endereço autorizado configurado pela instituição. Não há confirmação automática ao visitante.

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
| `MAIL_API_KEY` | Chave privada Resend para teste controlado | Chave privada de envio |
| `MAIL_FROM` | Endereço autorizado pelo Resend | Endereço de domínio verificado |
| `CONTACT_PROXY_KEY` | Para testar o proxy completo | Segredo aleatório de 32–256 caracteres, igual nos dois projetos |
| `UPSTASH_REDIS_REST_URL` | Necessário ao simular produção | Endpoint HTTPS raiz do limitador compartilhado |
| `UPSTASH_REDIS_REST_TOKEN` | Necessário ao simular produção | Token privado do limitador |

Não existe configuração `MAIL_TO`: o destinatário não pode ser escolhido por requisição ou variável. `.env.example` não contém credenciais reais. `VERCEL=1` ou `NODE_ENV=production` exige proxy autenticado e limitação compartilhada, sem fallback em memória.

O destino ser Gmail não autoriza o uso de Gmail como remetente. Para produção, verificar domínio controlado pela instituição no Resend e definir `MAIL_FROM` com um endereço desse domínio, sem nome de exibição. O código aplica `Vem Comigo <endereço>`. A restrição do remetente de teste Resend e o passo a passo completo estão no [guia do front-end no GitHub](https://github.com/Vem-Comigo/vemcomigo-frontend/blob/main/docs/contact-vercel.md); o arquivo correspondente está no checkout `../vemcomigo-frontend/docs/contact-vercel.md`. Esse link remoto só refletirá esta mudança após o push solicitado pelo usuário.

## Vercel e proteção

`src/app.ts` exporta a aplicação Express para o preset definido em `vercel.json`. `src/server.ts` serve o desenvolvimento local. Preservamos os repositórios separados: o projeto front-end possui `/api/contact`, que encaminha por HTTPS à API com segredo privado e identificador HMAC derivado da conexão. Configurar os dois projetos e a origem exata; não é necessário CORS público.

O limite compartilhado usa Upstash Redis REST, sem SDK. Uma operação Lua atômica conta até 5 tentativas por identificador em uma janela de 900 segundos. A chave tem hash e expiração: não armazena corpo, nome, e-mail ou IP bruto do visitante. Falha/timeout/configuração ausente do limitador retorna 503 antes de enviar. O contador em memória só é usado no desenvolvimento local e não é proteção persistente.

Requisições são limitadas a 16 KB no proxy e no Express. O servidor valida tipos, campos permitidos, formatos, limites e honeypot. Campos internos extras são rejeitados. Mensagens são escapadas no HTML; cabeçalhos não aceitam CR/LF; credenciais, assunto e remetente não vêm do visitante. O corpo também tem alternativa em texto simples. Recebimento é datado no servidor e formatado em `America/Sao_Paulo`.

Timeouts: limitador 2,5 s; Resend 10 s; proxy 16 s; cliente 20 s; funções configuradas com duração máxima de 20 s. Não há retries automáticos. 202 `{ "accepted": true }` significa aceitação pelo serviço, sem garantia de entrega na caixa de entrada. Timeout ou ausência de confirmação retorna erro e o cliente conserva os dados.

Erros públicos são genéricos; não há logs de conteúdo ou respostas privadas do provedor. API usa `no-store`, `nosniff`, `DENY`, CSP restritiva, Referrer-Policy e Permissions-Policy. O navegador usa o domínio do portal; a API não libera CORS. `trust proxy` permanece false: o IP bruto não é aceito por cabeçalhos externos no Express. O identificador recebido em produção só é usado após autenticar o proxy.

## Prévia do e-mail, sem envio

```powershell
npm.cmd run preview:email
```

Abre-se `.cache/email-preview/contato.html` no navegador; `.cache/email-preview/contato.txt` contém a alternativa em texto. Os dados são explicitamente fictícios e a data é fixa para revisão. Para servir a prévia:

```powershell
npm.cmd run preview:email -- --serve
```

Acessar `http://127.0.0.1:4174` ou `/texto`. Nenhuma credencial é necessária e o script não chama o Resend. A prévia não é incluída nos arquivos públicos do portal.

O template preserva a identidade roxa/amarela já pesquisada para o portal e usa tabela de 600 px com largura fluida, estilos inline, Arial e moldura condicional para Outlook. Não depende de SVG, fontes externas, JavaScript ou imagens remotas. O `Banner Vem comigo.svg` fornecido permanece intacto no repositório de assets; o cabeçalho do e-mail é textual. Não foram inventados fotos ou depoimentos. A pesquisa complementar no Refero retornou padrões de confirmação em páginas, não provas de renderização em clientes de e-mail; a composição segue a identidade existente e as restrições deste pedido.

## Entrega e pendências

18 testes do backend e 11 do front-end passaram com mocks, mais tipos, builds e lint disponível no front-end. A prévia foi inspecionada no Edge em 760/360 px; os estados da interface foram testados com todas as chamadas interceptadas, sem envio real. Não foi validada a renderização nos aplicativos Gmail/Outlook, o build remoto autenticado na Vercel ou a entrega real.

Ainda faltam contas/configurações privadas de Resend/Upstash, remetente autorizado/domínio verificado, URLs reais e segredo compartilhado nos dois projetos Vercel. A instituição deve revisar o tratamento e retenção de mensagens no provedor e na equipe; não foi presumido prazo ou conformidade legal. Não ativar rastreamento de abertura/cliques sem uma decisão institucional. Nenhum push, deploy ou envio real foi feito nesta etapa.

Fontes: [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email), [domínios verificados](https://resend.com/docs/dashboard/domains/introduction), [Express na Vercel](https://vercel.com/docs/frameworks/backend/express), [Upstash REST](https://upstash.com/docs/redis/features/restapi).
