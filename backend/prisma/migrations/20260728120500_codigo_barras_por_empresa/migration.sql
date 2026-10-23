/*
  Warnings:

  - A unique constraint covering the columns `[empresaId,codigoBarras]` on the table `produtos` will be added. If there are existing duplicate values (mesmo código de barras em empresas diferentes), essa migration falha ao criar a constraint.

  IMPORTANTE: antes de aplicar essa migration em produção, rode a query abaixo
  no banco pra confirmar que não existe o mesmo código de barras cadastrado em
  empresas diferentes hoje:

    SELECT "codigoBarras", COUNT(DISTINCT "empresaId")
    FROM produtos
    WHERE "codigoBarras" IS NOT NULL
    GROUP BY "codigoBarras"
    HAVING COUNT(DISTINCT "empresaId") > 1;

  Se vier alguma linha, resolva a duplicidade (renomeando/ajustando o código
  de barras de um dos produtos) antes de rodar `prisma migrate deploy`.
*/

-- DropIndex
DROP INDEX "produtos_codigoBarras_key";

-- CreateIndex
CREATE UNIQUE INDEX "produtos_empresaId_codigoBarras_key" ON "produtos"("empresaId", "codigoBarras");
