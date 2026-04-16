-- Rename LaudoStatus enum values (PostgreSQL: new type + cast, then swap name)

CREATE TYPE "LaudoStatus_new" AS ENUM ('EM_INSPECAO', 'AGUARDANDO_APROVACAO', 'CONCLUIDO');

ALTER TABLE "Laudo" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Laudo" ALTER COLUMN "status" TYPE "LaudoStatus_new" USING (
  CASE "status"::text
    WHEN 'PENDENTE' THEN 'EM_INSPECAO'::"LaudoStatus_new"
    WHEN 'GERADO' THEN 'AGUARDANDO_APROVACAO'::"LaudoStatus_new"
    WHEN 'ASSINADO' THEN 'CONCLUIDO'::"LaudoStatus_new"
    ELSE 'EM_INSPECAO'::"LaudoStatus_new"
  END
);

ALTER TABLE "AuditLog" ALTER COLUMN "fromStatus" TYPE "LaudoStatus_new" USING (
  CASE
    WHEN "fromStatus" IS NULL THEN NULL
    WHEN "fromStatus"::text = 'PENDENTE' THEN 'EM_INSPECAO'::"LaudoStatus_new"
    WHEN "fromStatus"::text = 'GERADO' THEN 'AGUARDANDO_APROVACAO'::"LaudoStatus_new"
    WHEN "fromStatus"::text = 'ASSINADO' THEN 'CONCLUIDO'::"LaudoStatus_new"
    ELSE NULL
  END
);

ALTER TABLE "AuditLog" ALTER COLUMN "toStatus" TYPE "LaudoStatus_new" USING (
  CASE
    WHEN "toStatus" IS NULL THEN NULL
    WHEN "toStatus"::text = 'PENDENTE' THEN 'EM_INSPECAO'::"LaudoStatus_new"
    WHEN "toStatus"::text = 'GERADO' THEN 'AGUARDANDO_APROVACAO'::"LaudoStatus_new"
    WHEN "toStatus"::text = 'ASSINADO' THEN 'CONCLUIDO'::"LaudoStatus_new"
    ELSE NULL
  END
);

DROP TYPE "LaudoStatus";

ALTER TYPE "LaudoStatus_new" RENAME TO "LaudoStatus";

ALTER TABLE "Laudo" ALTER COLUMN "status" SET DEFAULT 'EM_INSPECAO'::"LaudoStatus";
