-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipamento" (
    "id" TEXT NOT NULL,
    "numeroIdentificacao" TEXT NOT NULL,
    "fabricante" TEXT NOT NULL,
    "numeroSerie" TEXT,
    "paisFabricacao" TEXT,
    "tamanho" TEXT,
    "capacidadeLiquida" TEXT,
    "anoFabricacao" TEXT,
    "normaFabricacao" TEXT,
    "materialCalota" TEXT,
    "materialCostado" TEXT,
    "espessura" TEXT,
    "totalInspecoes" INTEGER NOT NULL DEFAULT 0,
    "ultimaInspecao" TIMESTAMP(3),
    "proximoVencimento" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "clienteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipamento_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Laudo" ADD COLUMN "equipamentoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_nome_key" ON "Cliente"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Equipamento_numeroIdentificacao_key" ON "Equipamento"("numeroIdentificacao");

-- CreateIndex
CREATE INDEX "Equipamento_clienteId_idx" ON "Equipamento"("clienteId");

-- CreateIndex
CREATE INDEX "Equipamento_ativo_idx" ON "Equipamento"("ativo");

-- CreateIndex
CREATE INDEX "Laudo_equipamentoId_idx" ON "Laudo"("equipamentoId");

-- AddForeignKey
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Laudo" ADD CONSTRAINT "Laudo_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
