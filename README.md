# Vem Comigo — contato institucional

API Express 5 + TypeScript. O portal usa somente os endpoints de saúde e contato. Não há login, cadastro, armazenamento de mensagens ou conexão automática com MongoDB. Os arquivos de banco herdados permanecem no repositório, sem integrar o fluxo institucional.

## Executar

Requisito: **Node.js 24 LTS** e npm.

```powershell
cd vemcomigo-backend
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

API em `http://localhost:3000`. `GET /api/health` responde `{ "status": "ok" }`. A ausência de credenciais mantém o servidor funcionando e o contato responde **503**, sem enviar mensagem.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd start
```

Não há linter configurado neste repositório. Os testes nativos do Node usam servidor efêmero e adaptadores falsos; **não enviam e-mails reais**. O observador `tsx` substitui `ts-node-dev`, cuja dependência transitiva apresentava vulnerabilidade sem correção compatível. O lockfile passou a ser versionado para instalação reproduzível.

## Configuração privada

| Variável | Uso |
| --- | --- |
| `PORT` | Porta da API, padrão 3000 |
| `CONTACT_ORIGIN` | Origem exata do portal, padrão `http://localhost:5173`, sem caminho ou barra final |
| `MAIL_API_KEY` | Chave privada Resend, somente no servidor |
| `MAIL_FROM` | Um único endereço remetente de domínio verificado no provedor |
| `MAIL_TO` | Um único destinatário institucional confirmado, fixado no servidor |

O adaptador usa `fetch` nativo, sem SDK ou scripts no cliente. Contrato consultado: [Send Email — Resend](https://resend.com/docs/api-reference/emails/send-email). Não foram criados conta, domínio ou credenciais. Confirmar o provedor e suas condições com a instituição antes de habilitar o envio. Para outro serviço, substituir `src/contact/mail.ts` mantendo o contrato `MailSender`.

O resultado **202 `{ "accepted": true }`** significa aceitação pelo serviço de envio, não comprovação de entrega ao destinatário. Timeout ou resposta sem confirmação retorna 502; não há repetição automática para evitar duplicação em casos incertos.

## Proteções implementadas

- `POST /api/contact`: JSON de até 16 KB; validação independente de tipos, campos permitidos, obrigatoriedade, limites, interesse, telefone e e-mail. Honeypot deve estar vazio.
- Origem exata obrigatória, sem CORS público e sem cookies de autenticação. Formatos simples externos são rejeitados. Isso reduz CSRF de navegador; não substitui controles contra bots capazes de forjar cabeçalhos.
- Destinatário, remetente e assunto definidos no servidor. Resposta ao e-mail validado; CR/LF e caracteres de controle rejeitados nos campos de linha única. Corpo enviado como texto, nunca HTML do visitante.
- Até 5 tentativas por IP em 15 minutos, com `Retry-After`; entradas expiram e o mapa tem limite de tamanho. O limitador em memória é por processo e perde o estado no reinício. Não persiste IPs em banco ou logs.
- Sem log de mensagens, dados pessoais ou respostas internas do provedor. Falhas públicas genéricas. Respostas `no-store`, `nosniff`, `DENY`, CSP restritiva, Referrer-Policy e Permissions-Policy.
- `.env` ignorado e `.env.example` apenas com campos vazios/padrões locais. Não retornar credenciais ao navegador.

## Infraestrutura e pendências

Servir o front-end e `/api` sob a mesma origem HTTPS e configurar `CONTACT_ORIGIN` com esse domínio. A API não expõe CORS: o navegador usa somente `/api/contact` do domínio do portal. Cabeçalhos do front-end dependem da hospedagem; ver README do front-end.

`trust proxy` permanece **false** para não aceitar IP arbitrário em `X-Forwarded-For`. Atrás de proxy, o IP percebido poderá ser o do proxy, agrupando visitantes no mesmo limite. Antes de produção, definir os proxies confiáveis conforme a topologia real e testar, seguindo [Express behind proxies](https://expressjs.com/en/guide/behind-proxies/). Em múltiplas instâncias, aplicar limitação compartilhada no gateway/WAF. Ajustar limites globais, tamanho, timeouts e conexão na infraestrutura e acrescentar desafio antispam proporcional se o abuso justificar.

HTTPS, HSTS, proxy confiável, limitação distribuída, destinatário, domínio verificado, credenciais, monitoração sem dados pessoais e política institucional para mensagens ainda dependem da infraestrutura/equipe. Não há promessa de segurança absoluta ou conformidade jurídica presumida. Não usar o portal para denúncias ou atendimento de urgência.

Nenhum push, envio real de teste ou deploy foi realizado.
