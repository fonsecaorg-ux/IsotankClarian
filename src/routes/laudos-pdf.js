'use strict';

/**
 * laudos-pdf.js
 * ───────────────────────────────────────────────────────────────────────────
 * Rota alternativa de geração de laudo em PDF via HTML/Puppeteer.
 *
 * Endpoint:
 *   POST /laudos/:id/pdf
 *     Body (opcional): { download: true }
 *     - Se download=true: Content-Disposition attachment (força download)
 *     - Senão: Content-Disposition inline (renderiza no navegador)
 *
 * Esta rota é COMPLEMENTAR ao fluxo .docx existente em POST /generate.
 * Não modifica nada do pipeline atual.
 */

const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const { generatePdf } = require('../services/pdfGenerator');
const prisma = require('../lib/prisma');

const router = express.Router();

/**
 * POST /laudos/:id/pdf
 * Gera o PDF do laudo e retorna como download ou inline.
 */
router.post('/:id/pdf', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const forceDownload = req.body?.download !== false; // default: true

  try {
    // Validação básica do laudo
    const laudo = await prisma.laudo.findUnique({
      where: { id: String(id) },
      select: { id: true, numeroIdentificacao: true, status: true },
    });
    if (!laudo) {
      return res.status(404).json({ error: 'Laudo não encontrado' });
    }

    // Base URL para o QR code: derivado do request (respeita reverse proxy)
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = `${proto}://${host}`;

    // Geração
    const pdfBuffer = await generatePdf(id, { baseUrl });

    // Nome do arquivo
    const safeId = (laudo.numeroIdentificacao || `LAUDO_${laudo.id}`)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `LAUDO_${safeId}.pdf`;

    // Headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `${forceDownload ? 'attachment' : 'inline'}; filename="${filename}"`
    );
    res.setHeader('Cache-Control', 'no-store');

    return res.send(pdfBuffer);
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
 * Variante GET para abrir no navegador (útil pra debug).
 * Mesma lógica, mas sem necessidade de body.
 */
router.get('/:id/pdf/preview', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const laudo = await prisma.laudo.findUnique({
      where: { id: String(id) },
      select: { id: true, numeroIdentificacao: true },
    });
    if (!laudo) {
      return res.status(404).json({ error: 'Laudo não encontrado' });
    }

    const proto = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = `${proto}://${host}`;

    const pdfBuffer = await generatePdf(id, { baseUrl });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(pdfBuffer);
  } catch (err) {
    console.error(`[PDF Preview] Falha ao gerar laudo ${id}:`, err);
    return res.status(500).json({
      error: 'Erro ao gerar PDF do laudo',
      details: err.message,
    });
  }
});

module.exports = router;
