'use strict';

const express = require('express');
const multer  = require('multer');
const PizZip  = require('pizzip');
const Docxtemplater = require('docxtemplater');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const xss = require('xss');
const fs   = require('fs');
const path = require('path');
const prisma = require('./src/lib/prisma');
const authMiddleware = require('./src/middlewares/authMiddleware');
const requireRole = require('./src/middlewares/requireRole');
const laudosRoutes = require('./src/routes/laudos');
const adminRoutes = require('./src/routes/admin');
const dashboardRoutes = require('./src/routes/dashboard');
const equipamentosRoutes = require('./src/routes/equipamentos');
const clientesRoutes = require('./src/routes/clientes');
const authRoutes = require('./src/routes/auth');
const { checkVencimentos } = require('./src/services/alertaVencimento');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_EXPIRES_IN = '8h';
const COOKIE_NAME = 'auth_token';
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;

const loginLimiter = rateLimit({
  windowMs: LOGIN_LOCK_WINDOW_MS,
  max: 5,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Muitas requisições. Aguarde um momento.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/generate',
});

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  };
}

// ─── Caminhos de arquivos somente-leitura (existem no repo, não são escritos) ─
const CONFIG_PATH   = path.join(__dirname, 'config.json');
const TEMPLATE_PATH = path.join(__dirname, 'template', 'template.docx');

// ─── Cache em memória: template carregado uma única vez no startup ────────────
// Evita leitura de disco a cada requisição e é compatível com Render (efêmero).
const TEMPLATE_BINARY = fs.readFileSync(TEMPLATE_PATH, 'binary');

// ─── Multer: armazenamento 100% em memória (sem disco) ───────────────────────
const PHOTO_FIELDS = [
  'foto_frontal', 'foto_traseira', 'foto_lateral1', 'foto_lateral2',
  'foto_superior', 'foto_termometro', 'foto_tampa_boca_visita',
  'foto_valvula_alivio', 'foto_valvula_descarga', 'foto_placa_identificacao',
];

// Mapeamento campo → entrada de mídia no zip do docx
const PHOTO_MEDIA_MAP = {
  foto_frontal:             'word/media/image1.png',
  foto_traseira:            'word/media/image2.png',
  foto_lateral1:            'word/media/image3.png',
  foto_lateral2:            'word/media/image4.png',
  foto_superior:            'word/media/image5.png',
  foto_termometro:          'word/media/image6.png',
  foto_tampa_boca_visita:   'word/media/image7.png',
  foto_valvula_alivio:      'word/media/image8.png',
  foto_valvula_descarga:    'word/media/image9.png',
  foto_placa_identificacao: 'word/media/image10.png',
};

// memoryStorage → file.buffer disponível diretamente, nada gravado em disco
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ─── Formatação de data em português ─────────────────────────────────────────
const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

function formatDatePt(iso) {
  // iso: "YYYY-MM-DD"
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} de ${MESES[parseInt(m) - 1]} de ${y}`;
}

// ─── Static files ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = xss(req.body[key]);
      }
    }
  }
  next();
});
app.use(generalLimiter);

app.get('/index.html', (req, res) => res.redirect(301, '/'));
app.get('/login.html', (req, res) => res.redirect(301, '/login'));
app.get('/admin.html', (req, res) => res.redirect(301, '/painel-admin'));
app.get('/kanban.html', (req, res) => res.redirect(301, '/kanban'));
app.get('/dashboard.html', (req, res) => res.redirect(301, '/dashboard'));
app.get('/equipamentos.html', (req, res) => res.redirect(301, '/equipamentos'));
app.get('/clientes.html', (req, res) => res.redirect(301, '/clientes'));

app.use(express.static(path.join(__dirname, 'public')));
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/painel-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/kanban', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kanban.html'));
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
function isPageNavigation(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('text/html');
}
app.get('/equipamentos', (req, res, next) => {
  if (!isPageNavigation(req)) return next();
  return res.sendFile(path.join(__dirname, 'public', 'equipamentos.html'));
});
app.get('/clientes', (req, res, next) => {
  if (!isPageNavigation(req)) return next();
  return res.sendFile(path.join(__dirname, 'public', 'clientes.html'));
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
    });

    if (!user || !user.ativo) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        email: user.email,
        nome: user.nome,
      },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie(COOKIE_NAME, token, getCookieOptions());

    return res.json({
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ error: 'Erro interno no login' });
  }
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, getCookieOptions());
  return res.status(204).send();
});

app.get('/auth/me', authMiddleware, (req, res) => {
  return res.json({ user: req.user });
});

app.get('/auth/admin/ping', authMiddleware, requireRole('ADMIN'), (req, res) => {
  return res.json({ ok: true });
});

app.use('/laudos', laudosRoutes);
app.use('/admin', adminRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/equipamentos', equipamentosRoutes);
app.use('/clientes', clientesRoutes);
app.use('/auth', authRoutes);

function buildTemplateData(formData, cfg, dataPt) {
  return {
    // Identificação
    numero_identificacao: formData.numero_identificacao || '',
    cliente:              formData.cliente              || '',
    endereco:             formData.endereco             || '',
    data_inspecao:        dataPt,

    // Dados Técnicos
    tipo_equipamento:     formData.tipo_equipamento     || 'ISOTANK',
    fabricante:           formData.fabricante           || '',
    numero_serie:         formData.numero_serie         || '',
    pais_fabricacao:      formData.pais_fabricacao      || '',
    tamanho:              formData.tamanho              || '',
    capacidade_liquida:   formData.capacidade_liquida   || '',
    ano_fabricacao:       formData.ano_fabricacao       || '',
    identificacao:        (formData.numero_identificacao || '').split(' ')[0] || '',
    tara:                 formData.tara                 || '',
    peso_carga_liquida:   formData.peso_carga_liquida   || '',
    peso_bruto_total:     formData.peso_bruto_total     || '',
    peso_empilhamento:    formData.peso_empilhamento    || '',
    norma_fabricacao:     formData.norma_fabricacao     || '',
    pressao_projeto:      formData.pressao_projeto      || '',
    pressao_ensaio:       formData.pressao_ensaio       || '',
    pressao_maxima:       formData.pressao_maxima       || '',
    temperatura_projeto:  formData.temperatura_projeto  || '',
    material_calota:      formData.material_calota      || '',
    material_costado:     formData.material_costado     || '',
    espessura:            formData.espessura            || '',
    conexoes_flange:      formData.conexoes_flange      || '',
    chapa_identificacao:  formData.chapa_identificacao  || '',
    cert_calibracao:      formData.cert_calibracao      || '',
    cert_descontaminacao: formData.cert_descontaminacao || '',

    // Estrutura Externa
    estrutura_externa:    formData.estrutura_externa    || '',
    corpo_tanque:         formData.corpo_tanque         || '',
    passadicos:           formData.passadicos           || '',
    revestimento:         formData.revestimento         || '',
    isolamento_termico:   formData.isolamento_termico   || '',
    escada:               formData.escada               || '',
    dispositivos_canto:   formData.dispositivos_canto   || '',
    ponto_aterramento:    formData.ponto_aterramento    || '',
    fixacoes:             formData.fixacoes             || '',
    bercos_fixacao:       formData.bercos_fixacao       || '',
    mossas_escavacoes:    formData.mossas_escavacoes    || '',
    porosidade:           formData.porosidade           || '',

    // Componentes e Acessórios
    bocal_descarga:         formData.bocal_descarga         || '',
    boca_visita:            formData.boca_visita            || '',
    valvula_alivio:         formData.valvula_alivio         || '',
    linha_ar:               formData.linha_ar               || '',
    linha_recuperacao:      formData.linha_recuperacao      || '',
    acionamento_remoto:     formData.acionamento_remoto     || '',
    tomada_saida_vapor:     formData.tomada_saida_vapor     || '',
    sistema_carga_descarga: formData.sistema_carga_descarga || '',
    dispositivo_medicao:    formData.dispositivo_medicao    || '',
    valvula_fundo:          formData.valvula_fundo          || '',
    tomada_entrada_vapor:   formData.tomada_entrada_vapor   || '',
    termometro_comp:        formData.termometro_comp        || '',
    manometro:              formData.manometro              || '',
    tubulacoes:             formData.tubulacoes             || '',
    estrutura_visual:       formData.estrutura_visual       || '',

    // Exames realizados
    exame_visual_externo:   formData.exame_visual_externo   || '',
    exame_visual_interno:   formData.exame_visual_interno   || '',
    estanqueidade:          formData.estanqueidade          || '',
    sistema_descarga_exame: formData.sistema_descarga_exame || '',
    valvulas_conexoes_exame:formData.valvulas_conexoes_exame|| '',

    // Conclusão / Recomendação / Rodapé
    conclusao:      formData.conclusao      || '',
    recomendacao:   formData.recomendacao   || '',
    encarregado:    cfg.encarregado,
    engenheiro:     cfg.engenheiro,
    crea_info:      cfg.crea_info,
    cidade_data:    `${cfg.cidade}, ${dataPt}`,
  };
}

// ─── Rota: POST /generate ────────────────────────────────────────────────────
app.post(
  '/generate',
  upload.fields(PHOTO_FIELDS.map(f => ({ name: f, maxCount: 1 }))),
  async (req, res) => {
    try {
      const body  = req.body;
      const files = req.files || {};
      const cfg   = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      let sourceData = body;
      let laudo = null;

      if (body.laudoId) {
        laudo = await prisma.laudo.findUnique({
          where: { id: String(body.laudoId) },
          select: {
            id: true,
            status: true,
            formData: true,
          },
        });

        if (!laudo) {
          return res.status(404).json({ error: 'Laudo não encontrado para geração' });
        }

        sourceData = laudo.formData || {};
      }

      // ── Montar objeto de dados para o template ──────────────────────────────
      const dataPt = sourceData.data_inspecao
        ? formatDatePt(sourceData.data_inspecao)
        : '';

      const templateData = buildTemplateData(sourceData, cfg, dataPt);

      // ── Gerar docx com docxtemplater (template já em memória) ─────────────
      const zip = new PizZip(TEMPLATE_BINARY);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => '',
      });
      doc.render(templateData);

      // ── Substituições diretas para assinaturas e data ─────────────────────
      // (estes campos não passam pelo docxtemplater — substituição pós-render)
      let docXml = zip.file('word/document.xml').asText();

      function escapeXml(s) {
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      // Diego Aparecido de Lima → engenheiro (run único)
      docXml = docXml.replace(/<w:t[^>]*>\s*Diego Aparecido de Lima\s*<\/w:t>/g,
        `<w:t>${escapeXml(cfg.engenheiro)}</w:t>`);

      // Elton Vieira → encarregado (corre em múltiplos runs — tratar parágrafo)
      docXml = docXml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (para) => {
        const texts = [];
        para.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (m, t) => texts.push(t));
        const full = texts.join('').trim();
        if (full.includes('Elton Vieira') || full.includes('Elton Vie')) {
          const pPrMatch = para.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
          const pPr = pPrMatch ? pPrMatch[0] : '';
          const rPrMatch = para.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
          const rPr = rPrMatch ? rPrMatch[0] : '';
          return `<w:p>${pPr}<w:r>${rPr}<w:t>${escapeXml(cfg.encarregado)}</w:t></w:r></w:p>`;
        }
        return para;
      });

      // CREA → crea_info
      docXml = docXml.replace(/<w:t[^>]*>\s*CREA:506\.927\.6941-S\s*<\/w:t>/g,
        `<w:t>${escapeXml(cfg.crea_info)}</w:t>`);

      // Data no rodapé: encontrar parágrafo que agrega "Cubatão, ...de...de 20XX"
      // e substituir todo o conteúdo por cidade + data formatada
      if (dataPt) {
        const cidadeData = `${cfg.cidade}, ${dataPt}`;
        docXml = docXml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (para) => {
          const texts = [];
          para.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (m, t) => texts.push(t));
          const full = texts.join('').trim();
          // Só substituir o parágrafo que parece a linha de data+cidade
          if (/Cubat[aã]o,/.test(full) && /de\s+\d{4}$/.test(full)) {
            const pPrMatch = para.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
            const pPr = pPrMatch ? pPrMatch[0] : '';
            const rPrMatch = para.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
            const rPr = rPrMatch ? rPrMatch[0] : '';
            return `<w:p>${pPr}<w:r>${rPr}<w:t>${escapeXml(cidadeData)}</w:t></w:r></w:p>`;
          }
          return para;
        });
      }

      zip.file('word/document.xml', docXml);

      // ── Injetar fotos no zip (buffer em memória — sem acesso a disco) ────────
      for (const field of PHOTO_FIELDS) {
        if (files[field] && files[field][0]) {
          zip.file(PHOTO_MEDIA_MAP[field], files[field][0].buffer);
        }
      }

      // ── Serializar e enviar ────────────────────────────────────────────────
      const outputBuffer = zip.generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });

      const safeId = (sourceData.numero_identificacao || 'ISOTANK')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `LAUDO_${safeId}.docx`;

      if (laudo) {
        await prisma.laudo.update({
          where: { id: laudo.id },
          data: {
            status: 'GERADO',
            generatedAt: new Date(),
            generatedFileName: filename,
          },
        });

        await prisma.auditLog.create({
          data: {
            action: 'STATUS_CHANGED',
            laudoId: laudo.id,
            fromStatus: laudo.status,
            toStatus: 'GERADO',
            metadata: { source: 'generate' },
          },
        });
      }

      res.setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(outputBuffer);

      // Cadastro automático de cliente/equipamento (não crítico).
      // Este bloco roda após o download ser disparado e nunca deve quebrar a resposta.
      try {
        const clienteNome = String(templateData.cliente || '').trim();
        const numeroIdentificacao = String(templateData.numero_identificacao || '').trim();
        const dataInspecaoRaw = body.data_inspecao || sourceData.data_inspecao;
        const dataInspecao = dataInspecaoRaw ? new Date(dataInspecaoRaw) : null;
        const dataInspecaoValida = dataInspecao && !Number.isNaN(dataInspecao.getTime())
          ? dataInspecao
          : null;
        const proximoVencimento = dataInspecaoValida
          ? new Date(dataInspecaoValida.getFullYear() + 1, dataInspecaoValida.getMonth(), dataInspecaoValida.getDate())
          : null;

        if (clienteNome && numeroIdentificacao) {
          const cliente = await prisma.cliente.upsert({
            where: { nome: clienteNome },
            update: {},
            create: {
              nome: clienteNome,
              endereco: templateData.endereco || null,
            },
          });

          const equipamento = await prisma.equipamento.upsert({
            where: { numeroIdentificacao },
            update: {
              fabricante: templateData.fabricante || 'N/A',
              numeroSerie: templateData.numero_serie || null,
              paisFabricacao: templateData.pais_fabricacao || null,
              tamanho: templateData.tamanho || null,
              capacidadeLiquida: templateData.capacidade_liquida || null,
              anoFabricacao: templateData.ano_fabricacao || null,
              normaFabricacao: templateData.norma_fabricacao || null,
              materialCalota: templateData.material_calota || null,
              materialCostado: templateData.material_costado || null,
              espessura: templateData.espessura || null,
              ultimaInspecao: dataInspecaoValida,
              proximoVencimento,
              totalInspecoes: { increment: 1 },
              clienteId: cliente.id,
            },
            create: {
              numeroIdentificacao,
              fabricante: templateData.fabricante || 'N/A',
              numeroSerie: templateData.numero_serie || null,
              paisFabricacao: templateData.pais_fabricacao || null,
              tamanho: templateData.tamanho || null,
              capacidadeLiquida: templateData.capacidade_liquida || null,
              anoFabricacao: templateData.ano_fabricacao || null,
              normaFabricacao: templateData.norma_fabricacao || null,
              materialCalota: templateData.material_calota || null,
              materialCostado: templateData.material_costado || null,
              espessura: templateData.espessura || null,
              ultimaInspecao: dataInspecaoValida,
              proximoVencimento,
              totalInspecoes: 1,
              clienteId: cliente.id,
            },
          });

          if (laudo?.id) {
            await prisma.laudo.update({
              where: { id: laudo.id },
              data: { equipamentoId: equipamento.id },
            });
          }
        }
      } catch (errCadastroEquipamento) {
        console.error('Erro ao cadastrar equipamento (não crítico):', errCadastroEquipamento);
      }

    } catch (err) {
      console.error('Erro ao gerar laudo:', err);
      res.status(500).json({ error: 'Erro ao gerar laudo', details: err.message });
    }
  }
);

async function ensureDefaultUsers() {
  const adminPasswordHash = await bcrypt.hash('Admin@123', 10);
  const inspetorPasswordHash = await bcrypt.hash('Inspetor@123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@ceinspec.local' },
    update: {
      nome: 'Administrador CEINSPEC',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      ativo: true,
    },
    create: {
      nome: 'Administrador CEINSPEC',
      email: 'admin@ceinspec.local',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      ativo: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'inspetor@ceinspec.local' },
    update: {
      nome: 'Inspetor Padrão',
      passwordHash: inspetorPasswordHash,
      role: 'INSPETOR',
      ativo: true,
    },
    create: {
      nome: 'Inspetor Padrão',
      email: 'inspetor@ceinspec.local',
      passwordHash: inspetorPasswordHash,
      role: 'INSPETOR',
      ativo: true,
    },
  });

  console.log('Usuários padrão garantidos automaticamente.');
}

async function bootstrap() {
  try {
    await ensureDefaultUsers();

    app.listen(PORT, () => {
      console.log(`\n  CEINSPEC Isotank — Laudo Generator`);
      console.log(`  Servidor rodando em http://localhost:${PORT}\n`);

      const runAlertCheck = async () => {
        try {
          const result = await checkVencimentos();
          const hhmm = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          console.log(`Verificação de vencimentos executada: ${hhmm}`, result);
        } catch (err) {
          console.error('Falha na verificação de vencimentos:', err.message);
        }
      };

      runAlertCheck();
      setInterval(runAlertCheck, 86400000);
    });
  } catch (err) {
    console.error('Falha ao inicializar aplicação:', err);
    process.exit(1);
  }
}

bootstrap();
