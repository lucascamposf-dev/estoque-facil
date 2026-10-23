/*
  Warnings:

  - A unique constraint covering the columns `[empresaId,usuario]` on the table `funcionarios` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TipoVasilhameMovimento" AS ENUM ('EMPRESTADO', 'DEVOLVIDO');

-- CreateEnum
CREATE TYPE "CategoriaProduto" AS ENUM ('CERVEJA', 'REFRIGERANTE', 'AGUA', 'ENERGETICO', 'DESTILADO', 'OUTROS');

-- DropIndex
DROP INDEX "funcionarios_usuario_key";

-- AlterTable
ALTER TABLE "clientes_fiado" ADD COLUMN     "limiteCredito" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "movimentacoes" ADD COLUMN     "quantidadeVendida" INTEGER,
ADD COLUMN     "unidadeVendaId" TEXT;

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "categoria" "CategoriaProduto" NOT NULL DEFAULT 'OUTROS';

-- CreateTable
CREATE TABLE "sangrias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sangrias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vasilhames" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vasilhames_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vasilhame_emprestimos" (
    "id" TEXT NOT NULL,
    "vasilhameId" TEXT NOT NULL,
    "clienteFiadoId" TEXT,
    "clienteNomeAvulso" TEXT,
    "quantidade" INTEGER NOT NULL,
    "tipo" "TipoVasilhameMovimento" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empresaId" TEXT NOT NULL,

    CONSTRAINT "vasilhame_emprestimos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades_venda" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "quantidadeEmUnidades" INTEGER NOT NULL,
    "precoVenda" DECIMAL(10,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidades_venda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funcionarios_empresaId_usuario_key" ON "funcionarios"("empresaId", "usuario");

-- AddForeignKey
ALTER TABLE "sangrias" ADD CONSTRAINT "sangrias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vasilhames" ADD CONSTRAINT "vasilhames_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vasilhame_emprestimos" ADD CONSTRAINT "vasilhame_emprestimos_vasilhameId_fkey" FOREIGN KEY ("vasilhameId") REFERENCES "vasilhames"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vasilhame_emprestimos" ADD CONSTRAINT "vasilhame_emprestimos_clienteFiadoId_fkey" FOREIGN KEY ("clienteFiadoId") REFERENCES "clientes_fiado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vasilhame_emprestimos" ADD CONSTRAINT "vasilhame_emprestimos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidades_venda" ADD CONSTRAINT "unidades_venda_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
