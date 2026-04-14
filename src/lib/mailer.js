'use strict';

const nodemailer = require('nodemailer');

function getMailerConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'CEINSPEC <noreply@ceinspec.com.br>';

  if (!host || !user || !pass) return null;

  return {
    from,
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    }),
  };
}

async function sendMail({ to, subject, html }) {
  const cfg = getMailerConfig();
  if (!cfg) {
    console.warn('[mailer] SMTP não configurado. E-mail não enviado.');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  try {
    const info = await cfg.transporter.sendMail({
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
