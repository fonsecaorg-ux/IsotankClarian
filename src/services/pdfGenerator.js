'use strict';

/**
 * pdfGenerator.js — v2 (layout moderno + hash SHA-256)
 * ───────────────────────────────────────────────────────────────────────────
 * Gera PDF do laudo usando Puppeteer + Handlebars.
 * Calcula hash SHA-256 do PDF gerado e persiste em Laudo.pdfHash.
 *
 * Layout: capa moderna com status colorido, cards de dados técnicos,
 * chips numerados nas fotos, bloco de validação com QR + hash.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Puppeteer: em dev (local) usa o bundled Chromium via `puppeteer` completo;
// em produção (Render/serverless) usa `puppeteer-core` + `@sparticuz/chromium`,
// que é um Chromium enxuto (~50MB) otimizado para ambientes constrangidos.
//
// Detecção: se `@sparticuz/chromium` estiver instalado E a env USE_SPARTICUZ
// for truthy (ou NODE_ENV=production), usa esse caminho. Caso contrário,
// cai no puppeteer bundled.
const useSparticuz = process.env.USE_SPARTICUZ === 'true'
  || process.env.NODE_ENV === 'production'
  || !!process.env.RENDER;  // Render injeta RENDER=true automaticamente

let puppeteer;
let sparticuzChromium = null;

if (useSparticuz) {
  try {
    puppeteer = require('puppeteer-core');
    sparticuzChromium = require('@sparticuz/chromium');
    console.log('[PDF] Usando puppeteer-core + @sparticuz/chromium (produção)');
  } catch (err) {
    console.warn('[PDF] @sparticuz/chromium não instalado, caindo no puppeteer bundled:', err.message);
    puppeteer = require('puppeteer');
  }
} else {
  puppeteer = require('puppeteer');
  console.log('[PDF] Usando puppeteer bundled (desenvolvimento)');
}
const Handlebars = require('handlebars');
const QRCode = require('qrcode');
const prisma = require('../lib/prisma');

// ─── Cache em memória ────────────────────────────────────────────────────
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'laudo.html');
const LOGO_PATH = path.join(__dirname, '..', 'templates', 'assets', 'logo-ceinspec.png');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

const TEMPLATE_SOURCE = fs.readFileSync(TEMPLATE_PATH, 'utf8');
const TEMPLATE_COMPILED = Handlebars.compile(TEMPLATE_SOURCE);
const LOGO_BASE64 = fs.readFileSync(LOGO_PATH).toString('base64');

// ─── Utilidades ──────────────────────────────────────────────────────────

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatDatePt(isoOrDate) {
  if (!isoOrDate) return '';
  const s = String(isoOrDate);
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return s;
  const [, y, m, d] = match;
  return `${parseInt(d, 10)} de ${MESES[parseInt(m, 10) - 1]} de ${y}`;
}

function bufferToDataUrl(buf, mimeType) {
  if (!buf || !buf.length) return null;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return `data:${mimeType || 'image/jpeg'};base64,${b.toString('base64')}`;
}

async function generateQrCode(url) {
  try {
    return await QRCode.toDataURL(url, { width: 200, margin: 1, errorCorrectionLevel: 'M' });
  } catch (err) {
    console.error('[PDF] Falha ao gerar QR Code:', err.message);
    return null;
  }
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error('[PDF] Falha ao ler config.json:', err.message);
    return {
      encarregado: 'Elton Vieira',
      engenheiro: 'Diego Aparecido de Lima',
      crea_info: 'Engenheiro Mecânico – CREA:506.927.6941-S',
      cidade: 'Cubatão',
    };
  }
}

/**
 * Renderiza um status com classe CSS embutida. Retorna HTML porque vai ser
 * inserido com triple-stache {{{...}}} no template.
 * Valores aceitos: "APROVADO", "REPROVADO", "N/A", "" ou qualquer outro.
 */
function renderStatus(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'APROVADO' || v === 'A') {
    return '<span class="lista-status-valor approved">✓ Aprovado</span>';
  }
  if (v === 'REPROVADO' || v === 'R') {
    return '<span class="lista-status-valor rejected">✗ Reprovado</span>';
  }
  if (v === 'N/A' || v === 'NA' || v === 'NÃO APLICÁVEL') {
    return '<span class="lista-status-valor na">— N/A</span>';
  }
  if (!v) return '<span class="lista-status-valor na">—</span>';
  // Fallback para valores livres
  return `<span class="lista-status-valor">${v}</span>`;
}

function expandExamFlags(value) {
  const v = String(value || '').trim().toUpperCase();
  return {
    A: v === 'A' || v === 'APROVADO',
    R: v === 'R' || v === 'REPROVADO',
    NA: v === 'NA' || v === 'N/A' || v === 'NÃO APLICÁVEL',
  };
}

/**
 * Monta um resumo curto do equipamento pra capa.
 * Ex: "Isotank — CIMC, 2018 (China) · 25.000 L · 20FT"
 */
function buildEquipamentoResumo(formData) {
  const partes = [];
  const tipo = formData.tipo_equipamento || 'Isotank';
  const fab = formData.fabricante;
  const ano = formData.ano_fabricacao;
  const pais = formData.pais_fabricacao;
  let linha1 = tipo;
  if (fab) {
    linha1 += ` — ${fab}`;
    if (ano) linha1 += `, ${ano}`;
    if (pais) linha1 += ` (${pais})`;
  }
  partes.push(linha1);
  if (formData.capacidade_liquida) partes.push(formData.capacidade_liquida);
  if (formData.tamanho) partes.push(formData.tamanho);
  return partes.join(' · ');
}

/**
 * Decide status do laudo (APROVADO / REPROVADO) a partir dos exames.
 * Se nenhum exame estiver marcado como reprovado, considera APROVADO.
 */
function computeLaudoStatus(formData) {
  const examCampos = [
    'exame_visual_externo', 'exame_visual_interno', 'estanqueidade',
    'sistema_descarga_exame', 'valvulas_conexoes_exame',
  ];
  for (const c of examCampos) {
    const v = String(formData[c] || '').trim().toUpperCase();
    if (v === 'R' || v === 'REPROVADO') {
      return { label: 'REPROVADO', chipClass: 'chip-rejected', parecerClass: 'rejected' };
    }
  }
  return { label: 'APROVADO', chipClass: 'chip-approved', parecerClass: '' };
}

async function buildContext(laudo, fotos, cfg, options = {}) {
  const formData = laudo.formData || {};
  const dataPt = formatDatePt(formData.data_inspecao || laudo.dataInspecao);

  // Flags dos exames (para a tabela A/R/NA)
  const examFlags = {};
  for (const campo of ['exame_visual_externo', 'exame_visual_interno', 'estanqueidade',
                       'sistema_descarga_exame', 'valvulas_conexoes_exame']) {
    const flags = expandExamFlags(formData[campo]);
    examFlags[`${campo}_A`] = flags.A;
    examFlags[`${campo}_R`] = flags.R;
    examFlags[`${campo}_NA`] = flags.NA;
  }

  // Fotos em ordem fixa, numeradas 01..10
  const PHOTO_ORDER = [
    { field: 'foto_frontal', label: 'FRONTAL' },
    { field: 'foto_traseira', label: 'TRASEIRA' },
    { field: 'foto_lateral1', label: 'LATERAL DIR.' },
    { field: 'foto_lateral2', label: 'LATERAL ESQ.' },
    { field: 'foto_superior', label: 'SUPERIOR' },
    { field: 'foto_termometro', label: 'TERMÔMETRO' },
    { field: 'foto_tampa_boca_visita', label: 'TAMPA B. VISITA' },
    { field: 'foto_valvula_alivio', label: 'VÁLV. ALÍVIO' },
    { field: 'foto_valvula_descarga', label: 'DESCARGA INF.' },
    { field: 'foto_placa_identificacao', label: 'PLACA ID.' },
  ];
  const fotosContexto = PHOTO_ORDER.map((item, i) => {
    const f = fotos.find((x) => x.campo === item.field);
    let buf = null;
    let mt = 'image/jpeg';
    if (f) {
      if (f.dados && f.dados.length > 0) {
        buf = Buffer.isBuffer(f.dados) ? f.dados : Buffer.from(f.dados);
      } else if (f.caminhoArquivo && fs.existsSync(f.caminhoArquivo)) {
        buf = fs.readFileSync(f.caminhoArquivo);
      }
      mt = f.mimeType || 'image/jpeg';
    }
    return {
      numero: String(i + 1).padStart(2, '0'),
      label: item.label,
      dataUrl: bufferToDataUrl(buf, mt),
    };
  });

  // Assinaturas ------------------------------------------------------------
  let assinaturaInspetor = null;
  if (laudo.createdBy?.assinatura) {
    assinaturaInspetor = bufferToDataUrl(
      laudo.createdBy.assinatura,
      laudo.createdBy.assinaturaMimeType || 'image/png'
    );
  }
  let assinaturaEngenheiro = null;
  const engenheiroEmail = String(
    process.env.ENGENHEIRO_EMAIL || 'diego.fonseca@grupocesari.com.br'
  ).trim().toLowerCase();
  try {
    const userEng = await prisma.user.findUnique({
      where: { email: engenheiroEmail },
      select: { assinatura: true, assinaturaMimeType: true },
    });
    if (userEng?.assinatura) {
      assinaturaEngenheiro = bufferToDataUrl(
        userEng.assinatura, userEng.assinaturaMimeType || 'image/png'
      );
    }
  } catch (err) {
    console.error('[PDF] Falha ao buscar assinatura do engenheiro:', err.message);
  }

  // QR Code + URL de validação --------------------------------------------
  const baseUrl = options.baseUrl
    || process.env.APP_BASE_URL
    || 'https://isotank.ceinspec.com.br';
  const validacaoUrl = `${baseUrl}/laudos/${laudo.id}/validar`;
  const qrCode = await generateQrCode(validacaoUrl);

  // Status derivado dos exames --------------------------------------------
  const statusInfo = computeLaudoStatus(formData);

  // Nome do inspetor (quem criou > config.json)
  const encarregadoNome = laudo.createdBy?.nome || cfg.encarregado;

  // Helpers renderStatus para cada campo de checklist ---------------------
  const statusCampos = [
    'chapa_identificacao', 'cert_calibracao', 'cert_descontaminacao',
    'estrutura_externa', 'corpo_tanque', 'passadicos', 'revestimento',
    'isolamento_termico', 'escada', 'dispositivos_canto', 'ponto_aterramento',
    'fixacoes', 'bercos_fixacao', 'mossas_escavacoes', 'porosidade',
    'bocal_descarga', 'boca_visita', 'valvula_alivio', 'linha_ar',
    'linha_recuperacao', 'acionamento_remoto', 'tomada_saida_vapor',
    'sistema_carga_descarga', 'dispositivo_medicao', 'valvula_fundo',
    'tomada_entrada_vapor', 'termometro_comp', 'manometro', 'tubulacoes',
    'estrutura_visual',
  ];
  const statusHelpers = {};
  for (const c of statusCampos) {
    statusHelpers[`status_${c}`] = renderStatus(formData[c]);
  }

  return {
    // Logo
    logo_base64: LOGO_BASE64,

    // Identificação
    numero_identificacao: formData.numero_identificacao || '',
    cliente: formData.cliente || '',
    endereco: formData.endereco || '',
    tipo_equipamento: formData.tipo_equipamento || 'ISOTANK',
    data_inspecao: dataPt,
    equipamento_resumo: buildEquipamentoResumo(formData),

    // Status da capa + parecer
    status_label: statusInfo.label,
    status_class: statusInfo.chipClass,
    parecer_class: statusInfo.parecerClass,

    // Dados técnicos (valores diretos)
    fabricante: formData.fabricante || '',
    numero_serie: formData.numero_serie || '—',
    pais_fabricacao: formData.pais_fabricacao || '',
    tamanho: formData.tamanho || '',
    capacidade_liquida: formData.capacidade_liquida || '',
    ano_fabricacao: formData.ano_fabricacao || '',
    tara: formData.tara || '—',
    peso_carga_liquida: formData.peso_carga_liquida || '—',
    peso_bruto_total: formData.peso_bruto_total || '—',
    peso_empilhamento: formData.peso_empilhamento || '—',
    norma_fabricacao: formData.norma_fabricacao || '—',
    pressao_projeto: formData.pressao_projeto || '—',
    pressao_ensaio: formData.pressao_ensaio || '—',
    pressao_maxima: formData.pressao_maxima || '—',
    temperatura_projeto: formData.temperatura_projeto || '—',
    material_calota: formData.material_calota || '—',
    material_costado: formData.material_costado || '—',
    espessura: formData.espessura || '—',
    conexoes_flange: formData.conexoes_flange || '—',

    // Status dos checklists (HTML pré-renderizado)
    ...statusHelpers,

    // Flags dos exames (A/R/NA)
    ...examFlags,

    // Fotos
    fotos: fotosContexto,

    // Assinaturas
    assinatura_inspetor: assinaturaInspetor,
    assinatura_engenheiro: assinaturaEngenheiro,
    encarregado_nome: encarregadoNome,
    engenheiro_nome: cfg.engenheiro,
    crea_info: cfg.crea_info,
    cidade_data: `${cfg.cidade}, ${dataPt}`,

    // Validação
    qr_code: qrCode,
    validacao_url: validacaoUrl.replace(/^https?:\/\//, ''),
    laudo_id_curto: laudo.id.slice(-8).toUpperCase(),

    // Hash: populado em 2 etapas — primeiro render com placeholder, depois
    // calculado no buffer e injetado no contexto. Ver generatePdf abaixo.
    hash_curto: options.hashCurto || '—',
    hash_completo: options.hashCompleto || '',
  };
}

// ─── Pool do browser ──────────────────────────────────────────────────────
let browserInstance = null;

async function getBrowser() {
  if (browserInstance) {
    try { await browserInstance.pages(); return browserInstance; } catch {
      browserInstance = null;
    }
  }

  const launchOpts = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };

  if (sparticuzChromium) {
    // Produção: @sparticuz/chromium provê o executável + args otimizados.
    launchOpts.args = [...sparticuzChromium.args, ...launchOpts.args];
    launchOpts.defaultViewport = sparticuzChromium.defaultViewport;
    launchOpts.executablePath = await sparticuzChromium.executablePath();
    launchOpts.headless = sparticuzChromium.headless;
  }

  browserInstance = await puppeteer.launch(launchOpts);
  return browserInstance;
}

async function closeBrowser() {
  if (browserInstance) {
    try { await browserInstance.close(); } catch {}
    browserInstance = null;
  }
}

process.on('SIGTERM', closeBrowser);
process.on('SIGINT', closeBrowser);

// ─── Renderização ─────────────────────────────────────────────────────────

async function renderToBuffer(context) {
  const html = TEMPLATE_COMPILED(context);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="width: 100%; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
                    font-size: 8pt; padding: 3mm 15mm 2mm 15mm;
                    display: flex; justify-content: space-between; align-items: center;
                    border-bottom: 0.5px solid #e0e0e0; color: #666;">
          <div style="display: flex; align-items: center; gap: 6mm;">
            <img src="data:image/png;base64,${LOGO_BASE64}" style="width: 22mm; height: auto;" />
            <span style="font-family: ui-monospace, monospace; font-size: 8pt; color: #aaa;">L-CEI-IVC-09</span>
          </div>
          <div style="font-size: 9pt;">
            <span style="font-family: ui-monospace, monospace;">${context.numero_identificacao}</span>
          </div>
          <div style="font-size: 8pt; color: #aaa;">
            Pág. <span class="pageNumber"></span> de <span class="totalPages"></span>
          </div>
        </div>
      `,
      footerTemplate: `
        <div style="width: 100%; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
                    font-size: 7pt; padding: 2mm 15mm 3mm 15mm;
                    display: flex; justify-content: space-between; color: #bbb;
                    border-top: 0.5px solid #eee;">
          <div>CEINSPEC · CNPJ 48.758.755/0004-29 · OIA/PP 1064</div>
          <div style="font-family: ui-monospace, monospace;">ID ${context.laudo_id_curto}</div>
        </div>
      `,
      margin: { top: '22mm', bottom: '16mm', left: '15mm', right: '15mm' },
    });
    return pdf;
  } finally {
    await page.close();
  }
}

// ─── API pública ──────────────────────────────────────────────────────────

/**
 * Gera o PDF de um laudo a partir do seu ID.
 *
 * Fluxo:
 *   1. Monta contexto sem hash (placeholder "—").
 *   2. Renderiza um PDF preliminar pra calcular SHA-256 do conteúdo.
 *   3. Re-renderiza com o hash real embutido no contexto.
 *   4. Persiste hash em Laudo.pdfHash.
 *   5. Retorna buffer final.
 *
 * O double-render é barato (~500ms cada após warm-up) e garante que o hash
 * impresso no PDF seja O HASH DO PRÓPRIO PDF (o ID curto e o hash longo
 * ficam consistentes para validação externa posterior).
 *
 * @param {string} laudoId
 * @param {object} options - { baseUrl, persistHash: boolean }
 * @returns {Promise<{ buffer: Buffer, hash: string }>}
 */
async function generatePdf(laudoId, options = {}) {
  const t0 = Date.now();
  const persistHash = options.persistHash !== false;

  // 1) Carrega laudo + fotos
  const laudo = await prisma.laudo.findUnique({
    where: { id: String(laudoId) },
    include: {
      createdBy: {
        select: { id: true, nome: true, assinatura: true, assinaturaMimeType: true },
      },
    },
  });
  if (!laudo) throw new Error(`Laudo ${laudoId} não encontrado`);

  const fotos = await prisma.fotoLaudo.findMany({ where: { laudoId: laudo.id } });
  const cfg = loadConfig();

  // 2) Contexto sem hash (placeholders)
  const baseContext = await buildContext(laudo, fotos, cfg, options);

  // 3) Render preliminar pro hash
  const preliminary = await renderToBuffer(baseContext);
  const hash = crypto.createHash('sha256').update(preliminary).digest('hex');
  const hashCurto = hash.slice(0, 4) + '…' + hash.slice(-4);

  // 4) Re-render com hash dentro do contexto
  const finalContext = {
    ...baseContext,
    hash_curto: hashCurto,
    hash_completo: hash,
  };
  const finalBuffer = await renderToBuffer(finalContext);
  // Recalcula o hash final (agora inclui os próprios bytes do hash impresso)
  const finalHash = crypto.createHash('sha256').update(finalBuffer).digest('hex');

  // 5) Persiste hash no banco
  if (persistHash) {
    try {
      await prisma.laudo.update({
        where: { id: laudo.id },
        data: { pdfHash: finalHash, generatedAt: new Date() },
      });
    } catch (err) {
      // Se o campo pdfHash ainda não existe (migration não rodou), falha silenciosa.
      console.warn('[PDF] Não persisti pdfHash (migration pendente?):', err.message);
    }
  }

  const elapsed = Date.now() - t0;
  console.log(`[PDF] Gerado ${finalBuffer.length} bytes em ${elapsed}ms (laudoId=${laudoId}, hash=${finalHash.slice(0, 12)}…)`);

  return { buffer: finalBuffer, hash: finalHash };
}

module.exports = {
  generatePdf,
  closeBrowser,
  _internals: {
    buildContext,
    formatDatePt,
    bufferToDataUrl,
    loadConfig,
    renderStatus,
    computeLaudoStatus,
  },
};
