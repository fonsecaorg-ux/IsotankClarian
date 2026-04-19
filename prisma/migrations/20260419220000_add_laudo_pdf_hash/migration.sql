-- Adiciona campo pdfHash ao Laudo — SHA-256 do último PDF gerado.
-- Usado pela página pública /laudos/:id/validar para verificação
-- de autenticidade do arquivo recebido pelo cliente.

ALTER TABLE "Laudo" ADD COLUMN "pdfHash" TEXT;
