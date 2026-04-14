'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');

const router = express.Router();
const ALLOWED_ROLES = ['ADMIN', 'INSPETOR'];

router.use(authMiddleware);
router.use(requireRole(['ADMIN']));

router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        createdAt: true,
      },
    });

    return res.json(users);
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    return res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const {
      name,
      nome,
      email,
      password,
      role,
    } = req.body || {};

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const displayName = String(name || nome || '').trim();

    if (!displayName || !normalizedEmail || !password || !role) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, email, password, role' });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role inválida' });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    const created = await prisma.user.create({
      data: {
        nome: displayName,
        email: normalizedEmail,
        passwordHash,
        role,
        ativo: true,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        createdAt: true,
      },
    });

    return res.status(201).json(created);
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    return res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, nome, role, active, ativo } = req.body || {};

    const updateData = {};

    const nextName = typeof name === 'string' ? name.trim() : (typeof nome === 'string' ? nome.trim() : '');
    if (nextName) updateData.nome = nextName;

    if (role !== undefined) {
      if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Role inválida' });
      }
      updateData.role = role;
    }

    if (typeof active === 'boolean') updateData.ativo = active;
    if (typeof ativo === 'boolean') updateData.ativo = ativo;

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        createdAt: true,
      },
    });

    return res.json(updated);
  } catch (err) {
    if (err && err.code === 'P2025') {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    console.error('Erro ao atualizar usuário:', err);
    return res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { ativo: false },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
      },
    });

    return res.json(updated);
  } catch (err) {
    if (err && err.code === 'P2025') {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    console.error('Erro ao desativar usuário:', err);
    return res.status(500).json({ error: 'Erro ao desativar usuário' });
  }
});

module.exports = router;
