# Sobre este zip

Reorganizei seu backup (que veio com todos os arquivos soltos, sem pastas) na
estrutura real do projeto, com base nos `import`/`require` de cada arquivo:

```
estoque-app/
├── README.md               (original)
├── .gitignore               (original)
├── backend/
│   ├── server.js
│   ├── prismaClient.js
│   ├── .env.example
│   ├── package.json         ⚠️ RECONSTRUÍDO (veja abaixo)
│   ├── prisma/
│   │   ├── schema.prisma    (original + campos de venda por dose)
│   │   └── migrations/
│   │       ├── migration_lock.toml
│   │       └── LEIA-ANTES-de-usar-migration-antiga.sql (não é a migração atual, veja o aviso dentro do arquivo)
│   ├── routes/               (produtos.js, movimentacoes.js, auth.js, etc.)
│   ├── middleware/
│   │   └── auth.js          ⚠️ RECONSTRUÍDO (veja abaixo)
│   └── utils/                (data.js, rateLimiter.js, vencimentos.js)
└── frontend/
    ├── index.html, vite.config.js, package.json, package-lock.json
    ├── public/                (ícones)
    └── src/
        ├── main.jsx, App.jsx, api.js, db.js, theme.css
        ├── paginas/           (VendaRapida.jsx, Estoque.jsx, EditarProduto.jsx, etc.)
        ├── componentes/       (LeitorCodigoBarras.jsx, FormularioUnidadeVenda.jsx, ListaUnidadesVenda.jsx)
        └── utils/redimensionarFoto.js
```

## ⚠️ Dois arquivos precisaram ser reconstruídos

Quando tudo foi zipado numa pasta só (sem estrutura), **dois pares de
arquivos com o mesmo nome se sobrescreveram** e um deles se perdeu:

1. **`backend/middleware/auth.js`** — existia um `routes/auth.js` (rotas de
   login) e um `middleware/auth.js` (a função `autenticar`/`exigirAdmin` que
   todas as outras rotas usam). Só o `routes/auth.js` sobreviveu no backup.
   Reconstruí o `middleware/auth.js` observando como ele é usado no resto do
   código (`req.empresaId`, `req.nomeResponsavel`, `req.papel`, etc.) — ele
   tem comentários no topo explicando isso. **Compare com a versão real do
   seu projeto (Git, ou o que já está publicado no Railway) antes de usar em
   produção**, principalmente a parte de como resolver `nomeResponsavel`.

2. **`backend/package.json`** — o backup só trouxe o `package.json` do
   frontend (nome `estoque-frontend`), porque tem o mesmo nome de arquivo do
   `package.json` do backend. Reconstruí a lista de dependências olhando o
   que cada arquivo do backend importa (`express`, `cors`, `dotenv`,
   `bcryptjs`, `jsonwebtoken`, `multer`, `xlsx`, `@prisma/client`, `prisma`).
   Rode `npm install` no backend e confira se falta algo.

**Causa raiz pra próximos backups:** se o backup for gerado de novo do jeito
"tudo numa pasta só", isso vai voltar a acontecer com qualquer arquivo que
tenha nome repetido em pastas diferentes (esses dois casos, mas pode ter
outros que não notei). Se puder, gere o backup preservando as pastas
(`zip -r backup.zip backend frontend` a partir da raiz do projeto).

## O que mudou de verdade (a feature de venda por dose)

Isso já estava explicado na mensagem anterior — resumindo:
- `Produto` ganhou `vendeDose`, `dosesPorUnidade`, `precoDose`,
  `precoDoseCartao`, `estoqueDoses`.
- `Movimentacao` ganhou `ehDose`.
- Novo endpoint `POST /produtos/:id/abrir-dose` (converte unidade fechada em
  doses avulsas).
- `EditarProduto.jsx`/`CadastrarProduto.jsx`: configurar a dose do produto.
- `Estoque.jsx`: botão "Abrir garrafa p/ doses".
- `VendaRapida.jsx`: botão "🥃 Dose", só nos produtos com `vendeDose` ativo.

## Como aplicar

1. Extraia este zip por cima do seu repositório (ou use como novo repositório).
2. `cd backend && npm install`
3. Confira `backend/middleware/auth.js` contra sua versão real (item 1 acima).
4. `npx prisma generate`
5. `npx prisma migrate dev --name venda_por_dose`
6. `npm run dev` no backend, e `cd frontend && npm install && npm run dev` no frontend.
