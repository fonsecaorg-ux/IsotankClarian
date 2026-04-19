'use strict';

/**
 * laudos-validar.js — v2
 * Página pública de validação do laudo via QR code.
 * Mostra o hash SHA-256 armazenado + instruções pro visitante verificar
 * localmente no PDF que tem em mãos.
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDatePt(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function renderPage({ title, body }) {
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
    min-height: 100vh; padding: 20px;
  }
  .card {
    max-width: 520px; margin: 40px auto; background: #fff;
    border-radius: 12px; box-shadow: 0 2px 20px rgba(30,58,109,0.12);
    overflow: hidden;
  }
  .card-header { padding: 28px 24px; text-align: center; color: #fff; }
  .card-header.ok { background: #0F6E56; }
  .card-header.warn { background: #ff9800; }
  .card-header.danger { background: #c62828; }
  .card-header h1 { font-size: 22px; font-weight: 600; }
  .card-header .subtitle { font-size: 13px; opacity: 0.92; margin-top: 4px; }
  .success-mark {
    display: inline-block; width: 48px; height: 48px; border-radius: 50%;
    background: #fff; color: #0F6E56; line-height: 48px; font-size: 28px;
    margin-bottom: 12px; font-weight: bold;
  }
  .error-icon { font-size: 40px; margin-bottom: 8px; }
  .card-body { padding: 24px; }
  .field { margin-bottom: 14px; }
  .field-label {
    font-size: 10px; color: #888; text-transform: uppercase;
    letter-spacing: 1.5px; margin-bottom: 3px; font-weight: 500;
  }
  .field-value {
    font-size: 15px; color: #1c1c1c; font-weight: 500; word-break: break-word;
  }
  .field-value.mono { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; }
  .status-badge {
    display: inline-block; padding: 4px 11px; border-radius: 18px;
    font-size: 12px; font-weight: 600;
  }
  .status-CONCLUIDO { background: #E1F5EE; color: #0F6E56; }
  .status-AGUARDANDO_APROVACAO { background: #fff3cd; color: #856404; }
  .status-EM_INSPECAO { background: #d1ecf1; color: #0c5460; }
  .divider {
    border-top: 1px solid #eee; margin: 20px 0;
  }
  .hash-block {
    background: #f7f7f9; border: 1px solid #e5e5e8; border-radius: 8px;
    padding: 12px 14px; margin-top: 12px;
  }
  .hash-value {
    font-family: ui-monospace, monospace; font-size: 11px;
    color: #444; word-break: break-all; line-height: 1.5;
    background: #fff; padding: 8px 10px; border-radius: 5px;
    border: 1px solid #eee;
  }
  .hash-help {
    font-size: 12px; color: #555; margin-top: 10px; line-height: 1.5;
  }
  .hash-help code {
    background: #fff; padding: 2px 6px; border-radius: 3px;
    border: 1px solid #eee; font-family: ui-monospace, monospace;
    font-size: 11px; color: #0F6E56;
  }
  .footer {
    text-align: center; padding: 20px; font-size: 12px; color: #999;
    line-height: 1.6;
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

router.get('/:id/validar', async (req, res) => {
  const { id } = req.params;

  try {
    const laudo = await prisma.laudo.findUnique({
      where: { id: String(id) },
      select: {
        id: true, numeroIdentificacao: true, cliente: true,
        dataInspecao: true, status: true, generatedAt: true,
        pdfHash: true,
        createdBy: { select: { nome: true } },
      },
    });

    if (!laudo) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(renderPage({
        title: 'Laudo não encontrado',
        body: `
          <div class="card-header danger">
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

    if (laudo.status === 'EM_INSPECAO') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(renderPage({
        title: 'Laudo em emissão',
        body: `
          <div class="card-header warn">
            <div class="error-icon">⏳</div>
            <h1>Laudo em emissão</h1>
            <div class="subtitle">Documento ainda não finalizado</div>
          </div>
          <div class="card-body">
            <div class="field">
              <div class="field-label">Identificação</div>
              <div class="field-value mono">${escHtml(laudo.numeroIdentificacao || '—')}</div>
            </div>
            <p style="text-align: center; color: #555; margin-top: 12px;">
              Este laudo ainda está em processo de inspeção e
              <strong>não possui valor oficial</strong>.
            </p>
          </div>
        `,
      }));
    }

    const hash = laudo.pdfHash;
    const hashBlock = hash
      ? `
        <div class="divider"></div>
        <div class="field-label">HASH DE VERIFICAÇÃO (SHA-256)</div>
        <div class="hash-block">
          <div class="hash-value">${escHtml(hash)}</div>
          <div class="hash-help">
            Para confirmar a autenticidade do PDF em mãos, calcule o SHA-256
            do arquivo recebido e compare com o hash acima.<br><br>
            <strong>Linux / Mac:</strong><br>
            <code>shasum -a 256 LAUDO_${escHtml(laudo.numeroIdentificacao || '').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf</code>
            <br><br>
            <strong>Windows (PowerShell):</strong><br>
            <code>Get-FileHash LAUDO_XXX.pdf -Algorithm SHA256</code>
          </div>
        </div>
      `
      : '';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderPage({
      title: 'Laudo válido',
      body: `
        <div class="card-header ok">
          <div class="success-mark">✓</div>
          <h1>Laudo válido</h1>
          <div class="subtitle">Emitido por CEINSPEC</div>
        </div>
        <div class="card-body">
          <div class="field">
            <div class="field-label">Identificação do Equipamento</div>
            <div class="field-value mono">${escHtml(laudo.numeroIdentificacao || '—')}</div>
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
          ${hashBlock}
          <div style="margin-top: 20px; padding-top: 14px; border-top: 1px solid #eee;
                      font-size: 11px; color: #999; font-family: ui-monospace, monospace;
                      text-align: center;">
            ID ${escHtml(laudo.id)}
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
        <div class="card-header danger">
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
