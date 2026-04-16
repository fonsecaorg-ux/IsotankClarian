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
const nodemailer = require('nodemailer');
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
const configuracoesRoutes = require('./src/routes/configuracoes');
const documentosRoutes = require('./src/routes/documentos');
const { getConfig } = require('./src/lib/config');
const { checkVencimentos } = require('./src/services/alertaVencimento');

const app = express();
app.set('trust proxy', 1);
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
const TEMPLATE_BINARY = fs.readFileSync(TEMPLATE_PATH);

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

const PHOTO_LABEL_MAP = {
  foto_frontal: 'Frontal',
  foto_traseira: 'Traseira',
  foto_lateral1: 'Lateral 1',
  foto_lateral2: 'Lateral 2',
  foto_superior: 'Superior',
  foto_termometro: 'Termômetro',
  foto_tampa_boca_visita: 'Tampa Boca de Visita',
  foto_valvula_alivio: 'Válvula de Alívio',
  foto_valvula_descarga: 'Válvula de Descarga',
  foto_placa_identificacao: 'Placa de Identificação',
};
const SIGNATURE_MEDIA_PATHS = {
  inspetor: 'word/media/assinatura_inspetor.png',
  engenheiro: 'word/media/assinatura_engenheiro.png',
};
const ENGENHEIRO_FALLBACK_EMAIL = String(process.env.ENGENHEIRO_EMAIL || 'diego.fonseca@grupocesari.com.br').trim().toLowerCase();

const STORAGE_MODE = String(process.env.STORAGE_MODE || 'database').trim().toLowerCase() === 'disk'
  ? 'disk'
  : 'database';
const STORAGE_PATH_RAW = String(process.env.STORAGE_PATH || './storage/fotos').trim() || './storage/fotos';
const STORAGE_ROOT = path.isAbsolute(STORAGE_PATH_RAW)
  ? STORAGE_PATH_RAW
  : path.join(__dirname, STORAGE_PATH_RAW);

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function indexOfClosingAngleForOpenTag(xml, openStart) {
  let gt = xml.indexOf('>', openStart);
  while (gt !== -1) {
    const slice = xml.slice(openStart, gt + 1);
    if ((((slice.match(/"/g) || []).length) % 2) === 0) return gt;
    gt = xml.indexOf('>', gt + 1);
  }
  return -1;
}

/**
 * Remove um bloco balanceado `<tagName>...</tagName>` que envolve `idx`.
 * @param {string} xml
 * @param {string} tagName ex.: 'w:drawing', 'a14:imgProps'
 * @param {number} idx
 * @returns {string|null}
 */
function removeBalancedXmlBlockContaining(xml, tagName, idx) {
  const openNeedle = `<${tagName}`;
  const start = xml.lastIndexOf(openNeedle, idx);
  if (start === -1) return null;
  const boundary = xml[start + openNeedle.length];
  if (boundary && !/[\s/>]/.test(boundary)) return null;

  const openGt = indexOfClosingAngleForOpenTag(xml, start);
  if (openGt === -1) return null;

  const closeStr = `</${tagName}>`;
  let depth = 1;
  let pos = openGt + 1;
  const openRe = new RegExp(`<${escapeRegExp(tagName)}\\b`, 'g');

  while (depth > 0 && pos < xml.length) {
    openRe.lastIndex = pos;
    const openMatch = openRe.exec(xml);
    const nextOpen = openMatch ? openMatch.index : -1;
    const nextClose = xml.indexOf(closeStr, pos);
    if (nextClose === -1) return null;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      pos = nextOpen + 1;
    } else {
      depth -= 1;
      if (depth === 0) {
        const blockEnd = nextClose + closeStr.length;
        if (idx < start || idx >= blockEnd) return null;
        return xml.slice(0, start) + xml.slice(blockEnd);
      }
      pos = nextClose + closeStr.length;
    }
  }
  return null;
}

/**
 * Retrocede a partir de `idx` até achar uma tag de abertura e remove o elemento balanceado.
 * @param {string} xml
 * @param {number} idx
 * @returns {string|null}
 */
function removeNearestXmlElementAtOrBefore(xml, idx) {
  let searchBefore = idx + 1;
  for (let tries = 0; tries < 120; tries += 1) {
    const lt = xml.lastIndexOf('<', searchBefore - 1);
    if (lt < 0) return null;

    if (xml.startsWith('</', lt) || xml.startsWith('<?', lt) || xml.startsWith('<!--', lt)) {
      searchBefore = lt;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      searchBefore = lt;
      continue;
    }

    const tagMatch = xml.slice(lt).match(/^<([\w:-]+)\b/);
    if (!tagMatch) {
      searchBefore = lt;
      continue;
    }
    const tagName = tagMatch[1];

    let gt = xml.indexOf('>', lt);
    while (gt !== -1) {
      const openSlice = xml.slice(lt, gt + 1);
      const quotes = (openSlice.match(/"/g) || []).length;
      if (quotes % 2 === 0) break;
      gt = xml.indexOf('>', gt + 1);
    }
    if (gt === -1) return null;

    const openFull = xml.slice(lt, gt + 1);
    if (/\/\s*>$/.test(openFull)) {
      // Só remove tag vazia se a referência estiver nos atributos desta tag.
      if (idx <= lt || idx > gt) {
        searchBefore = lt;
        continue;
      }
      return xml.slice(0, lt) + xml.slice(gt + 1);
    }

    const closeStr = `</${tagName}>`;
    let depth = 1;
    let pos = gt + 1;
    const openRe = new RegExp(`<${escapeRegExp(tagName)}\\b`, 'g');

    while (depth > 0 && pos < xml.length) {
      openRe.lastIndex = pos;
      const openM = openRe.exec(xml);
      const nextOpen = openM ? openM.index : -1;
      const nextClose = xml.indexOf(closeStr, pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        pos = nextOpen + 1;
      } else {
        depth -= 1;
        if (depth === 0) {
          const blockEnd = nextClose + closeStr.length;
          // Só remove se a referência (idx) estiver realmente dentro deste elemento.
          if (idx < lt || idx >= blockEnd) {
            searchBefore = lt;
            break;
          }
          return xml.slice(0, lt) + xml.slice(blockEnd);
        }
        pos = nextClose + closeStr.length;
      }
    }

    searchBefore = lt;
  }
  return null;
}

/**
 * Remove referências a relationship ids no document.xml (desenhos WDP, a14:imgProps, etc.).
 * @param {string} docXml
 * @param {string[]} removedRelationshipIds
 * @returns {string}
 */
function stripDocumentXmlForRemovedRels(docXml, removedRelationshipIds) {
  let xml = docXml;
  for (const rid of removedRelationshipIds) {
    const ridEsc = escapeRegExp(rid);
    const refRe = new RegExp(`r:(?:embed|id)="${ridEsc}"`);

    for (;;) {
      const m = xml.match(refRe);
      if (!m || m.index === undefined) break;
      const idx = m.index;

      let next = removeBalancedXmlBlockContaining(xml, 'w:drawing', idx);
      if (next) {
        xml = next;
        continue;
      }

      next = removeBalancedXmlBlockContaining(xml, 'a14:imgProps', idx);
      if (next) {
        xml = next;
        continue;
      }

      next = removeBalancedXmlBlockContaining(xml, 'a14:imgLayer', idx);
      if (next) {
        xml = next;
        continue;
      }

      next = removeNearestXmlElementAtOrBefore(xml, idx);
      if (next) {
        xml = next;
        continue;
      }

      break;
    }
  }
  return xml;
}

function sanitizeZipForWordOnline(zip) {
  const relsPath = 'word/_rels/document.xml.rels';
  const docPath = 'word/document.xml';
  const contentTypesPath = '[Content_Types].xml';

  /** @type {string[]} */
  const removedRelationshipIds = [];

  // 1) Remover relações que apontam para hdphoto / .wdp e coletar os rId afetados.
  const relsFile = zip.file(relsPath);
  if (relsFile) {
    try {
      let relsXml = relsFile.asText();
      const before = relsXml;
      relsXml = relsXml.replace(/<Relationship\s+([^/>]+)\/>/g, (full, attrs) => {
        const idMatch = attrs.match(/\bId="([^"]+)"/i);
        const targetMatch = attrs.match(/\bTarget="([^"]+)"/i);
        const id = idMatch ? idMatch[1] : '';
        const target = targetMatch ? targetMatch[1] : '';
        const lowerTarget = target.toLowerCase();
        const lowerAttrs = attrs.toLowerCase();
        const isHdPhotoRel =
          lowerAttrs.includes('hdphoto') ||
          lowerTarget.includes('hdphoto') ||
          /\.wdp$/i.test(target);
        if (isHdPhotoRel) {
          if (id) removedRelationshipIds.push(id);
          return '';
        }
        return full;
      });
      if (relsXml !== before) {
        zip.file(relsPath, relsXml);
      }
    } catch (err) {
      console.error('Falha ao sanitizar document.xml.rels para Word Online:', err.message);
    }
  }

  // Remove mídia WDP do pacote (incompatível com Word Online/SharePoint).
  try {
    zip.remove('word/media/hdphoto1.wdp');
    Object.keys(zip.files).forEach((name) => {
      if (name.startsWith('word/media/') && name.toLowerCase().endsWith('.wdp')) {
        zip.remove(name);
      }
    });
  } catch (err) {
    console.error('Falha ao remover arquivos .wdp do zip:', err.message);
  }

  // 3) Remover desenhos / blips que ainda referenciem os rId removidos (evita relação órfã).
  const docFile = zip.file(docPath);
  if (docFile && removedRelationshipIds.length) {
    try {
      const docXml = docFile.asText();
      const cleaned = stripDocumentXmlForRemovedRels(docXml, removedRelationshipIds);
      zip.file(docPath, cleaned);
    } catch (err) {
      console.error('Falha ao sanitizar word/document.xml para Word Online:', err.message);
    }
  }

  // 2) [Content_Types].xml — remover Default wdp e Overrides .wdp
  const contentTypesFile = zip.file(contentTypesPath);
  if (contentTypesFile) {
    try {
      let contentTypesXml = contentTypesFile.asText();
      const beforeCt = contentTypesXml;
      contentTypesXml = contentTypesXml.replace(
        /<Default\s+Extension="wdp"\s+ContentType="image\/vnd\.ms-photo"\s*\/>/gi,
        ''
      );
      contentTypesXml = contentTypesXml.replace(
        /<Override[^>]*PartName="[^"]*\.wdp"[^>]*\/>/gi,
        ''
      );
      if (contentTypesXml !== beforeCt) {
        zip.file(contentTypesPath, contentTypesXml);
      }
    } catch (err) {
      console.error('Falha ao sanitizar [Content_Types].xml para Word Online:', err.message);
    }
  }
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

app.post('/admin/test-email', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const smtpHost = String(await getConfig('smtp_host') || '').trim();
    const smtpPort = Number(await getConfig('smtp_port') || 587);
    const smtpUser = String(await getConfig('smtp_user') || '').trim();
    const smtpPass = String(await getConfig('smtp_pass') || '');
    const smtpFrom = String(await getConfig('smtp_from') || '').trim();
    const alertEmail = String(await getConfig('alert_email') || '').trim();

    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom || !alertEmail) {
      return res.status(400).json({
        error: 'Configurações SMTP incompletas (smtp_host, smtp_user, smtp_pass, smtp_from, alert_email).',
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: alertEmail,
      subject: '[CEINSPEC] Teste de configuração de e-mail',
      text: `Confirmação de SMTP configurado corretamente.
Data/hora: ${new Date().toLocaleString('pt-BR')}
Disparado por: ${req.user?.nome || 'Usuário não identificado'}
SMTP host: ${smtpHost}
SMTP port: ${smtpPort}
SMTP user: ${smtpUser}
Este é um e-mail automático de teste — nenhuma ação é necessária.`,
      html: `
        <div style="font-family:'Segoe UI',system-ui,sans-serif;padding:16px;background:#f3f2f1;">
          <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #edebe9;border-radius:10px;padding:16px;">
            <h2 style="margin:0 0 10px;color:#0078d4;">Teste de configuração de e-mail</h2>
            <p style="margin:0 0 12px;color:#323130;">
              Confirmação de que o SMTP está configurado corretamente.
            </p>

            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tbody>
                <tr>
                  <td style="padding:8px;border:1px solid #edebe9;background:#faf9f8;"><b>Data e hora do envio</b></td>
                  <td style="padding:8px;border:1px solid #edebe9;">${new Date().toLocaleString('pt-BR')}</td>
                </tr>
                <tr>
                  <td style="padding:8px;border:1px solid #edebe9;background:#faf9f8;"><b>Disparado por</b></td>
                  <td style="padding:8px;border:1px solid #edebe9;">${String(req.user?.nome || 'Usuário não identificado')}</td>
                </tr>
                <tr>
                  <td style="padding:8px;border:1px solid #edebe9;background:#faf9f8;"><b>SMTP Host</b></td>
                  <td style="padding:8px;border:1px solid #edebe9;">${smtpHost}</td>
                </tr>
                <tr>
                  <td style="padding:8px;border:1px solid #edebe9;background:#faf9f8;"><b>SMTP Port</b></td>
                  <td style="padding:8px;border:1px solid #edebe9;">${smtpPort}</td>
                </tr>
                <tr>
                  <td style="padding:8px;border:1px solid #edebe9;background:#faf9f8;"><b>SMTP User</b></td>
                  <td style="padding:8px;border:1px solid #edebe9;">${smtpUser}</td>
                </tr>
              </tbody>
            </table>

            <p style="margin:12px 0 0;color:#605e5c;font-size:12px;">
              Este é um e-mail automático de teste — nenhuma ação é necessária.
            </p>
          </div>
        </div>
      `,
    });

    return res.json({ ok: true, destinatario: alertEmail });
  } catch (err) {
    console.error('Erro em /admin/test-email:', err);
    return res.status(500).json({ error: err.message || 'Falha ao enviar e-mail de teste' });
  }
});

app.use('/laudos', laudosRoutes);
app.use('/admin', adminRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/equipamentos', equipamentosRoutes);
app.use('/clientes', clientesRoutes);
app.use('/auth', authRoutes);
app.use('/configuracoes', configuracoesRoutes);
app.use('/documentos', documentosRoutes);

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
    // Campos de assinatura/rodapé via docxtemplater (sem pós-processamento de XML)
    encarregado:    cfg.encarregado,
    encarregado_nome: cfg.encarregado,
    engenheiro:     cfg.engenheiro,
    engenheiro_nome: cfg.engenheiro,
    crea_info:      cfg.crea_info,
    cidade_data:    `${cfg.cidade}, ${dataPt}`,
  };
}

// ─── Rota: POST /generate ────────────────────────────────────────────────────
app.post(
  '/generate',
  authMiddleware,
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
            createdById: true,
            createdBy: {
              select: {
                id: true,
                assinatura: true,
                assinaturaMimeType: true,
              },
            },
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
      sanitizeZipForWordOnline(zip);

      // ── Injetar assinaturas (inspetor e engenheiro) com fallback seguro ────
      try {
        // Assinatura do inspetor que criou o laudo.
        const assinaturaInspetor = laudo?.createdBy?.assinatura || null;
        if (assinaturaInspetor) {
          zip.file(SIGNATURE_MEDIA_PATHS.inspetor, assinaturaInspetor);
        }

        // Assinatura do engenheiro via cfg.engenheiro_user_id ou e-mail fallback.
        let engenheiroAssinatura = null;
        const engenheiroUserId = String(cfg.engenheiro_user_id || '').trim();
        if (engenheiroUserId) {
          const userEng = await prisma.user.findUnique({
            where: { id: engenheiroUserId },
            select: {
              assinatura: true,
              assinaturaMimeType: true,
            },
          });
          engenheiroAssinatura = userEng?.assinatura || null;
        } else {
          const userEng = await prisma.user.findUnique({
            where: { email: ENGENHEIRO_FALLBACK_EMAIL },
            select: {
              assinatura: true,
              assinaturaMimeType: true,
            },
          });
          engenheiroAssinatura = userEng?.assinatura || null;
        }

        if (engenheiroAssinatura) {
          zip.file(SIGNATURE_MEDIA_PATHS.engenheiro, engenheiroAssinatura);
        }
      } catch (errAssinaturas) {
        console.error('Erro ao injetar assinaturas no laudo (não crítico):', errAssinaturas);
      }

      // ── Injetar fotos no zip (buffer em memória — sem acesso a disco) ────────
      const fotoRecords = [];
      for (const field of PHOTO_FIELDS) {
        if (files[field] && files[field][0]) {
          const file = files[field][0];
          zip.file(PHOTO_MEDIA_MAP[field], file.buffer);
          fotoRecords.push({
            campo: field,
            label: PHOTO_LABEL_MAP[field] || field,
            dados: file.buffer,
            mimeType: file.mimetype || 'image/jpeg',
            tamanho: Number(file.size || file.buffer?.length || 0),
          });
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
            status: 'AGUARDANDO_APROVACAO',
            generatedAt: new Date(),
            generatedFileName: filename,
          },
        });

        await prisma.auditLog.create({
          data: {
            action: 'STATUS_CHANGED',
            laudoId: laudo.id,
            fromStatus: laudo.status,
            toStatus: 'AGUARDANDO_APROVACAO',
            metadata: { source: 'generate' },
          },
        });
      }

      res.setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(outputBuffer);

      // Persistência de fotos no banco (não crítica).
      // Não deve quebrar o download do laudo.
      try {
        if (laudo?.id && fotoRecords.length) {
          const isDiskMode = STORAGE_MODE === 'disk';
          const laudoStorageDir = path.join(STORAGE_ROOT, laudo.id);

          await prisma.fotoLaudo.deleteMany({
            where: {
              laudoId: laudo.id,
              campo: { in: fotoRecords.map((r) => r.campo) },
            },
          });

          if (isDiskMode) {
            fs.mkdirSync(laudoStorageDir, { recursive: true });
          }

          await prisma.fotoLaudo.createMany({
            data: fotoRecords.map((r) => {
              if (isDiskMode) {
                const filePath = path.join(laudoStorageDir, `${r.campo}.jpg`);
                fs.writeFileSync(filePath, r.dados);
                return {
                  laudoId: laudo.id,
                  campo: r.campo,
                  label: r.label,
                  caminhoArquivo: filePath,
                  mimeType: r.mimeType,
                  tamanho: r.tamanho,
                  dados: null,
                };
              }

              return {
                laudoId: laudo.id,
                campo: r.campo,
                label: r.label,
                dados: r.dados,
                caminhoArquivo: null,
                mimeType: r.mimeType,
                tamanho: r.tamanho,
              };
            }),
          });
        }
      } catch (errFotos) {
        console.error('Erro ao salvar fotos do laudo (não crítico):', errFotos);
      }

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

async function ensureDefaultConfigs() {
  if (!prisma.configuracao || typeof prisma.configuracao.upsert !== 'function') {
    throw new Error(
      'Prisma Client sem o model Configuracao (client desatualizado). ' +
      'Execute `npx prisma generate` após migrations; em produção use `npm start`, que roda migrate deploy e generate antes do servidor.'
    );
  }

  const defaults = [
    { chave: 'smtp_host', valor: '', descricao: 'Servidor SMTP' },
    { chave: 'smtp_port', valor: '587', descricao: 'Porta SMTP' },
    { chave: 'smtp_user', valor: '', descricao: 'Usuário SMTP' },
    { chave: 'smtp_pass', valor: '', descricao: 'Senha SMTP' },
    { chave: 'smtp_from', valor: 'CEINSPEC <noreply@ceinspec.com.br>', descricao: 'Remetente SMTP' },
    { chave: 'alert_email', valor: '', descricao: 'E-mail para alertas de vencimento' },
    { chave: 'alert_hora', valor: '08:00', descricao: 'Horário diário para verificar alertas' },
    { chave: 'vencimento_meses', valor: '12', descricao: 'Periodicidade de vencimento em meses' },
  ];

  for (const item of defaults) {
    await prisma.configuracao.upsert({
      where: { chave: item.chave },
      update: {},
      create: item,
    });
  }
}

function parseAlertHour(value) {
  const str = String(value || '').trim();
  const match = str.match(/^(\d{2}):(\d{2})$/);
  if (!match) return { hours: 8, minutes: 0 };
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return { hours: 8, minutes: 0 };
  return { hours, minutes };
}

function msUntilNextSchedule(alertHour) {
  const now = new Date();
  const { hours, minutes } = parseAlertHour(alertHour);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function scheduleAlertChecks() {
  const runAlertCheck = async () => {
    try {
      const result = await checkVencimentos();
      const hhmm = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      console.log(`Verificação de vencimentos executada: ${hhmm}`, result);
    } catch (err) {
      console.error('Falha na verificação de vencimentos:', err.message);
    }
  };

  await runAlertCheck();

  const alertHour = await getConfig('alert_hora');
  const firstDelay = msUntilNextSchedule(alertHour);

  setTimeout(() => {
    runAlertCheck();
    setInterval(runAlertCheck, 86400000);
  }, firstDelay);
}

async function bootstrap() {
  try {
    await ensureDefaultUsers();
    await ensureDefaultConfigs();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  CEINSPEC Isotank — Laudo Generator`);
      console.log(`  Servidor rodando na porta ${PORT}\n`);

      const storageMode = process.env.STORAGE_MODE || 'database';
      const storagePath = path.resolve(process.env.STORAGE_PATH || './storage/fotos');

      console.log(`[storage] Modo: ${storageMode}`);

      if (storageMode === 'disk') {
        console.log(`[storage] Caminho: ${storagePath}`);
        try {
          fs.mkdirSync(storagePath, { recursive: true });
          fs.accessSync(storagePath, fs.constants.W_OK);
          console.log('[storage] Pasta com permissão de escrita ✓');
        } catch (err) {
          console.error('[storage] AVISO: sem permissão de escrita na pasta de fotos:', err.message);
        }
      }

      scheduleAlertChecks().catch((err) => {
        console.error('Falha ao agendar verificação de vencimentos:', err.message);
      });
    });
  } catch (err) {
    console.error('Falha ao inicializar aplicação:', err);
    process.exit(1);
  }
}

bootstrap();
