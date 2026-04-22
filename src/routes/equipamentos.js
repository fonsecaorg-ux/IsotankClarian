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

function buildUpdatableFields(body) {
  const updatable = {};

  if (body.numeroIdentificacao !== undefined) updatable.numeroIdentificacao = parseOptionalString(body.numeroIdentificacao);
  if (body.fabricante !== undefined) updatable.fabricante = parseOptionalString(body.fabricante);
  if (body.clienteId !== undefined) updatable.clienteId = parseOptionalString(body.clienteId);
  if (body.numeroSerie !== undefined) updatable.numeroSerie = parseOptionalString(body.numeroSerie);
  if (body.paisFabricacao !== undefined) updatable.paisFabricacao = parseOptionalString(body.paisFabricacao);
  if (body.tamanho !== undefined) updatable.tamanho = parseOptionalString(body.tamanho);
  if (body.capacidadeLiquida !== undefined) updatable.capacidadeLiquida = parseOptionalString(body.capacidadeLiquida);
  if (body.anoFabricacao !== undefined) updatable.anoFabricacao = parseOptionalString(body.anoFabricacao);
  if (body.normaFabricacao !== undefined) updatable.normaFabricacao = parseOptionalString(body.normaFabricacao);
  if (body.materialCalota !== undefined) updatable.materialCalota = parseOptionalString(body.materialCalota);
  if (body.materialCostado !== undefined) updatable.materialCostado = parseOptionalString(body.materialCostado);
  if (body.espessura !== undefined) updatable.espessura = parseOptionalString(body.espessura);

  return updatable;
}

router.get('/', async (req, res) => {
  try {
    const equipamentos = await prisma.equipamento.findMany({
      where: { ativo: true },
      orderBy: { ultimaInspecao: 'desc' },
      select: {
        id: true,
        numeroIdentificacao: true,
        fabricante: true,
        totalInspecoes: true,
        ultimaInspecao: true,
        proximoVencimento: true,
        cliente: {
          select: {
            id: true,
            nome: true,
            endereco: true,
          },
        },
      },
    });

    return res.json(equipamentos);
  } catch (err) {
    console.error('Erro ao listar equipamentos:', err);
    return res.status(500).json({ error: 'Erro ao listar equipamentos' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const equipamento = await prisma.equipamento.findFirst({
      where: { id: req.params.id, ativo: true },
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
            endereco: true,
            ativo: true,
          },
        },
        laudos: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            dataInspecao: true,
            createdAt: true,
            signedAt: true,
            signedFileName: true,
            inspectorSignedAt: true,
            inspectorSignedFileName: true,
            createdBy: {
              select: {
                id: true,
                nome: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!equipamento) {
      return res.status(404).json({ error: 'Equipamento não encontrado' });
    }

    return res.json(equipamento);
  } catch (err) {
    console.error('Erro ao buscar equipamento:', err);
    return res.status(500).json({ error: 'Erro ao buscar equipamento' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const numeroIdentificacao = parseOptionalString(body.numeroIdentificacao);
    const fabricante = parseOptionalString(body.fabricante);

    if (!numeroIdentificacao) {
      return res.status(400).json({ error: 'Campo obrigatório: numeroIdentificacao' });
    }
    if (!fabricante) {
      return res.status(400).json({ error: 'Campo obrigatório: fabricante' });
    }

    const existing = await prisma.equipamento.findUnique({
      where: { numeroIdentificacao },
      select: { id: true },
    });

    if (existing) {
      return res.status(400).json({ error: 'numeroIdentificacao já cadastrado' });
    }

    const data = {
      ...buildUpdatableFields(body),
      numeroIdentificacao,
      fabricante,
      ativo: true,
    };

    const created = await prisma.equipamento.create({
      data,
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
            endereco: true,
          },
        },
      },
    });

    return res.status(201).json(created);
  } catch (err) {
    if (err && err.code === 'P2003') {
      return res.status(400).json({ error: 'clienteId inválido' });
    }
    console.error('Erro ao criar equipamento:', err);
    return res.status(500).json({ error: 'Erro ao criar equipamento' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const data = buildUpdatableFields(body);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualização' });
    }

    if (data.numeroIdentificacao !== undefined && !data.numeroIdentificacao) {
      return res.status(400).json({ error: 'numeroIdentificacao não pode ser vazio' });
    }
    if (data.fabricante !== undefined && !data.fabricante) {
      return res.status(400).json({ error: 'fabricante não pode ser vazio' });
    }

    const updated = await prisma.equipamento.update({
      where: { id: req.params.id },
      data,
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
            endereco: true,
          },
        },
      },
    });

    return res.json(updated);
  } catch (err) {
    if (err && err.code === 'P2025') {
      return res.status(404).json({ error: 'Equipamento não encontrado' });
    }
    if (err && err.code === 'P2002') {
      return res.status(400).json({ error: 'numeroIdentificacao já cadastrado' });
    }
    if (err && err.code === 'P2003') {
      return res.status(400).json({ error: 'clienteId inválido' });
    }
    console.error('Erro ao atualizar equipamento:', err);
    return res.status(500).json({ error: 'Erro ao atualizar equipamento' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.equipamento.update({
      where: { id: req.params.id },
      data: { ativo: false },
      select: { id: true },
    });

    return res.json({ success: true });
  } catch (err) {
    if (err && err.code === 'P2025') {
      return res.status(404).json({ error: 'Equipamento não encontrado' });
    }
    console.error('Erro ao desativar equipamento:', err);
    return res.status(500).json({ error: 'Erro ao desativar equipamento' });
  }
});

module.exports = router;
