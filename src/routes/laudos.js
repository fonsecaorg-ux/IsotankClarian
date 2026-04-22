'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');

const router = express.Router();
const ALLOWED_STATUS = ['EM_INSPECAO', 'AGUARDANDO_APROVACAO', 'PENDENTE_ASSINATURA', 'ASSINADO_DIGITALMENTE', 'CONCLUIDO'];
const STORAGE_MODE = String(process.env.STORAGE_MODE || 'database').trim().toLowerCase() === 'disk'
  ? 'disk'
  : 'database';
const STORAGE_PATH_RAW = String(process.env.STORAGE_PATH || './storage/fotos').trim() || './storage/fotos';
const STORAGE_ROOT = path.isAbsolute(STORAGE_PATH_RAW)
  ? STORAGE_PATH_RAW
  : path.join(process.cwd(), STORAGE_PATH_RAW);
const SIGNED_ROOT = path.join(STORAGE_ROOT, 'laudos-assinados');
const signedUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function getSignedAbsolutePath(storedPath) {
  if (!storedPath) return null;
  return path.isAbsolute(storedPath) ? storedPath : path.join(STORAGE_ROOT, storedPath);
}

function canAccessLaudo(user, laudo) {
  if (user.role === 'ADMIN') return true;
  return laudo.createdById === user.id;
}

router.use(authMiddleware);

router.post('/', async (req, res) => {
  try {
    const formData = req.body || {};

    const dataInspecao = formData.data_inspecao
      ? new Date(formData.data_inspecao)
      : null;

    const laudo = await prisma.laudo.create({
      data: {
        formData,
        numeroIdentificacao: formData.numero_identificacao || null,
        cliente: formData.cliente || null,
        endereco: formData.endereco || null,
        dataInspecao: dataInspecao && !Number.isNaN(dataInspecao.getTime()) ? dataInspecao : null,
        status: 'EM_INSPECAO',
        createdById: req.user.id,
      },
      select: {
        id: true,
        status: true,
      },
    });

    return res.status(201).json(laudo);
  } catch (err) {
    console.error('Erro ao criar laudo:', err);
    return res.status(500).json({ error: 'Erro ao criar laudo' });
  }
});

router.get('/', async (req, res) => {
  try {
    const where = req.user.role === 'ADMIN' ? {} : { createdById: req.user.id };

    const laudos = await prisma.laudo.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        numeroIdentificacao: true,
        cliente: true,
        endereco: true,
        status: true,
        dataInspecao: true,
        createdAt: true,
        signedAt: true,
        signedFileName: true,
        createdById: true,
        createdBy: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
    });

    return res.json(laudos);
  } catch (err) {
    console.error('Erro ao listar laudos:', err);
    return res.status(500).json({ error: 'Erro ao listar laudos' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const laudo = await prisma.laudo.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        signedBy: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
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

    if (!laudo) {
      return res.status(404).json({ error: 'Laudo não encontrado' });
    }

    if (!canAccessLaudo(req.user, laudo)) {
      return res.status(403).json({ error: 'Sem permissão para este laudo' });
    }

    return res.json(laudo);
  } catch (err) {
    console.error('Erro ao buscar laudo:', err);
    return res.status(500).json({ error: 'Erro ao buscar laudo' });
  }
});

router.get('/:id/fotos', async (req, res) => {
  try {
    const laudo = await prisma.laudo.findUnique({
      where: { id: req.params.id },
      select: { id: true, createdById: true },
    });

    if (!laudo) {
      return res.status(404).json({ error: 'Laudo não encontrado' });
    }

    if (!canAccessLaudo(req.user, laudo)) {
      return res.status(403).json({ error: 'Sem permissão para este laudo' });
    }

    const fotos = await prisma.fotoLaudo.findMany({
      where: { laudoId: laudo.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        campo: true,
        label: true,
        tamanho: true,
      },
    });

    return res.json(fotos);
  } catch (err) {
    console.error('Erro ao listar fotos do laudo:', err);
    return res.status(500).json({ error: 'Erro ao listar fotos do laudo' });
  }
});

router.get('/:id/fotos/:fotoId', async (req, res) => {
  try {
    const laudo = await prisma.laudo.findUnique({
      where: { id: req.params.id },
      select: { id: true, createdById: true },
    });

    if (!laudo) {
      return res.status(404).json({ error: 'Laudo não encontrado' });
    }

    if (!canAccessLaudo(req.user, laudo)) {
      return res.status(403).json({ error: 'Sem permissão para este laudo' });
    }

    const foto = await prisma.fotoLaudo.findFirst({
      where: {
        id: req.params.fotoId,
        laudoId: laudo.id,
      },
      select: {
        dados: true,
        mimeType: true,
        caminhoArquivo: true,
      },
    });

    if (!foto) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }

    res.setHeader('Content-Type', foto.mimeType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (STORAGE_MODE === 'disk') {
      const absoluteFilePath = foto.caminhoArquivo
        ? (path.isAbsolute(foto.caminhoArquivo) ? foto.caminhoArquivo : path.join(STORAGE_ROOT, foto.caminhoArquivo))
        : null;
      if (!absoluteFilePath || !fs.existsSync(absoluteFilePath)) {
        return res.status(404).json({ error: 'Arquivo da foto não encontrado no disco' });
      }
      const fileBuffer = fs.readFileSync(absoluteFilePath);
      return res.send(fileBuffer);
    }

    if (!foto.dados) {
      return res.status(404).json({ error: 'Dados da foto não encontrados no banco' });
    }
    return res.send(foto.dados);
  } catch (err) {
    console.error('Erro ao servir foto do laudo:', err);
    return res.status(500).json({ error: 'Erro ao servir foto do laudo' });
  }
});

router.post('/:id/signed-pdf', requireRole(['ADMIN']), (req, res) => {
  signedUpload.single('arquivo')(req, res, async (uploadErr) => {
    if (uploadErr && uploadErr.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo excede 20MB' });
    }
    if (uploadErr) {
      return res.status(400).json({ error: 'Falha ao processar upload do PDF assinado' });
    }
    try {
      const laudo = await prisma.laudo.findUnique({
        where: { id: req.params.id },
        select: { id: true, status: true, numeroIdentificacao: true },
      });
      if (!laudo) return res.status(404).json({ error: 'Laudo não encontrado' });

      const file = req.file;
      if (!file || !file.buffer || file.buffer.length === 0) {
        return res.status(400).json({ error: 'Arquivo PDF assinado é obrigatório' });
      }
      if ((file.mimetype || '').toLowerCase() !== 'application/pdf') {
        return res.status(400).json({ error: 'Formato inválido. Envie um PDF assinado' });
      }

      const numeroIdentificacao = String(req.body?.numeroIdentificacao || laudo.numeroIdentificacao || '').trim() || 'LAUDO';
      const safeName = `${numeroIdentificacao}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const signedFileName = `LAUDO_${safeName}_ASSINADO.pdf`;
      const signedHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

      let signedPath = null;
      let signedData = file.buffer;
      if (STORAGE_MODE === 'disk') {
        fs.mkdirSync(SIGNED_ROOT, { recursive: true });
        const finalName = `${laudo.id}_${Date.now()}_${signedFileName}`;
        const absolutePath = path.join(SIGNED_ROOT, finalName);
        fs.writeFileSync(absolutePath, file.buffer);
        signedPath = absolutePath;
        signedData = null;
      }

      const updated = await prisma.laudo.update({
        where: { id: laudo.id },
        data: {
          status: 'ASSINADO_DIGITALMENTE',
          signedFileName,
          signedMimeType: 'application/pdf',
          signedSize: Number(file.size || file.buffer.length),
          signedHash,
          signedPath,
          signedData,
          signedAt: new Date(),
          signedById: req.user.id,
        },
        select: {
          id: true,
          status: true,
          signedFileName: true,
          signedAt: true,
          signedHash: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          action: 'SIGNED_PDF_ATTACHED',
          laudoId: laudo.id,
          userId: req.user.id,
          fromStatus: laudo.status,
          toStatus: 'ASSINADO_DIGITALMENTE',
          metadata: {
            signedFileName,
            signedSize: Number(file.size || file.buffer.length),
            signedHash,
          },
        },
      });

      return res.status(201).json(updated);
    } catch (err) {
      console.error('Erro ao anexar PDF assinado:', err);
      return res.status(500).json({ error: 'Erro ao anexar PDF assinado' });
    }
  });
});

router.get('/:id/oficial/download', async (req, res) => {
  try {
    const laudo = await prisma.laudo.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        createdById: true,
        signedFileName: true,
        signedMimeType: true,
        signedData: true,
        signedPath: true,
        signedAt: true,
      },
    });
    if (!laudo) return res.status(404).json({ error: 'Laudo não encontrado' });
    if (!canAccessLaudo(req.user, laudo)) {
      return res.status(403).json({ error: 'Sem permissão para este laudo' });
    }
    if (!laudo.signedAt || !laudo.signedFileName) {
      return res.status(409).json({ error: 'Laudo sem assinatura digital oficial anexada' });
    }

    res.setHeader('Content-Type', laudo.signedMimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(laudo.signedFileName)}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (STORAGE_MODE === 'disk') {
      const absolutePath = getSignedAbsolutePath(laudo.signedPath);
      if (!absolutePath || !fs.existsSync(absolutePath)) {
        return res.status(404).json({ error: 'Arquivo assinado não encontrado no disco' });
      }
      return res.send(fs.readFileSync(absolutePath));
    }

    if (!laudo.signedData) {
      return res.status(404).json({ error: 'PDF assinado não encontrado no banco' });
    }
    return res.send(laudo.signedData);
  } catch (err) {
    console.error('Erro ao baixar laudo oficial assinado:', err);
    return res.status(500).json({ error: 'Erro ao baixar laudo oficial assinado' });
  }
});

router.patch('/:id/status', requireRole(['ADMIN']), async (req, res) => {
  try {
    const { status } = req.body || {};

    if (!ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const existing = await prisma.laudo.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Laudo não encontrado' });
    }

    if (status === 'ASSINADO_DIGITALMENTE') {
      const signed = await prisma.laudo.findUnique({
        where: { id: existing.id },
        select: { signedAt: true, signedFileName: true },
      });
      if (!signed?.signedAt || !signed?.signedFileName) {
        return res.status(400).json({ error: 'Anexe um PDF assinado antes de definir status ASSINADO_DIGITALMENTE' });
      }
    }

    const updated = await prisma.laudo.update({
      where: { id: req.params.id },
      data: { status },
    });

    await prisma.auditLog.create({
      data: {
        action: 'STATUS_CHANGED',
        laudoId: existing.id,
        userId: req.user.id,
        fromStatus: existing.status,
        toStatus: status,
      },
    });

    return res.json(updated);
  } catch (err) {
    console.error('Erro ao atualizar status do laudo:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status do laudo' });
  }
});

module.exports = router;
