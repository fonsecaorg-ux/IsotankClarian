'use strict';

/**
 * Cliente Prisma único. Todos os models do `prisma/schema.prisma` (ex.: `Configuracao`)
 * aparecem em `prisma.<nomeDoModelEmCamelCase>` após `npx prisma generate`.
 * O script `npm start` roda `migrate deploy` e `generate` antes do `server.js`.
 *
 * `engineType = "client"` no schema usa o driver `pg` via `@prisma/adapter-pg` (sem DLL
 * query_engine nativo). Necessário no Windows ARM64 e válido no Linux (ex.: Render).
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const globalForPrisma = globalThis;

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url || !String(url).trim()) {
    throw new Error(
      'DATABASE_URL não definida. Defina no .env (ex.: URL do Postgres no Render).'
    );
  }
  const adapter = new PrismaPg({ connectionString: String(url).trim() });
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
