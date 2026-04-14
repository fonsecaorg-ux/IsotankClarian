'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole(['ADMIN']));

function parseOptionalString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const parsed = String(value).trim();
  return parsed || null;
}

router.get('/', async (req, res) => {
  try {
    const clientes = await prisma.cliente.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      include: {
        _count: {
          select: {
            equipamentos: true,
          },
        },
      },
    });

    return res.json(clientes);
  } catch (err) {
    console.error('Erro ao listar clientes:', err);
    return res.status(500).json({ error: 'Erro ao listar clientes' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const nome = parseOptionalString(body.nome);
    const endereco = parseOptionalString(body.endereco);

    if (!nome) {
      return res.status(400).json({ error: 'Campo obrigatório: nome' });
    }

    const existing = await prisma.cliente.findUnique({
      where: { nome },
      select: { id: true },
    });

    if (existing) {
      return res.status(400).json({ error: 'Nome de cliente já cadastrado' });
    }

    const created = await prisma.cliente.create({
      data: {
        nome,
        endereco: endereco || null,
        ativo: true,
      },
    });

    return res.status(201).json(created);
  } catch (err) {
    if (err && err.code === 'P2002') {
      return res.status(400).json({ error: 'Nome de cliente já cadastrado' });
    }
    console.error('Erro ao criar cliente:', err);
    return res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const data = {};

    if (body.nome !== undefined) {
      const nome = parseOptionalString(body.nome);
      if (!nome) {
        return res.status(400).json({ error: 'nome não pode ser vazio' });
      }
      data.nome = nome;
    }

    if (body.endereco !== undefined) {
      data.endereco = parseOptionalString(body.endereco);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualização' });
    }

    const updated = await prisma.cliente.update({
      where: { id: req.params.id },
      data,
    });

    return res.json(updated);
  } catch (err) {
    if (err && err.code === 'P2025') {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    if (err && err.code === 'P2002') {
      return res.status(400).json({ error: 'Nome de cliente já cadastrado' });
    }
    console.error('Erro ao atualizar cliente:', err);
    return res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.cliente.update({
      where: { id: req.params.id },
      data: { ativo: false },
      select: { id: true },
    });

    return res.json({ success: true });
  } catch (err) {
    if (err && err.code === 'P2025') {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    console.error('Erro ao desativar cliente:', err);
    return res.status(500).json({ error: 'Erro ao desativar cliente' });
  }
});

module.exports = router;
