'use strict';

/**
 * laudos-pdf.js — v3
 * Rota de geração de laudo em PDF.
 *
 * Aceita multipart/form-data com as 10 fotos OPCIONALMENTE. Se vierem,
 * são persistidas em FotoLaudo antes da geração (substitui o papel que
 * o antigo POST /generate cumpria no fluxo .docx).
 *
 * Fluxo esperado do frontend:
 *   1. POST /laudos                → cria laudo, recebe { id }
 *   2. POST /laudos/:id/pdf        → multipart com as 10 fotos → baixa PDF
 *
 * Se o cliente chamar sem multipart (só JSON), as fotos são lidas do DB
 * (útil para regenerar um PDF de laudo existente).
 */

const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middlewares/authMiddleware');
const { generatePdf } = require('../services/pdfGenerator');
const prisma = require('../lib/prisma');

const router = express.Router();

// ─── Configuração de fotos (mesmo padrão do server.js) ────────────────────
const PHOTO_FIELDS = [
  'foto_frontal', 'foto_traseira', 'foto_lateral1', 'foto_lateral2',
  'foto_superior', 'foto_termometro', 'foto_tampa_boca_visita',
  'foto_valvula_alivio', 'foto_valvula_descarga', 'foto_placa_identificacao',
];

const PHOTO_LABEL_MAP = {
  foto_frontal: 'Frontal',
  foto_traseira: 'Traseira',
  foto_lateral1: 'Lateral 1',
  foto_lateral2: 'Lateral 2',
  foto_superior: 'Superior',
  foto_termometro: 'Termômetro',
  foto_tampa_boca_visita: 'Tampa Boca de Visita',
  foto_valvula_alivio: 'Válvula de Alívio',
  foto_valvula_descarga: 'Válvula de Descarga',
  foto_placa_identificacao: 'Placa de Identificação',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────
function buildBaseUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

/**
 * Persiste fotos recebidas via multipart em FotoLaudo.
 * Substitui registros existentes para os mesmos campos.
 */
async function persistPhotos(laudoId, files) {
  if (!files || Object.keys(files).length === 0) return 0;

  const records = [];
  for (const field of PHOTO_FIELDS) {
    if (files[field] && files[field][0]) {
      const file = files[field][0];
      if (!file.buffer || file.buffer.length === 0) continue;
      records.push({
        laudoId,
        campo: field,
        label: PHOTO_LABEL_MAP[field] || field,
        dados: file.buffer,
        mimeType: file.mimetype || 'image/jpeg',
        tamanho: Number(file.size || file.buffer.length),
      });
    }
  }

  if (records.length === 0) return 0;

  // Limpa registros anteriores dos MESMOS campos para esse laudo.
  await prisma.fotoLaudo.deleteMany({
    where: {
      laudoId,
      campo: { in: records.map((r) => r.campo) },
    },
  });

  await prisma.fotoLaudo.createMany({ data: records });
  return records.length;
}

// ─── POST /laudos/:id/pdf ─────────────────────────────────────────────────
router.post(
  '/:id/pdf',
  authMiddleware,
  upload.fields(PHOTO_FIELDS.map((f) => ({ name: f, maxCount: 1 }))),
  async (req, res) => {
    const { id } = req.params;
    const requestId = Math.random().toString(36).slice(2, 7);
    console.log(`[PDF-${requestId}] POST /laudos/${id}/pdf recebido`);

    try {
      const laudo = await prisma.laudo.findUnique({
        where: { id: String(id) },
        select: { id: true, numeroIdentificacao: true },
      });
      if (!laudo) {
        return res.status(404).json({ error: 'Laudo não encontrado' });
      }

      // 1) Persistir fotos se vieram no multipart
      const files = req.files || {};
      const fileCount = Object.keys(files).length;
      if (fileCount > 0) {
        const saved = await persistPhotos(laudo.id, files);
        console.log(`[PDF-${requestId}] ${saved} foto(s) persistida(s) no DB`);
      } else {
        console.log(`[PDF-${requestId}] Sem fotos no multipart — usando as do DB`);
      }

      // 2) Gerar PDF (lê fotos do DB + calcula hash + persiste pdfHash)
      const baseUrl = buildBaseUrl(req);
      const { buffer, hash } = await generatePdf(id, { baseUrl });

      // 3) Atualizar status: laudo deixa de estar EM_INSPECAO ao gerar pela 1ª vez
      try {
        await prisma.laudo.update({
          where: { id: laudo.id },
          data: {
            status: 'AGUARDANDO_APROVACAO',
            generatedAt: new Date(),
            generatedFileName: `LAUDO_${(laudo.numeroIdentificacao || laudo.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
          },
        });
      } catch (errStatus) {
        // Não crítico: se já estava CONCLUIDO ou outro status, não rebaixa.
        console.warn(`[PDF-${requestId}] Falha ao atualizar status (não crítico):`, errStatus.message);
      }

      // 4) Resposta: PDF como download
      const safeId = (laudo.numeroIdentificacao || `LAUDO_${laudo.id}`)
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `LAUDO_${safeId}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Laudo-Hash', hash);

      console.log(`[PDF-${requestId}] ✅ PDF enviado (${buffer.length} bytes, hash ${hash.slice(0, 12)}…)`);
      return res.send(buffer);
    } catch (err) {
      console.error(`[PDF-${requestId}] Falha:`, err);
      return res.status(500).json({
        error: 'Erro ao gerar PDF do laudo',
        details: err.message,
      });
    }
  }
);

// ─── GET /laudos/:id/pdf/preview ──────────────────────────────────────────
// Variante GET que não aceita upload. Útil pra abrir inline no navegador
// (laudo já gerado antes, apenas re-renderiza a partir do DB).
router.get('/:id/pdf/preview', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const laudo = await prisma.laudo.findUnique({
      where: { id: String(id) },
      select: { id: true, numeroIdentificacao: true },
    });
    if (!laudo) return res.status(404).json({ error: 'Laudo não encontrado' });

    const baseUrl = buildBaseUrl(req);
    const { buffer, hash } = await generatePdf(id, { baseUrl });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Laudo-Hash', hash);
    return res.send(buffer);
  } catch (err) {
    console.error(`[PDF Preview] Falha ao gerar laudo ${id}:`, err);
    return res.status(500).json({
      error: 'Erro ao gerar PDF do laudo',
      details: err.message,
    });
  }
});

module.exports = router;
