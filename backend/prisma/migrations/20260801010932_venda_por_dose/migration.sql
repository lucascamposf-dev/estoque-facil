/*
  Warnings:

  - You are about to drop the `contagens_estoque` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `itens_contagem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "contagens_estoque" DROP CONSTRAINT "contagens_estoque_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "itens_contagem" DROP CONSTRAINT "itens_contagem_contagemId_fkey";

-- DropForeignKey
ALTER TABLE "itens_contagem" DROP CONSTRAINT "itens_contagem_produtoId_fkey";

-- AlterTable
ALTER TABLE "movimentacoes" ADD COLUMN     "ehDose" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "dosesPorUnidade" INTEGER,
ADD COLUMN     "estoqueDoses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "precoDose" DECIMAL(10,2),
ADD COLUMN     "precoDoseCartao" DECIMAL(10,2),
ADD COLUMN     "vendeDose" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "contagens_estoque";

-- DropTable
DROP TABLE "itens_contagem";

-- DropEnum
DROP TYPE "StatusContagem";
