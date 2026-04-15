-- AlterTable
ALTER TABLE "FotoLaudo"
  ALTER COLUMN "dados" DROP NOT NULL,
  ADD COLUMN "caminhoArquivo" TEXT;
