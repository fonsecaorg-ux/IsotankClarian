'use strict';

const prisma = require('./prisma');

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const FALLBACKS = {
  smtp_host: process.env.SMTP_HOST || '',
  smtp_port: process.env.SMTP_PORT || '587',
  smtp_user: process.env.SMTP_USER || '',
  smtp_pass: process.env.SMTP_PASS || '',
  smtp_from: process.env.SMTP_FROM || 'CEINSPEC <noreply@ceinspec.com.br>',
  alert_email: process.env.ALERT_EMAIL || '',
  alert_hora: process.env.ALERT_HORA || '08:00',
  vencimento_meses: process.env.VENCIMENTO_MESES || '12',
};

function isCacheValid(entry) {
  return entry && entry.expiresAt > Date.now();
}

async function getConfig(chave) {
  const cached = cache.get(chave);
  if (isCacheValid(cached)) return cached.valor;

  const row = await prisma.configuracao.findUnique({
    where: { chave },
    select: { valor: true },
  });

  const valor = row ? row.valor : (FALLBACKS[chave] || '');
  cache.set(chave, { valor, expiresAt: Date.now() + CACHE_TTL_MS });
  return valor;
}

async function setConfig(chave, valor) {
  const stringValue = String(valor ?? '');
  const row = await prisma.configuracao.upsert({
    where: { chave },
    update: { valor: stringValue },
    create: { chave, valor: stringValue },
    select: { chave: true, valor: true },
  });
  invalidateConfigCache(chave);
  return row;
}

function invalidateConfigCache(chave) {
  if (chave) cache.delete(chave);
  else cache.clear();
}

module.exports = {
  getConfig,
  setConfig,
  invalidateConfigCache,
  CACHE_TTL_MS,
};
