# Estoque Fácil

Sistema de controle de estoque simples e offline-first para lojas e distribuidoras de bebidas de rua.

## Estrutura

```
estoque-app/
├── backend/     -> API Node.js + Express + Prisma (PostgreSQL)
└── frontend/    -> PWA React + Vite, funciona offline com Dexie.js (IndexedDB)
```

## Rodando o backend localmente

1. Entre na pasta: `cd backend`
2. Instale as dependências: `npm install`
3. Copie `.env.example` para `.env` e preencha `DATABASE_URL` (veja abaixo como pegar isso do Railway)
4. Gere o client do Prisma: `npx prisma generate`
5. Crie as tabelas no banco: `npx prisma migrate dev --name init`
6. Suba o servidor: `npm run dev`
7. Teste em `http://localhost:3333` — deve responder `{"status":"ok",...}`

## Subindo o backend + banco no Railway

1. Crie uma conta em [railway.app](https://railway.app) e um novo projeto.
2. Clique em "New" > "Database" > "PostgreSQL". Isso cria o banco.
3. Clique em "New" > "GitHub Repo" (suba esse código pro GitHub primeiro) apontando pra pasta `backend`.
4. No serviço do backend, vá em "Variables" e adicione `DATABASE_URL` copiando de "Connect" na aba do banco Postgres (Railway às vezes já linka automático se estiverem no mesmo projeto).
5. Em "Settings" do serviço backend, defina o "Root Directory" como `backend` (já que o repo tem front e back juntos).
6. Depois do primeiro deploy, rode as migrações: no painel do Railway tem uma aba de terminal ("Deploy Logs" > shell), ou rode local com o `DATABASE_URL` de produção: `npx prisma migrate deploy`.
7. Railway vai te dar uma URL pública tipo `https://seu-projeto.up.railway.app` — é essa URL que vai no frontend.

## Rodando o frontend localmente

1. Entre na pasta: `cd frontend`
2. Instale as dependências: `npm install`
3. Crie um arquivo `.env` com: `VITE_API_URL=http://localhost:3333` (ou a URL do Railway, quando o backend já estiver no ar)
4. Rode: `npm run dev`
5. Abra o endereço que aparecer no terminal (normalmente `http://localhost:5173`) no celular (mesma rede wifi) ou no navegador do computador

## Testando o modo offline

1. Rode `npm run build` e depois `npm run preview` no frontend (o modo offline só funciona no build de produção, o `npm run dev` não ativa o service worker)
2. Abra o app no navegador, use uma vez com internet (isso guarda o app e os produtos em cache)
3. Ative o modo avião ou desative o wifi
4. Registre uma venda ou entrada — vai aparecer "Sem internet · salvando local" no topo, e a movimentação fica marcada como pendente
5. Reative a internet — o app sincroniza sozinho em segundo plano

## Próximos passos sugeridos

- [ ] Adicionar leitura de código de barras pela câmera na tela de cadastro (biblioteca `html5-qrcode` funciona bem em PWA)
- [ ] Tela de clientes fiado (a rota de backend `/clientes-fiado` já existe, falta a tela)
- [ ] Autenticação simples (hoje qualquer um com o link acessa o app)
- [ ] Troca de foto real de produto (hoje é só um ícone de garrafa)
- [ ] Deploy do frontend (ex: Vercel ou Netlify, é só HTML/JS estático depois do build)
