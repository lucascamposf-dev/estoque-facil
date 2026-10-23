# Caixa — Fase 1 (sangria/suprimento) + Fase 2 (venda agrupada)

Estrutura dos arquivos aqui dentro é só organizacional (pra facilitar achar as
coisas). Copie cada arquivo pra pasta correspondente no seu projeto real —
os `require`/`import` já estão escritos assumindo os caminhos que você já usa
(`../middleware/auth`, `../prismaClient`, `../paginas/...` etc).

## 1. Banco de dados

`backend/prisma/schema.prisma` — copie por cima do seu. Mudanças:
- `Sangria` ganhou `responsavelNome`
- Model novo `Suprimento` (reforço de caixa, oposto da sangria)
- Model novo `Venda` (agrupa os itens de um carrinho)
- `Movimentacao` ganhou `vendaId` (opcional, liga o item à venda que o originou)

Depois de copiar, rode:
```
npx prisma migrate dev --name caixa_sangria_suprimento_venda
```
Isso gera a migration certa comparando com o banco real. Se por algum motivo
não tiver acesso à rede/Prisma nesse momento, `backend/prisma/migration_caixa_fase1e2.sql`
tem o SQL equivalente escrito à mão, pra rodar direto no banco (mesmo padrão
que você já usa quando o sandbox não tem rede) — mas prefira o `migrate dev`
sempre que puder, porque ele mantém o histórico de migrations do Prisma
consistente.

## 2. Backend (rotas)

Tudo em `backend/routes/`, copie por cima dos seus arquivos de mesmo nome:

- **sangrias.js** — agora exige permissão `podeVerCaixa` (antes só pedia estar
  logado) e grava quem fez a sangria (`responsavelNome`)
- **suprimentos.js** (novo arquivo) — espelho da sangria, mas de reforço
- **vendas.js** (novo arquivo) — a peça central da Fase 2: registra o
  carrinho inteiro como uma única `Venda` (transação atômica), com
  `POST /vendas` (online) e `POST /vendas/sincronizar` (lote, offline)
- **movimentacoes.js** — passou a usar o helper `calcularPrecoUnitario`
  (ver abaixo) e corrige a baixa de estoque de dose avulsa, que antes
  debitava `estoqueAtual` em vez de `estoqueDoses`
- **relatorios.js** — `fechamento-dia` agora inclui suprimentos e corrige o
  saldo esperado em dinheiro (`dinheiro + suprimentos - sangrias`); a
  contagem de vendas agora conta vendas de verdade (via `vendaId`), não
  linhas de produto

`backend/utils/precificacao.js` (novo arquivo) — copie pra sua pasta `utils/`.
Corrige um bug real que apareceu no caminho: o backend ignorava
`precoCartao` e qualquer preço editado manualmente no carrinho, sempre
gravando pelo `precoVenda` normal. Isso significa que vendas no crédito/débito
com preço de cartão cadastrado podem ter fechado com menos dinheiro do que
realmente foi cobrado do cliente, até agora.

`backend/server.js` — só duas linhas novas (`require` e `app.use`) pras
rotas `/suprimentos` e `/vendas`. Aplique manualmente no seu `server.js` real
(não copie por cima, porque o seu tem outras rotas que não vieram nesse backup).

## 3. Frontend

- **frontend/src/db.js** — nova versão do Dexie (v4) com a tabela `vendas`;
  `contarPendentes` agora soma as duas filas (movimentações avulsas + vendas)
- **frontend/src/api.js** — funções novas: `registrarVendaOffline`,
  `registrarSangria`, `registrarSuprimento`; `sincronizarPendentes` agora
  sincroniza as duas tabelas
- **frontend/src/paginas/VendaRapida.jsx** — o checkout agora manda o
  carrinho inteiro numa chamada só (`registrarVendaOffline`), em vez de uma
  chamada por item
- **frontend/src/paginas/FechamentoCaixa.jsx** — formulário de sangria/suprimento
  (finalmente existe uma tela pra isso!), cartão "Caixa em dinheiro" mostrando
  suprimento + sangria + saldo esperado, e contagem de vendas do dia
- **frontend/src/paginas/HistoricoMovimentacoes.jsx** — fallback offline
  ajustado pra também ler a tabela `vendas`

## O que ficou de fora (de propósito)

- Cancelamento/estorno de venda ou sangria — combinamos deixar pra próxima fase
- Abertura de caixa com fundo de troco / fechamento persistido com contagem física
- Troco e desconto no PDV

## Testando depois de aplicar

1. Rode a migration
2. `npm install` se precisar (nada de dependência nova, só código)
3. Teste uma venda com 2+ itens na Venda Rápida → confirme que criou 1 `Venda`
   com 2 `Movimentacao` linkadas (`vendaId` preenchido) no banco
4. Teste sangria e suprimento na tela de Fechamento de Caixa
5. Teste uma venda no crédito com produto que tem `precoCartao` cadastrado →
   confira que o `valorTotal` gravado bate com o preço de cartão, não o normal
6. Teste offline: feche o wifi, faça uma venda, reabra o wifi, confirme que
   sincronizou (veja o badge de pendentes zerar)
