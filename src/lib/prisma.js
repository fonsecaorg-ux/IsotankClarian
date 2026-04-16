'use strict';

/**
 * Cliente Prisma único. Todos os models do `prisma/schema.prisma` (ex.: `Configuracao`)
 * aparecem em `prisma.<nomeDoModelEmCamelCase>` após `npx prisma generate`.
 * O script `npm start` roda `migrate deploy` e `generate` antes do `server.js`.
 */
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
