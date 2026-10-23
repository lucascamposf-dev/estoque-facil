-- Migration manual: Fase 1 (sangria/suprimento) + Fase 2 (venda agrupada)
-- Prefira gerar isso com `npx prisma migrate dev --name caixa_sangria_suprimento_venda`,
-- que compara com o banco real e cria a pasta certa em backend/prisma/migrations/.
-- Este arquivo é só um fallback caso precise aplicar manualmente (mesmo padrão que
-- você já vem usando quando o sandbox não tem acesso à rede).

-- AlterTable: responsavelNome na sangria (mesmo padrão já usado em "movimentacoes")
ALTER TABLE "sangrias" ADD COLUMN "responsavelNome" TEXT;

-- CreateTable: suprimentos (reforço de caixa, oposto da sangria)
CREATE TABLE "suprimentos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "motivo" TEXT,
    "responsavelNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suprimentos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "suprimentos" ADD CONSTRAINT "suprimentos_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: vendas (agrupa os itens de um mesmo carrinho/checkout)
CREATE TABLE "vendas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "formaPagamento" "FormaPagamento" NOT NULL,
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "clienteFiadoId" TEXT,
    "responsavelNome" TEXT,
    "idLocal" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendas_idLocal_key" ON "vendas"("idLocal");

ALTER TABLE "vendas" ADD CONSTRAINT "vendas_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendas" ADD CONSTRAINT "vendas_clienteFiadoId_fkey"
    FOREIGN KEY ("clienteFiadoId") REFERENCES "clientes_fiado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: liga cada item de venda (Movimentacao) à Venda que o originou
ALTER TABLE "movimentacoes" ADD COLUMN "vendaId" TEXT;

ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_vendaId_fkey"
    FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
