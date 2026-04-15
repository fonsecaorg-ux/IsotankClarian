-- CreateTable
CREATE TABLE "FotoLaudo" (
    "id" TEXT NOT NULL,
    "laudoId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dados" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "tamanho" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FotoLaudo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FotoLaudo_laudoId_idx" ON "FotoLaudo"("laudoId");

-- CreateIndex
CREATE INDEX "FotoLaudo_campo_idx" ON "FotoLaudo"("campo");

-- AddForeignKey
ALTER TABLE "FotoLaudo" ADD CONSTRAINT "FotoLaudo_laudoId_fkey" FOREIGN KEY ("laudoId") REFERENCES "Laudo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
