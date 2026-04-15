'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');
const { setConfig, invalidateConfigCache } = require('../lib/config');
const { sendMail } = require('../lib/mailer');

const router = express.Router();

const ALLOWED_KEYS = new Set([
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_pass',
  'smtp_from',
  'alert_email',
  'alert_hora',
  'vencimento_meses',
]);

router.use(authMiddleware);
router.use(requireRole(['ADMIN']));

router.get('/', async (req, res) => {
  try {
    const rows = await prisma.configuracao.findMany({
      where: { chave: { in: [...ALLOWED_KEYS] } },
      orderBy: { chave: 'asc' },
      select: {
        chave: true,
        valor: true,
        descricao: true,
        updatedAt: true,
      },
    });

    const result = rows.map((r) => ({
      ...r,
      valor: r.chave === 'smtp_pass' ? '***' : r.valor,
    }));

    return res.json(result);
  } catch (err) {
    console.error('Erro ao listar configurações:', err);
    return res.status(500).json({ error: 'Erro ao listar configurações.' });
  }
});

router.patch('/', async (req, res) => {
  try {
    const { chave } = req.body || {};
    let { valor } = req.body || {};
    if (!chave || valor === undefined) {
      return res.status(400).json({ error: 'Informe chave e valor.' });
    }
    if (!ALLOWED_KEYS.has(chave)) {
      return res.status(400).json({ error: 'Chave de configuração inválida.' });
    }

    if (chave === 'smtp_from') {
      valor = String(valor)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    }

    const updated = await setConfig(chave, valor);
    invalidateConfigCache();
    return res.json({ success: true, chave: updated.chave, valor: updated.valor });
  } catch (err) {
    console.error('Erro ao atualizar configuração:', err);
    return res.status(500).json({ error: 'Erro ao atualizar configuração.' });
  }
});

router.post('/testar-email', async (req, res) => {
  try {
    const alertEmailRow = await prisma.configuracao.findUnique({
      where: { chave: 'alert_email' },
      select: { valor: true },
    });

    const alertEmail = String(alertEmailRow?.valor || '').trim();
    if (!alertEmail) {
      return res.status(400).json({ erro: 'alert_email não configurado.' });
    }

    const result = await sendMail({
      to: alertEmail,
      subject: 'Teste de configuração SMTP - CEINSPEC',
      html: `
        <div style="font-family:'Segoe UI',system-ui,sans-serif;padding:16px;background:#f3f2f1;">
          <div style="background:#fff;border:1px solid #edebe9;border-radius:10px;padding:16px;">
            <h2 style="margin:0 0 8px;color:#0078d4;">Teste de E-mail CEINSPEC</h2>
            <p style="margin:0;color:#323130;">Configuração SMTP válida. Envio realizado com sucesso.</p>
          </div>
        </div>
      `,
    });

    if (!result.sent) {
      return res.status(400).json({ erro: result.error || 'Falha ao enviar e-mail de teste.' });
    }

    return res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao testar e-mail:', err);
    return res.status(500).json({ erro: 'Erro ao testar envio de e-mail.' });
  }
});

module.exports = router;
