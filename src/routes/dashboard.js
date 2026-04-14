'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');
const { checkVencimentos } = require('../services/alertaVencimento');

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole(['ADMIN']));

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const day30Start = new Date(now);
    day30Start.setDate(day30Start.getDate() - 29);
    const month12Start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [totalLaudos, laudosMes, aguardandoAssinatura, statusRows, byInspectorRows, laudos30, laudos12m, assinados] = await Promise.all([
      prisma.laudo.count(),
      prisma.laudo.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.laudo.count({ where: { status: 'GERADO' } }),
      prisma.laudo.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.laudo.groupBy({
        by: ['createdById'],
        _count: { _all: true },
      }),
      prisma.laudo.findMany({
        where: { createdAt: { gte: day30Start } },
        select: { createdAt: true },
      }),
      prisma.laudo.findMany({
        where: { createdAt: { gte: month12Start } },
        select: { createdAt: true },
      }),
      prisma.laudo.findMany({
        where: { status: 'ASSINADO' },
        select: { createdAt: true, updatedAt: true },
      }),
    ]);

    const statusMap = { PENDENTE: 0, GERADO: 0, ASSINADO: 0 };
    statusRows.forEach((row) => {
      statusMap[row.status] = row._count._all;
    });

    const inspectorIds = byInspectorRows.map((r) => r.createdById);
    const inspectors = inspectorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: inspectorIds } },
          select: { id: true, nome: true },
        })
      : [];
    const inspectorNameById = Object.fromEntries(inspectors.map((i) => [i.id, i.nome]));
    const laudosPorInspetor = byInspectorRows
      .map((r) => ({
        nome: inspectorNameById[r.createdById] || 'Inspetor',
        total: r._count._all,
      }))
      .sort((a, b) => b.total - a.total);

    const laudosPorDiaMap = {};
    for (let i = 0; i < 30; i += 1) {
      const d = new Date(day30Start);
      d.setDate(day30Start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      laudosPorDiaMap[key] = 0;
    }
    laudos30.forEach((l) => {
      const key = l.createdAt.toISOString().slice(0, 10);
      if (laudosPorDiaMap[key] !== undefined) laudosPorDiaMap[key] += 1;
    });
    const laudosPorDia = Object.entries(laudosPorDiaMap).map(([data, total]) => ({ data, total }));

    const laudosPorMesMap = {};
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(month12Start.getFullYear(), month12Start.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      laudosPorMesMap[key] = 0;
    }
    laudos12m.forEach((l) => {
      const d = l.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (laudosPorMesMap[key] !== undefined) laudosPorMesMap[key] += 1;
    });
    const laudosPorMes = Object.entries(laudosPorMesMap).map(([mes, total]) => ({ mes, total }));

    const assinados30 = assinados.filter((l) => l.updatedAt >= day30Start);
    const tempoDias = assinados30.map((l) => (l.updatedAt - l.createdAt) / (1000 * 60 * 60 * 24));
    const tempoMedioFechamento = tempoDias.length
      ? Number((tempoDias.reduce((a, b) => a + b, 0) / tempoDias.length).toFixed(2))
      : 0;

    // Taxa de aprovação por itens do checklist no formData.
    const checkFields = [
      'estrutura_externa', 'corpo_tanque', 'passadicos', 'revestimento', 'isolamento_termico', 'escada',
      'dispositivos_canto', 'ponto_aterramento', 'fixacoes', 'bercos_fixacao', 'mossas_escavacoes', 'porosidade',
      'bocal_descarga', 'boca_visita', 'valvula_alivio', 'linha_ar', 'linha_recuperacao', 'acionamento_remoto',
      'tomada_saida_vapor', 'sistema_carga_descarga', 'dispositivo_medicao', 'valvula_fundo', 'tomada_entrada_vapor',
      'termometro_comp', 'manometro', 'tubulacoes', 'estrutura_visual',
    ];
    const laudosComForm = await prisma.laudo.findMany({ select: { formData: true } });
    let totalChecks = 0;
    let approvedChecks = 0;
    laudosComForm.forEach((l) => {
      const data = l.formData || {};
      checkFields.forEach((f) => {
        const val = (data[f] || '').toString().toUpperCase();
        if (!val) return;
        totalChecks += 1;
        if (val === 'APROVADO') approvedChecks += 1;
      });
    });
    const taxaAprovacao = totalChecks ? Number(((approvedChecks / totalChecks) * 100).toFixed(1)) : 0;

    return res.json({
      totalLaudos,
      laudosMes,
      aguardandoAssinatura,
      taxaAprovacao,
      laudosPorStatus: statusMap,
      laudosPorInspetor,
      laudosPorDia,
      laudosPorMes,
      tempoMedioFechamento,
    });
  } catch (err) {
    console.error('Erro em /dashboard/stats:', err);
    return res.status(500).json({ error: 'Erro ao obter estatísticas do dashboard' });
  }
});

router.get('/vencimentos', async (req, res) => {
  try {
    const dias = Math.max(1, Math.min(365, Number(req.query.dias || 30)));
    const now = startOfDay(new Date());
    const limite = new Date(now);
    limite.setDate(limite.getDate() + dias);

    const laudos = await prisma.laudo.findMany({
      where: { dataInspecao: { not: null } },
      orderBy: { dataInspecao: 'asc' },
      select: {
        id: true,
        numeroIdentificacao: true,
        cliente: true,
        dataInspecao: true,
        createdBy: { select: { nome: true } },
      },
    });

    const result = laudos
      .map((l) => {
        const vencimento = addMonths(l.dataInspecao, 12);
        const diasRestantes = Math.ceil((startOfDay(vencimento) - now) / (1000 * 60 * 60 * 24));
        return {
          id: l.id,
          container: l.numeroIdentificacao,
          cliente: l.cliente,
          inspetor: l.createdBy?.nome || 'Inspetor',
          dataInspecao: l.dataInspecao,
          vencimento,
          diasRestantes,
        };
      })
      .filter((r) => r.vencimento <= limite)
      .sort((a, b) => a.vencimento - b.vencimento);

    return res.json(result);
  } catch (err) {
    console.error('Erro em /dashboard/vencimentos:', err);
    return res.status(500).json({ error: 'Erro ao obter vencimentos' });
  }
});

router.post('/alertas/check', async (req, res) => {
  try {
    const result = await checkVencimentos();
    return res.json(result);
  } catch (err) {
    console.error('Erro em /dashboard/alertas/check:', err);
    return res.status(500).json({ error: 'Erro ao verificar alertas de vencimento' });
  }
});

module.exports = router;
