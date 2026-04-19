'use strict';

/**
 * laudos-pdf.js — v2
 * Rota de geração de laudo em PDF. Atualizada para consumir o novo retorno
 * { buffer, hash } do pdfGenerator.
 */

const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const { generatePdf } = require('../services/pdfGenerator');
const prisma = require('../lib/prisma');

const router = express.Router();

function buildBaseUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

/**
 * POST /laudos/:id/pdf
 * Gera e baixa o PDF. Retorna attachment por padrão.
 */
router.post('/:id/pdf', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const forceDownload = req.body?.download !== false;

  try {
    const laudo = await prisma.laudo.findUnique({
      where: { id: String(id) },
      select: { id: true, numeroIdentificacao: true },
    });
    if (!laudo) return res.status(404).json({ error: 'Laudo não encontrado' });

    const baseUrl = buildBaseUrl(req);
    const { buffer, hash } = await generatePdf(id, { baseUrl });

    const safeId = (laudo.numeroIdentificacao || `LAUDO_${laudo.id}`)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `LAUDO_${safeId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader(
      'Content-Disposition',
      `${forceDownload ? 'attachment' : 'inline'}; filename="${filename}"`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Laudo-Hash', hash); // útil pra debug/integração

    return res.send(buffer);
  } catch (err) {
    console.error(`[PDF] Falha ao gerar laudo ${id}:`, err);
    return res.status(500).json({
      error: 'Erro ao gerar PDF do laudo',
      details: err.message,
    });
  }
});

/**
 * GET /laudos/:id/pdf/preview
 * Variante GET inline — útil pra abrir no navegador sem download.
 */
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
