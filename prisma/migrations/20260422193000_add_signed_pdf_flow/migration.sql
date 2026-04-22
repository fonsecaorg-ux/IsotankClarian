-- Add enum values for manual gov.br flow
ALTER TYPE "LaudoStatus" ADD VALUE IF NOT EXISTS 'PENDENTE_ASSINATURA';
ALTER TYPE "LaudoStatus" ADD VALUE IF NOT EXISTS 'ASSINADO_DIGITALMENTE';

-- Add signed PDF metadata/storage fields
ALTER TABLE "Laudo"
ADD COLUMN IF NOT EXISTS "signedFileName" TEXT,
ADD COLUMN IF NOT EXISTS "signedMimeType" TEXT,
ADD COLUMN IF NOT EXISTS "signedSize" INTEGER,
ADD COLUMN IF NOT EXISTS "signedHash" TEXT,
ADD COLUMN IF NOT EXISTS "signedPath" TEXT,
ADD COLUMN IF NOT EXISTS "signedData" BYTEA,
ADD COLUMN IF NOT EXISTS "signedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "signedById" TEXT;

-- FK to user who attached signed PDF
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Laudo_signedById_fkey'
  ) THEN
    ALTER TABLE "Laudo"
    ADD CONSTRAINT "Laudo_signedById_fkey"
    FOREIGN KEY ("signedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Laudo_signedById_idx" ON "Laudo"("signedById");
