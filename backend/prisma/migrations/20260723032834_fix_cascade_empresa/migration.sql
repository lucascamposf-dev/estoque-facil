-- DropForeignKey
ALTER TABLE "clientes_fiado" DROP CONSTRAINT "clientes_fiado_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "funcionarios" DROP CONSTRAINT "funcionarios_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "movimentacoes" DROP CONSTRAINT "movimentacoes_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "produtos" DROP CONSTRAINT "produtos_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "sangrias" DROP CONSTRAINT "sangrias_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "vasilhame_emprestimos" DROP CONSTRAINT "vasilhame_emprestimos_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "vasilhames" DROP CONSTRAINT "vasilhames_empresaId_fkey";

-- Limpa dados de teste (nenhum usuário real ainda) antes de tornar "usuario" obrigatório.
-- Sem constraint de FK ativa neste ponto, então a ordem não importa.
TRUNCATE TABLE
  "movimentacoes",
  "pagamentos_fiado",
  "vasilhame_emprestimos",
  "unidades_venda",
  "clientes_fiado",
  "vasilhames",
  "sangrias",
  "produtos",
  "funcionarios",
  "empresas"
CASCADE;

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "usuario" TEXT NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "empresas_usuario_key" ON "empresas"("usuario");

-- AddForeignKey
ALTER TABLE "sangrias" ADD CONSTRAINT "sangrias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes_fiado" ADD CONSTRAINT "clientes_fiado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vasilhames" ADD CONSTRAINT "vasilhames_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vasilhame_emprestimos" ADD CONSTRAINT "vasilhame_emprestimos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;