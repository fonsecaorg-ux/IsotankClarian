'use strict';

/**
 * laudos-validar.js
 * ───────────────────────────────────────────────────────────────────────────
 * Endpoint PÚBLICO (sem autenticação) para validação de laudo via QR code.
 * A URL é gerada no PDF pelo pdfGenerator e aponta para esta rota.
 *
 * Estratégia minimalista: retorna uma página HTML simples mostrando que o
 * laudo existe, quando foi emitido, para qual cliente, e o status.
 * Não expõe o formData completo nem fotos — apenas o suficiente para
 * confirmar autenticidade.
 *
 * Segurança:
 *   - Não exige login (QR deve ser escaneável por qualquer cliente)
 *   - Expõe apenas campos não-sensíveis
 *   - Se o laudo não existe ou está EM_INSPECAO → página de "não emitido"
 */

const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

const STATUS_LABEL = {
  EM_INSPECAO: 'Em inspeção',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  CONCLUIDO: 'Concluído',
};

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDatePt(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function renderPage({ title, body, status = 200 }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)} | CEINSPEC</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    background: #f3f5f8; color: #222;
    min-height: 100vh;
    padding: 20px;
  }
  .card {
    max-width: 460px; margin: 40px auto;
    background: #fff; border-radius: 12px;
    box-shadow: 0 2px 20px rgba(30,58,109,0.12);
    overflow: hidden;
  }
  .card-header {
    background: #1E3A6D; color: #fff;
    padding: 28px 24px; text-align: center;
  }
  .card-header h1 { font-size: 22px; font-weight: 600; letter-spacing: 0.5px; }
  .card-header .subtitle { font-size: 13px; opacity: 0.9; margin-top: 4px; }
  .card-body { padding: 28px 24px; }
  .field { margin-bottom: 16px; }
  .field-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px; }
  .field-value { font-size: 16px; color: #1c1c1c; font-weight: 500; word-break: break-word; }
  .status-badge {
    display: inline-block; padding: 5px 12px; border-radius: 20px;
    font-size: 13px; font-weight: 600;
  }
  .status-CONCLUIDO { background: #d4edda; color: #155724; }
  .status-AGUARDANDO_APROVACAO { background: #fff3cd; color: #856404; }
  .status-EM_INSPECAO { background: #d1ecf1; color: #0c5460; }
  .footer {
    text-align: center; padding: 20px; font-size: 12px; color: #999;
  }
  .error-icon { font-size: 48px; margin-bottom: 12px; }
  .success-mark {
    display: inline-block; width: 48px; height: 48px;
    border-radius: 50%; background: #28a745; color: #fff;
    line-height: 48px; font-size: 28px; margin-bottom: 12px;
  }
</style>
</head>
<body>
  <div class="card">
    ${body}
  </div>
  <div class="footer">
    CEINSPEC Inspeções Veiculares e Industriais Ltda<br>
    CNPJ 48.758.755/0004-29 · OIA/PP 1064 (INMETRO)
  </div>
</body>
</html>`;
}

/**
 * GET /laudos/:id/validar
 * Página pública de validação do laudo via QR code.
 */
router.get('/:id/validar', async (req, res) => {
  const { id } = req.params;

  try {
    const laudo = await prisma.laudo.findUnique({
      where: { id: String(id) },
      select: {
        id: true,
        numeroIdentificacao: true,
        cliente: true,
        dataInspecao: true,
        status: true,
        generatedAt: true,
        createdBy: { select: { nome: true } },
      },
    });

    if (!laudo) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(renderPage({
        title: 'Laudo não encontrado',
        body: `
          <div class="card-header" style="background: #c62828;">
            <div class="error-icon">⚠</div>
            <h1>Laudo não encontrado</h1>
            <div class="subtitle">ID ${escHtml(id)} inválido ou inexistente</div>
          </div>
          <div class="card-body">
            <p style="text-align: center; color: #555;">
              Não foi possível localizar um laudo com este identificador.
              Verifique o QR code ou entre em contato com a CEINSPEC.
            </p>
          </div>
        `,
      }));
    }

    // Laudo em inspeção não é válido ainda
    if (laudo.status === 'EM_INSPECAO') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(renderPage({
        title: 'Laudo em emissão',
        body: `
          <div class="card-header" style="background: #ff9800;">
            <div class="error-icon">⏳</div>
            <h1>Laudo em emissão</h1>
            <div class="subtitle">Ainda não foi finalizado</div>
          </div>
          <div class="card-body">
            <div class="field">
              <div class="field-label">Identificação</div>
              <div class="field-value">${escHtml(laudo.numeroIdentificacao || '—')}</div>
            </div>
            <p style="text-align: center; color: #555; margin-top: 12px;">
              Este laudo ainda está em processo de inspeção e não possui valor oficial.
            </p>
          </div>
        `,
      }));
    }

    // Válido: mostrar os dados
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderPage({
      title: 'Laudo válido',
      body: `
        <div class="card-header">
          <div class="success-mark">✓</div>
          <h1>Laudo válido</h1>
          <div class="subtitle">Emitido por CEINSPEC</div>
        </div>
        <div class="card-body">
          <div class="field">
            <div class="field-label">Identificação do Equipamento</div>
            <div class="field-value">${escHtml(laudo.numeroIdentificacao || '—')}</div>
          </div>
          <div class="field">
            <div class="field-label">Cliente</div>
            <div class="field-value">${escHtml(laudo.cliente || '—')}</div>
          </div>
          <div class="field">
            <div class="field-label">Data da Inspeção</div>
            <div class="field-value">${escHtml(formatDatePt(laudo.dataInspecao))}</div>
          </div>
          <div class="field">
            <div class="field-label">Inspetor Responsável</div>
            <div class="field-value">${escHtml(laudo.createdBy?.nome || '—')}</div>
          </div>
          <div class="field">
            <div class="field-label">Status</div>
            <div class="field-value">
              <span class="status-badge status-${escHtml(laudo.status)}">
                ${escHtml(STATUS_LABEL[laudo.status] || laudo.status)}
              </span>
            </div>
          </div>
          <div class="field" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #999; font-family: monospace; text-align: center;">
            ID: ${escHtml(laudo.id)}
          </div>
        </div>
      `,
    }));
  } catch (err) {
    console.error('[VALIDAR]', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(renderPage({
      title: 'Erro',
      body: `
        <div class="card-header" style="background: #c62828;">
          <div class="error-icon">⚠</div>
          <h1>Erro ao validar</h1>
        </div>
        <div class="card-body">
          <p style="text-align: center; color: #555;">
            Ocorreu um erro ao buscar o laudo. Tente novamente em alguns instantes.
          </p>
        </div>
      `,
    }));
  }
});

module.exports = router;
