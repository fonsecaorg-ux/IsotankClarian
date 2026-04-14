'use strict';

const express = require('express');
const multer  = require('multer');
const PizZip  = require('pizzip');
const Docxtemplater = require('docxtemplater');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const fs   = require('fs');
const path = require('path');
const prisma = require('./src/lib/prisma');
const authMiddleware = require('./src/middlewares/authMiddleware');
const requireRole = require('./src/middlewares/requireRole');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_EXPIRES_IN = '8h';
const COOKIE_NAME = 'auth_token';

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
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/auth/login', async (req, res) => {
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

// ─── Rota: POST /generate ────────────────────────────────────────────────────
app.post(
  '/generate',
  upload.fields(PHOTO_FIELDS.map(f => ({ name: f, maxCount: 1 }))),
  (req, res) => {
    try {
      const body  = req.body;
      const files = req.files || {};
      const cfg   = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

      // ── Montar objeto de dados para o template ──────────────────────────────
      const dataPt = body.data_inspecao
        ? formatDatePt(body.data_inspecao)
        : '';

      const templateData = {
        // Identificação
        numero_identificacao: body.numero_identificacao || '',
        cliente:              body.cliente              || '',
        endereco:             body.endereco             || '',
        data_inspecao:        dataPt,

        // Dados Técnicos
        tipo_equipamento:     body.tipo_equipamento     || 'ISOTANK',
        fabricante:           body.fabricante           || '',
        numero_serie:         body.numero_serie         || '',
        pais_fabricacao:      body.pais_fabricacao      || '',
        tamanho:              body.tamanho              || '',
        capacidade_liquida:   body.capacidade_liquida   || '',
        ano_fabricacao:       body.ano_fabricacao       || '',
        identificacao:        (body.numero_identificacao || '').split(' ')[0] || '',
        tara:                 body.tara                 || '',
        peso_carga_liquida:   body.peso_carga_liquida   || '',
        peso_bruto_total:     body.peso_bruto_total     || '',
        peso_empilhamento:    body.peso_empilhamento    || '',
        norma_fabricacao:     body.norma_fabricacao     || '',
        pressao_projeto:      body.pressao_projeto      || '',
        pressao_ensaio:       body.pressao_ensaio       || '',
        pressao_maxima:       body.pressao_maxima       || '',
        temperatura_projeto:  body.temperatura_projeto  || '',
        material_calota:      body.material_calota      || '',
        material_costado:     body.material_costado     || '',
        espessura:            body.espessura            || '',
        conexoes_flange:      body.conexoes_flange      || '',
        chapa_identificacao:  body.chapa_identificacao  || '',
        cert_calibracao:      body.cert_calibracao      || '',
        cert_descontaminacao: body.cert_descontaminacao || '',

        // Estrutura Externa
        estrutura_externa:    body.estrutura_externa    || '',
        corpo_tanque:         body.corpo_tanque         || '',
        passadicos:           body.passadicos           || '',
        revestimento:         body.revestimento         || '',
        isolamento_termico:   body.isolamento_termico   || '',
        escada:               body.escada               || '',
        dispositivos_canto:   body.dispositivos_canto   || '',
        ponto_aterramento:    body.ponto_aterramento    || '',
        fixacoes:             body.fixacoes             || '',
        bercos_fixacao:       body.bercos_fixacao       || '',
        mossas_escavacoes:    body.mossas_escavacoes    || '',
        porosidade:           body.porosidade           || '',

        // Componentes e Acessórios
        bocal_descarga:         body.bocal_descarga         || '',
        boca_visita:            body.boca_visita            || '',
        valvula_alivio:         body.valvula_alivio         || '',
        linha_ar:               body.linha_ar               || '',
        linha_recuperacao:      body.linha_recuperacao      || '',
        acionamento_remoto:     body.acionamento_remoto     || '',
        tomada_saida_vapor:     body.tomada_saida_vapor     || '',
        sistema_carga_descarga: body.sistema_carga_descarga || '',
        dispositivo_medicao:    body.dispositivo_medicao    || '',
        valvula_fundo:          body.valvula_fundo          || '',
        tomada_entrada_vapor:   body.tomada_entrada_vapor   || '',
        termometro_comp:        body.termometro_comp        || '',
        manometro:              body.manometro              || '',
        tubulacoes:             body.tubulacoes             || '',
        estrutura_visual:       body.estrutura_visual       || '',

        // Exames realizados
        exame_visual_externo:   body.exame_visual_externo   || '',
        exame_visual_interno:   body.exame_visual_interno   || '',
        estanqueidade:          body.estanqueidade          || '',
        sistema_descarga_exame: body.sistema_descarga_exame || '',
        valvulas_conexoes_exame:body.valvulas_conexoes_exame|| '',

        // Conclusão / Recomendação / Rodapé
        conclusao:      body.conclusao      || '',
        recomendacao:   body.recomendacao   || '',
        encarregado:    cfg.encarregado,
        engenheiro:     cfg.engenheiro,
        crea_info:      cfg.crea_info,
        cidade_data:    `${cfg.cidade}, ${dataPt}`,
      };

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

      const safeId = (body.numero_identificacao || 'ISOTANK')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `LAUDO_${safeId}.docx`;

      res.setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(outputBuffer);

    } catch (err) {
      console.error('Erro ao gerar laudo:', err);
      res.status(500).json({ error: 'Erro ao gerar laudo', details: err.message });
    }
  }
);

async function ensureDefaultUsers() {
  const totalUsers = await prisma.user.count();

  if (totalUsers > 0) return;

  const adminPasswordHash = await bcrypt.hash('Admin@123', 10);
  const inspetorPasswordHash = await bcrypt.hash('Inspetor@123', 10);

  await prisma.user.createMany({
    data: [
      {
        nome: 'Administrador CEINSPEC',
        email: 'admin@ceinspec.local',
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
        ativo: true,
      },
      {
        nome: 'Inspetor Padrão',
        email: 'inspetor@ceinspec.local',
        passwordHash: inspetorPasswordHash,
        role: 'INSPETOR',
        ativo: true,
      },
    ],
  });

  console.log('Usuários padrão criados automaticamente.');
}

async function bootstrap() {
  try {
    await ensureDefaultUsers();

    app.listen(PORT, () => {
      console.log(`\n  CEINSPEC Isotank — Laudo Generator`);
      console.log(`  Servidor rodando em http://localhost:${PORT}\n`);
    });
  } catch (err) {
    console.error('Falha ao inicializar aplicação:', err);
    process.exit(1);
  }
}

bootstrap();
