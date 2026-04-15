'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const prisma = require('../lib/prisma');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');

const router = express.Router();

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_CATEGORIAS = new Set(['IT', 'FORM_ADM', 'FORM_TEC', 'OUTRO']);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg']);

const STORAGE_MODE = String(process.env.STORAGE_MODE || 'database').trim().toLowerCase() === 'disk'
  ? 'disk'
  : 'database';
const STORAGE_PATH_RAW = String(process.env.STORAGE_PATH || './storage/fotos').trim() || './storage/fotos';
const STORAGE_ROOT = path.isAbsolute(STORAGE_PATH_RAW)
  ? STORAGE_PATH_RAW
  : path.join(process.cwd(), STORAGE_PATH_RAW);
const DOCUMENTS_ROOT = path.join(STORAGE_ROOT, 'documentos');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

function normalizeCategoria(value) {
  const categoria = String(value || '').trim().toUpperCase();
  return ALLOWED_CATEGORIAS.has(categoria) ? categoria : null;
}

function hasAllowedExtension(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

function safeName(fileName) {
  return String(fileName || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const categoria = req.query.categoria ? normalizeCategoria(req.query.categoria) : null;
    if (req.query.categoria && !categoria) {
      return res.status(400).json({ error: 'Categoria inválida' });
    }

    const where = {
      ativo: true,
      ...(categoria ? { categoria } : {}),
    };

    const docs = await prisma.documento.findMany({
      where,
      orderBy: [
        { categoria: 'asc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        nome: true,
        descricao: true,
        categoria: true,
        nomeArquivo: true,
        tamanho: true,
        createdAt: true,
      },
    });

    return res.json(docs);
  } catch (err) {
    console.error('Erro ao listar documentos:', err);
    return res.status(500).json({ error: 'Erro ao listar documentos' });
  }
});

router.post('/', requireRole(['ADMIN']), (req, res) => {
  upload.single('arquivo')(req, res, async (uploadErr) => {
    if (uploadErr && uploadErr.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo excede 20MB' });
    }
    if (uploadErr) {
      return res.status(400).json({ error: 'Falha ao processar upload' });
    }

  try {
    const { nome, descricao } = req.body || {};
    const categoria = normalizeCategoria(req.body?.categoria);
    const arquivo = req.file;

    if (!String(nome || '').trim()) {
      return res.status(400).json({ error: 'Nome do documento é obrigatório' });
    }
    if (!categoria) {
      return res.status(400).json({ error: 'Categoria inválida' });
    }
    if (!arquivo) {
      return res.status(400).json({ error: 'Arquivo é obrigatório' });
    }
    if (arquivo.size > MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'Arquivo excede 20MB' });
    }
    if (!hasAllowedExtension(arquivo.originalname)) {
      return res.status(400).json({ error: 'Tipo de arquivo não permitido' });
    }

    let caminhoArquivo = null;
    let dados = arquivo.buffer;

    if (STORAGE_MODE === 'disk') {
      fs.mkdirSync(DOCUMENTS_ROOT, { recursive: true });
      const finalName = `${Date.now()}_${safeName(arquivo.originalname)}`;
      caminhoArquivo = path.join(DOCUMENTS_ROOT, finalName);
      fs.writeFileSync(caminhoArquivo, arquivo.buffer);
      dados = null;
    }

    const created = await prisma.documento.create({
      data: {
        nome: String(nome).trim(),
        descricao: String(descricao || '').trim() || null,
        categoria,
        nomeArquivo: arquivo.originalname,
        mimeType: arquivo.mimetype || 'application/octet-stream',
        tamanho: Number(arquivo.size || arquivo.buffer.length || 0),
        caminhoArquivo,
        dados,
        uploadedById: req.user.id,
      },
      select: {
        id: true,
        nome: true,
        descricao: true,
        categoria: true,
        nomeArquivo: true,
        tamanho: true,
        createdAt: true,
      },
    });

    return res.status(201).json(created);
    } catch (err) {
      console.error('Erro ao enviar documento:', err);
      return res.status(500).json({ error: 'Erro ao enviar documento' });
    }
  });
});

router.get('/:id/download', async (req, res) => {
  try {
    const doc = await prisma.documento.findFirst({
      where: { id: req.params.id, ativo: true },
      select: {
        id: true,
        nomeArquivo: true,
        mimeType: true,
        dados: true,
        caminhoArquivo: true,
      },
    });

    if (!doc) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nomeArquivo)}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (STORAGE_MODE === 'disk') {
      if (!doc.caminhoArquivo || !fs.existsSync(doc.caminhoArquivo)) {
        return res.status(404).json({ error: 'Arquivo não encontrado no disco' });
      }
      return res.send(fs.readFileSync(doc.caminhoArquivo));
    }

    if (!doc.dados) {
      return res.status(404).json({ error: 'Dados do documento não encontrados no banco' });
    }
    return res.send(doc.dados);
  } catch (err) {
    console.error('Erro ao baixar documento:', err);
    return res.status(500).json({ error: 'Erro ao baixar documento' });
  }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res) => {
  try {
    const existing = await prisma.documento.findUnique({
      where: { id: req.params.id },
      select: { id: true, ativo: true },
    });

    if (!existing || !existing.ativo) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    await prisma.documento.update({
      where: { id: existing.id },
      data: { ativo: false },
    });

    return res.status(204).send();
  } catch (err) {
    console.error('Erro ao remover documento:', err);
    return res.status(500).json({ error: 'Erro ao remover documento' });
  }
});

module.exports = router;
