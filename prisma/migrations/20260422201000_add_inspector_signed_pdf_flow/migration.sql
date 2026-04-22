-- Add inspector signed PDF metadata/storage fields
ALTER TABLE "Laudo"
ADD COLUMN IF NOT EXISTS "inspectorSignedFileName" TEXT,
ADD COLUMN IF NOT EXISTS "inspectorSignedMimeType" TEXT,
ADD COLUMN IF NOT EXISTS "inspectorSignedSize" INTEGER,
ADD COLUMN IF NOT EXISTS "inspectorSignedHash" TEXT,
ADD COLUMN IF NOT EXISTS "inspectorSignedPath" TEXT,
ADD COLUMN IF NOT EXISTS "inspectorSignedData" BYTEA,
ADD COLUMN IF NOT EXISTS "inspectorSignedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "inspectorSignedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Laudo_inspectorSignedById_fkey'
  ) THEN
    ALTER TABLE "Laudo"
    ADD CONSTRAINT "Laudo_inspectorSignedById_fkey"
    FOREIGN KEY ("inspectorSignedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Laudo_inspectorSignedById_idx" ON "Laudo"("inspectorSignedById");
