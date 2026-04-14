'use strict';

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function upsertUser({ nome, email, senha, role }) {
  const passwordHash = await bcrypt.hash(senha, 10);

  return prisma.user.upsert({
    where: { email },
    update: {
      nome,
      passwordHash,
      role,
      ativo: true,
    },
    create: {
      nome,
      email,
      passwordHash,
      role,
      ativo: true,
    },
  });
}

async function main() {
  await upsertUser({
    nome: 'Administrador CEINSPEC',
    email: 'admin@ceinspec.local',
    senha: 'Admin@123',
    role: 'ADMIN',
  });

  await upsertUser({
    nome: 'Inspetor Padrão',
    email: 'inspetor@ceinspec.local',
    senha: 'Inspetor@123',
    role: 'INSPETOR',
  });

  console.log('Seed concluido com 1 admin e 1 inspetor.');
}

main()
  .catch((err) => {
    console.error('Erro no seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
