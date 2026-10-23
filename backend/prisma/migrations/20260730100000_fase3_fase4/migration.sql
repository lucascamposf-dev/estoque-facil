-- Fase 4: assinatura/plano na Empresa
-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "plano" TEXT DEFAULT 'BASICO',
ADD COLUMN     "valorMensalidade" DECIMAL(10,2),
ADD COLUMN     "dataVencimento" TIMESTAMP(3);

-- Fase 3: custo médio no produto
-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "precoCustoMedio" DECIMAL(10,2);

-- Fase 3: fornecedor + custo unitário na movimentação
-- AlterTable
ALTER TABLE "movimentacoes" ADD COLUMN     "fornecedorId" TEXT,
ADD COLUMN     "custoUnitario" DECIMAL(10,2);

-- Fase 3: tabela de fornecedores
-- CreateTable
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- Fase 3: inventário / contagem física
-- CreateEnum
CREATE TYPE "StatusInventario" AS ENUM ('EM_ANDAMENTO', 'FINALIZADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "inventarios" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "status" "StatusInventario" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "responsavelNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),

    CONSTRAINT "inventarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_inventario" (
    "id" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "estoqueSistema" INTEGER NOT NULL,
    "estoqueContado" INTEGER,
    "contadoEm" TIMESTAMP(3),

    CONSTRAINT "itens_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "itens_inventario_inventarioId_produtoId_key" ON "itens_inventario"("inventarioId", "produtoId");

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_inventario" ADD CONSTRAINT "itens_inventario_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "inventarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_inventario" ADD CONSTRAINT "itens_inventario_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
