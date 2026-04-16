'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});
const ALLOWED_SIGNATURE_MIME = new Set(['image/png', 'image/jpeg']);

function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 8) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasUpper && hasNumber;
}

router.patch('/password', authMiddleware, async (req, res) => {
  try {
    const { senhaAtual, novaSenha, confirmarSenha } = req.body || {};

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      return res.status(400).json({ error: 'Preencha senhaAtual, novaSenha e confirmarSenha.' });
    }

    if (novaSenha !== confirmarSenha) {
      return res.status(400).json({ error: 'Nova senha e confirmação não conferem.' });
    }

    if (novaSenha === senhaAtual) {
      return res.status(400).json({ error: 'A nova senha deve ser diferente da senha atual.' });
    }

    if (!validatePasswordStrength(novaSenha)) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 8 caracteres, 1 letra maiúscula e 1 número.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const isCurrentPasswordValid = await bcrypt.compare(String(senhaAtual), user.passwordHash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Senha atual inválida.' });
    }

    const passwordHash = await bcrypt.hash(String(novaSenha), 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
      select: { id: true },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erro ao alterar senha:', err);
    return res.status(500).json({ error: 'Erro ao alterar senha.' });
  }
});

router.get('/me/assinatura', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        assinatura: true,
        assinaturaMimeType: true,
      },
    });

    if (!user || !user.assinatura) {
      return res.status(404).json({ error: 'Assinatura não cadastrada.' });
    }

    res.setHeader('Content-Type', user.assinaturaMimeType || 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(user.assinatura);
  } catch (err) {
    console.error('Erro ao obter assinatura:', err);
    return res.status(500).json({ error: 'Erro ao obter assinatura.' });
  }
});

router.put('/me/assinatura', authMiddleware, (req, res) => {
  upload.single('assinatura')(req, res, async (uploadErr) => {
    if (uploadErr && uploadErr.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo excede 2MB.' });
    }
    if (uploadErr) {
      return res.status(400).json({ error: 'Falha ao processar upload da assinatura.' });
    }

    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'Arquivo de assinatura é obrigatório.' });
      }
      if (!ALLOWED_SIGNATURE_MIME.has(file.mimetype)) {
        return res.status(400).json({ error: 'Formato inválido. Use PNG ou JPG.' });
      }

      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          assinatura: file.buffer,
          assinaturaMimeType: file.mimetype,
        },
        select: { id: true },
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error('Erro ao salvar assinatura:', err);
      return res.status(500).json({ error: 'Erro ao salvar assinatura.' });
    }
  });
});

module.exports = router;
