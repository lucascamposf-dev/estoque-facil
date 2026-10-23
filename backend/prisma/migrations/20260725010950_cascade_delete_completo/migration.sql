-- DropForeignKey
ALTER TABLE "movimentacoes" DROP CONSTRAINT "movimentacoes_clienteFiadoId_fkey";

-- DropForeignKey
ALTER TABLE "movimentacoes" DROP CONSTRAINT "movimentacoes_produtoId_fkey";

-- DropForeignKey
ALTER TABLE "pagamentos_fiado" DROP CONSTRAINT "pagamentos_fiado_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "unidades_venda" DROP CONSTRAINT "unidades_venda_produtoId_fkey";

-- DropForeignKey
ALTER TABLE "vasilhame_emprestimos" DROP CONSTRAINT "vasilhame_emprestimos_clienteFiadoId_fkey";

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_clienteFiadoId_fkey" FOREIGN KEY ("clienteFiadoId") REFERENCES "clientes_fiado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos_fiado" ADD CONSTRAINT "pagamentos_fiado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes_fiado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vasilhame_emprestimos" ADD CONSTRAINT "vasilhame_emprestimos_clienteFiadoId_fkey" FOREIGN KEY ("clienteFiadoId") REFERENCES "clientes_fiado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidades_venda" ADD CONSTRAINT "unidades_venda_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
