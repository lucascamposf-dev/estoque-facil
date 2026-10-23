-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "dataValidade" TIMESTAMP(3),
ADD COLUMN     "diasAlertaValidade" INTEGER DEFAULT 7;
