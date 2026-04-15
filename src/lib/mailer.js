'use strict';

const nodemailer = require('nodemailer');
const { getConfig } = require('./config');

async function getMailerConfig() {
  const host = String(await getConfig('smtp_host') || '').trim();
  const port = Number(await getConfig('smtp_port') || 587);
  const user = String(await getConfig('smtp_user') || '').trim();
  const pass = String(await getConfig('smtp_pass') || '');
  const from = String(await getConfig('smtp_from') || 'CEINSPEC <noreply@ceinspec.com.br>');

  if (!host || !user || !pass) return null;

  return {
    from,
    transporterConfig: {
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    },
  };
}

async function sendMail({ to, subject, html }) {
  const cfg = await getMailerConfig();
  if (!cfg) {
    console.warn('[mailer] SMTP não configurado. E-mail não enviado.');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  try {
    // Recria transporter a cada envio para refletir configurações atuais no banco.
    const transporter = nodemailer.createTransport(cfg.transporterConfig);
    const info = await transporter.sendMail({
      from: cfg.from,
      to,
      subject,
      html,
    });

    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[mailer] Erro ao enviar e-mail:', err.message);
    return { sent: false, reason: 'send_failed', error: err.message };
  }
}

module.exports = { sendMail };
