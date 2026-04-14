'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

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

module.exports = router;
