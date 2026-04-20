'use strict';

/**
 * Cliente Prisma único. Todos os models do `prisma/schema.prisma` (ex.: `Configuracao`)
 * aparecem em `prisma.<nomeDoModelEmCamelCase>` após `npx prisma generate`.
 * O script `npm start` roda `migrate deploy` e `generate` antes do `server.js`.
 *
 * `engineType = "client"` no schema usa o driver `pg` via `@prisma/adapter-pg` (sem DLL
 * query_engine nativo). Necessário no Windows ARM64 e válido no Linux (ex.: Render).
 */
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const globalForPrisma = globalThis;

/**
 * Pool `pg` com SSL em hosts remotos (ex.: Render). O CLI do Prisma liga sem o adapter;
 * sem SSL o `pg` costuma falhar com P1010 / acesso negado mesmo com URL válida.
 */
function createPgPool(connectionString) {
  const conn = String(connectionString).trim();
  const lower = conn.toLowerCase();
  const isLocal =
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('host.docker.internal');
  const hasSslInUrl = /[?&]sslmode=/i.test(conn);
  const forceSsl = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true';
  const forceNoSsl = String(process.env.DATABASE_SSL || '').toLowerCase() === 'false';

  /** @type {import('pg').PoolConfig} */
  const cfg = {
    connectionString: conn,
    max: Number(process.env.PG_POOL_MAX || 15) || 15,
  };
  if (forceNoSsl) {
    // explícito (Postgres local sem TLS)
  } else if (forceSsl || (!isLocal && !hasSslInUrl)) {
    cfg.ssl = { rejectUnauthorized: false };
  }
  return new Pool(cfg);
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url || !String(url).trim()) {
    throw new Error(
      'DATABASE_URL não definida. Defina no .env (ex.: URL do Postgres no Render).'
    );
  }
  const pool = createPgPool(url);
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });
}

const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
