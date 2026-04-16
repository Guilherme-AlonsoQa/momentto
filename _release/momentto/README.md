# Momentto

Aplicação full-stack para criar páginas digitais personalizadas com fotos, mensagem especial, link público e QR Code. O cliente faz tudo no próprio site: escolhe um template, envia as imagens, informa os dados do presente, anexa o comprovante Pix e recebe o resultado final por e-mail.

## Stack

- Front-end: HTML, CSS vanilla e JavaScript puro
- Back-end: Node.js + Express
- Uploads: Multer
- Deploy: Netlify REST API
- QR Code: `qrcode`
- E-mail: Nodemailer com SMTP

## Estrutura

```text
momentto/
├── backend/
│   ├── generated/
│   ├── routes/
│   │   └── order.js
│   ├── services/
│   │   ├── mailer.js
│   │   ├── netlifyDeploy.js
│   │   ├── qrcode.js
│   │   └── templateEngine.js
│   ├── uploads/
│   ├── .env.example
│   ├── app.js
│   └── server.js
├── frontend/
│   ├── assets/
│   │   ├── css/style.css
│   │   ├── js/order.js
│   │   └── logo.svg
│   ├── templates/
│   │   ├── maes/template.html
│   │   ├── namorados/template.html
│   │   └── pais/template.html
│   ├── index.html
│   └── pedido.html
├── netlify/
│   └── functions/
│       └── api.js
├── netlify.toml
├── package.json
└── README.md
```

## Como rodar

1. Instale as dependências:

```bash
npm install
```

2. Crie o arquivo `backend/.env` a partir de `backend/.env.example`.

3. Preencha as variáveis:

```env
PORT=3000
NETLIFY_TOKEN=
NETLIFY_SITE_ID=
NETLIFY_ACCOUNT_SLUG=
NETLIFY_ORDER_DEPLOY_MODE=create_site
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
```

4. Inicie em desenvolvimento:

```bash
npm run dev
```

5. Abra `http://localhost:3000`.

## Fluxo do pedido

1. O cliente acessa `/pedido`.
2. Escolhe um dos três templates disponíveis.
3. Preenche os nomes, data opcional, e-mail e mensagem.
4. Envia até 10 fotos e um comprovante Pix em imagem ou PDF.
5. O backend:
   - salva os uploads temporariamente
   - renderiza o HTML final substituindo `{{recipientName}}`, `{{senderName}}`, `{{date}}`, `{{message}}` e `{{photos}}`
   - copia as fotos para a pasta gerada
   - cria um novo site de entrega no Netlify para cada pedido
   - compacta a página e publica no Netlify sem sobrescrever a vitrine principal
   - aguarda o deploy ficar pronto
   - gera o QR Code da URL pública
   - envia e-mail com link + QR Code inline
6. A rota retorna:

```json
{
  "ok": true,
  "url": "https://seu-site.netlify.app",
  "qrBase64": "data:image/png;base64,..."
}
```

## Arquitetura pública

- `https://momentto.netlify.app` funciona como storefront principal.
- A API pública roda na mesma origem via Netlify Functions em `/api/orders`.
- Cada pedido gera um novo site Netlify individual, como:

```text
https://momentto-cliente-final-1776122665919.netlify.app
```

- Isso evita que a vitrine principal seja sobrescrita por páginas de clientes.

## Observações de configuração

- O projeto usa a API oficial do Netlify para deploy por ZIP em `POST /api/v1/sites/{site_id}/deploys`, conforme a documentação oficial consultada em 13 de abril de 2026:
  - https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/
  - https://docs.netlify.com/deploy/create-deploys/
- A criação do site de entrega usa o endpoint oficial `POST /api/v1/{account_slug}/sites`, também documentado pela Netlify:
  - https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/
- O servidor depende de `fetch` nativo do Node.js. Use Node.js 18 ou superior.
- Para Gmail SMTP, normalmente é necessário usar senha de app em vez da senha principal da conta.
- Nesta versão não há banco de dados. Os arquivos enviados são temporários. Em produção serverless, os uploads e arquivos gerados usam diretórios temporários do runtime.
- O deploy público do storefront usa:
  - `frontend/` como diretório publicado
  - `netlify/functions/api.js` para expor a API
  - `netlify.toml` para redirecionar `/api/*` para a Function

## Scripts

- `npm run dev`: sobe o servidor com watch mode
- `npm start`: sobe o servidor normalmente
- `npm run zip`: gera `momentto.zip` na raiz do projeto

## Situação atual

- Storefront publicado: `https://momentto.netlify.app`
- API pública publicada: `https://momentto.netlify.app/api/orders`
- Fluxo online validado com geração real de site individual e envio por e-mail

## Empacotar o projeto

Depois de configurar tudo, execute:

```bash
npm run zip
```

Isso gera um arquivo `momentto.zip` com os diretórios `backend/`, `frontend/`, `package.json` e `README.md`, pronto para extrair e rodar.
