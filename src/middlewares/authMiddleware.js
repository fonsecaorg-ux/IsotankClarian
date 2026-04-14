'use strict';

const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

module.exports = async function authMiddleware(req, res, next) {
  try {
    const token = req.cookies && req.cookies.auth_token;

    if (!token) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
      },
    });

    if (!user || !user.ativo) {
      return res.status(401).json({ error: 'Sessão inválida' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};
