-- CreateTable
CREATE TABLE "historico_precos" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "precoAntigo" DECIMAL(10,2) NOT NULL,
    "precoNovo" DECIMAL(10,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empresaId" TEXT NOT NULL,

    CONSTRAINT "historico_precos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "historico_precos" ADD CONSTRAINT "historico_precos_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_precos" ADD CONSTRAINT "historico_precos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
