-- CreateEnum
CREATE TYPE "StatusContagem" AS ENUM ('ABERTA', 'FINALIZADA');

-- CreateTable
CREATE TABLE "contagens_estoque" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "status" "StatusContagem" NOT NULL DEFAULT 'ABERTA',
    "responsavelNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),

    CONSTRAINT "contagens_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_contagem" (
    "id" TEXT NOT NULL,
    "contagemId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "estoqueSistema" INTEGER NOT NULL,
    "estoqueContado" INTEGER,
    "contadoEm" TIMESTAMP(3),

    CONSTRAINT "itens_contagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "itens_contagem_contagemId_produtoId_key" ON "itens_contagem"("contagemId", "produtoId");

-- AddForeignKey
ALTER TABLE "contagens_estoque" ADD CONSTRAINT "contagens_estoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_contagem" ADD CONSTRAINT "itens_contagem_contagemId_fkey" FOREIGN KEY ("contagemId") REFERENCES "contagens_estoque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_contagem" ADD CONSTRAINT "itens_contagem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
