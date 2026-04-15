'use strict';

const prisma = require('../lib/prisma');
const { sendMail } = require('../lib/mailer');
const { getConfig } = require('../lib/config');

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysDiff(from, to) {
  return Math.ceil((startOfDay(to) - startOfDay(from)) / (1000 * 60 * 60 * 24));
}

function buildEmailHtml({ dias, rows }) {
  const linhas = rows.map((r) => `
    <tr>
      <td style="padding:8px;border:1px solid #edebe9;">${r.container || '-'}</td>
      <td style="padding:8px;border:1px solid #edebe9;">${r.cliente || '-'}</td>
      <td style="padding:8px;border:1px solid #edebe9;">${r.inspetor || '-'}</td>
      <td style="padding:8px;border:1px solid #edebe9;">${new Date(r.dataInspecao).toLocaleDateString('pt-BR')}</td>
      <td style="padding:8px;border:1px solid #edebe9;">${new Date(r.vencimento).toLocaleDateString('pt-BR')}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:'Segoe UI',system-ui,sans-serif;color:#323130;background:#f3f2f1;padding:16px;">
      <div style="max-width:920px;margin:0 auto;background:#fff;border:1px solid #edebe9;border-radius:10px;padding:16px;">
        <h2 style="margin:0 0 10px;color:#0078d4;">Alerta de Vencimento CEINSPEC</h2>
        <p style="margin:0 0 12px;color:#605e5c;">
          ${rows.length} equipamento(s) vencem em ${dias} dias.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#faf9f8;">
              <th style="padding:8px;border:1px solid #edebe9;text-align:left;">Container</th>
              <th style="padding:8px;border:1px solid #edebe9;text-align:left;">Cliente</th>
              <th style="padding:8px;border:1px solid #edebe9;text-align:left;">Inspetor</th>
              <th style="padding:8px;border:1px solid #edebe9;text-align:left;">Data Inspeção</th>
              <th style="padding:8px;border:1px solid #edebe9;text-align:left;">Vencimento</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
        <p style="margin:14px 0 0;font-size:12px;color:#605e5c;">
          Acesse o painel: https://isotanklariant.onrender.com/dashboard
        </p>
      </div>
    </div>
  `;
}

async function checkVencimentos() {
  const alertEmail = String(await getConfig('alert_email') || '').trim();
  const vencimentoMeses = Number(await getConfig('vencimento_meses') || 12) || 12;
  if (!alertEmail) {
    console.warn('[alerta-vencimento] ALERT_EMAIL não configurado. Verificação concluída sem envio.');
    return { enviados: 0, detalhes: [{ ok: false, motivo: 'alert_email_not_configured' }] };
  }

  const laudos = await prisma.laudo.findMany({
    where: { dataInspecao: { not: null } },
    select: {
      id: true,
      numeroIdentificacao: true,
      cliente: true,
      dataInspecao: true,
      createdBy: { select: { nome: true } },
    },
  });

  const hoje = new Date();
  const groups = { 30: [], 15: [], 7: [] };
  laudos.forEach((l) => {
    const vencimento = addMonths(l.dataInspecao, vencimentoMeses);
    const diff = daysDiff(hoje, vencimento);
    if (diff === 30 || diff === 15 || diff === 7) {
      groups[diff].push({
        id: l.id,
        container: l.numeroIdentificacao,
        cliente: l.cliente,
        inspetor: l.createdBy?.nome || 'Inspetor',
        dataInspecao: l.dataInspecao,
        vencimento,
      });
    }
  });

  const detalhes = [];
  let enviados = 0;

  for (const dias of [30, 15, 7]) {
    const rows = groups[dias];
    if (!rows.length) {
      detalhes.push({ dias, total: 0, enviado: false });
      continue;
    }

    const subject = `⚠️ Alerta CEINSPEC — ${rows.length} equipamento(s) vencem em ${dias} dias`;
    const html = buildEmailHtml({ dias, rows });
    const result = await sendMail({ to: alertEmail, subject, html });

    detalhes.push({
      dias,
      total: rows.length,
      enviado: result.sent,
      info: result.sent ? result.messageId : result.reason,
    });

    if (result.sent) enviados += 1;
  }

  return { enviados, detalhes };
}

module.exports = { checkVencimentos };
