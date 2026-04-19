'use strict';

/**
 * pdfGenerator.js
 * ───────────────────────────────────────────────────────────────────────────
 * Serviço alternativo de geração de laudo via HTML → PDF (Puppeteer).
 * Roda em paralelo ao fluxo .docx existente, sem interferir nele.
 *
 * Dependências NPM (instalar com `npm install`):
 *   - puppeteer     (traz Chromium bundled, para desenvolvimento local)
 *   - handlebars    (templating HTML)
 *   - qrcode        (gerador QR em data URL)
 *
 * Para deploy em ambiente com Chromium pré-instalado (Render/Railway/on-prem):
 *   substituir `puppeteer` por `puppeteer-core` + `@sparticuz/chromium`.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
const QRCode = require('qrcode');
const prisma = require('../lib/prisma');

// ─── Cache em memória ─────────────────────────────────────────────────────
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'laudo.html');
const LOGO_PATH = path.join(__dirname, '..', 'templates', 'assets', 'logo-ceinspec.png');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

const TEMPLATE_SOURCE = fs.readFileSync(TEMPLATE_PATH, 'utf8');
const TEMPLATE_COMPILED = Handlebars.compile(TEMPLATE_SOURCE);
const LOGO_BASE64 = fs.readFileSync(LOGO_PATH).toString('base64');

// ─── Utilitários ──────────────────────────────────────────────────────────

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatDatePt(isoOrDate) {
  if (!isoOrDate) return '';
  const s = String(isoOrDate);
  // Aceita "YYYY-MM-DD" ou Date ISO completo.
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return s;
  const [, y, m, d] = match;
  return `${parseInt(d, 10)} de ${MESES[parseInt(m, 10) - 1]} de ${y}`;
}

function bufferToDataUrl(buf, mimeType) {
  if (!buf || !buf.length) return null;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const mt = mimeType || 'image/jpeg';
  return `data:${mt};base64,${b.toString('base64')}`;
}

/**
 * Gera QR Code apontando para a URL de validação do laudo.
 * Retorna data URL (PNG) ou null em caso de erro.
 */
async function generateQrCode(laudoId, baseUrl) {
  try {
    const validationUrl = `${baseUrl}/laudos/${laudoId}/validar`;
    return await QRCode.toDataURL(validationUrl, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
  } catch (err) {
    console.error('[PDF] Falha ao gerar QR Code:', err.message);
    return null;
  }
}

/**
 * Lê configuração da empresa (engenheiro, CREA, etc.).
 */
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
 * Normaliza o valor de um campo "Aprovado/Reprovado/NA" para o formato
 * usado pelo template (flags booleanas *_A, *_R, *_NA).
 * No DB os campos são "APROVADO" | "REPROVADO" | "N/A".
 */
function expandStatusFlags(value) {
  const v = String(value || '').trim().toUpperCase();
  return {
    A: v === 'A' || v === 'APROVADO',
    R: v === 'R' || v === 'REPROVADO',
    NA: v === 'NA' || v === 'N/A' || v === 'NÃO APLICÁVEL',
  };
}

/**
 * Monta o contexto completo para o Handlebars a partir do Laudo do DB.
 */
async function buildContext(laudo, fotos, cfg, options = {}) {
  const formData = laudo.formData || {};
  const dataPt = formatDatePt(formData.data_inspecao || laudo.dataInspecao);

  // Expandir os 5 exames em flags booleanas
  const examFlags = {};
  for (const campo of ['exame_visual_externo', 'exame_visual_interno', 'estanqueidade',
                       'sistema_descarga_exame', 'valvulas_conexoes_exame']) {
    const flags = expandStatusFlags(formData[campo]);
    examFlags[`${campo}_A`] = flags.A;
    examFlags[`${campo}_R`] = flags.R;
    examFlags[`${campo}_NA`] = flags.NA;
  }

  // Mapa field→label das 10 fotos, mesma ordem do template original
  const PHOTO_ORDER = [
    { field: 'foto_frontal', label: 'FRONTAL' },
    { field: 'foto_traseira', label: 'TRASEIRA' },
    { field: 'foto_lateral1', label: 'LATERAL' },
    { field: 'foto_lateral2', label: 'LATERAL' },
    { field: 'foto_superior', label: 'SUPERIOR' },
    { field: 'foto_termometro', label: 'TERMÔMETRO' },
    { field: 'foto_tampa_boca_visita', label: 'TAMPA BOCA DE VISITA' },
    { field: 'foto_valvula_alivio', label: 'VÁLVULA DE ALÍVIO' },
    { field: 'foto_valvula_descarga', label: 'VÁLVULA INFERIOR DE DESCARGA' },
    { field: 'foto_placa_identificacao', label: 'PLACA DE IDENTIFICAÇÃO' },
  ];

  // Montar array de fotos no formato que o template espera
  const fotosContexto = PHOTO_ORDER.map(({ field, label }) => {
    const f = fotos.find((x) => x.campo === field);
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
      field,
      label,
      labelUpper: label,
      dataUrl: bufferToDataUrl(buf, mt),
    };
  });

  // Assinaturas: inspetor (createdBy) + engenheiro (fallback por email)
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
        userEng.assinatura,
        userEng.assinaturaMimeType || 'image/png'
      );
    }
  } catch (err) {
    console.error('[PDF] Falha ao buscar assinatura do engenheiro:', err.message);
  }

  // QR Code de validação
  const baseUrl = options.baseUrl || process.env.APP_BASE_URL || 'https://isotank.ceinspec.com.br';
  const qrCode = await generateQrCode(laudo.id, baseUrl);

  // Encarregado: prioriza nome de quem criou o laudo sobre o config.json
  const encarregadoNome = laudo.createdBy?.nome || cfg.encarregado;

  return {
    // Logo
    logo_base64: LOGO_BASE64,

    // Identificação
    numero_identificacao: formData.numero_identificacao || '',
    cliente: formData.cliente || '',
    endereco: formData.endereco || '',
    tipo_equipamento: formData.tipo_equipamento || 'ISOTANK',
    data_inspecao: dataPt,

    // Dados técnicos (todos os campos do formData passam direto)
    fabricante: formData.fabricante || '',
    numero_serie: formData.numero_serie || '',
    pais_fabricacao: formData.pais_fabricacao || '',
    tamanho: formData.tamanho || '',
    capacidade_liquida: formData.capacidade_liquida || '',
    ano_fabricacao: formData.ano_fabricacao || '',
    identificacao: (formData.numero_identificacao || '').split(' ')[0] || '',
    tara: formData.tara || '',
    peso_carga_liquida: formData.peso_carga_liquida || '',
    peso_bruto_total: formData.peso_bruto_total || '',
    peso_empilhamento: formData.peso_empilhamento || '',
    norma_fabricacao: formData.norma_fabricacao || '',
    pressao_projeto: formData.pressao_projeto || '',
    pressao_ensaio: formData.pressao_ensaio || '',
    pressao_maxima: formData.pressao_maxima || '',
    temperatura_projeto: formData.temperatura_projeto || '',
    material_calota: formData.material_calota || '',
    material_costado: formData.material_costado || '',
    espessura: formData.espessura || '',
    conexoes_flange: formData.conexoes_flange || '',
    chapa_identificacao: formData.chapa_identificacao || '',
    cert_calibracao: formData.cert_calibracao || '',
    cert_descontaminacao: formData.cert_descontaminacao || '',

    // Estrutura externa
    estrutura_externa: formData.estrutura_externa || '',
    corpo_tanque: formData.corpo_tanque || '',
    passadicos: formData.passadicos || '',
    revestimento: formData.revestimento || '',
    isolamento_termico: formData.isolamento_termico || '',
    escada: formData.escada || '',
    dispositivos_canto: formData.dispositivos_canto || '',
    ponto_aterramento: formData.ponto_aterramento || '',
    fixacoes: formData.fixacoes || '',
    bercos_fixacao: formData.bercos_fixacao || '',
    mossas_escavacoes: formData.mossas_escavacoes || '',
    porosidade: formData.porosidade || '',

    // Componentes e acessórios
    bocal_descarga: formData.bocal_descarga || '',
    boca_visita: formData.boca_visita || '',
    valvula_alivio: formData.valvula_alivio || '',
    linha_ar: formData.linha_ar || '',
    linha_recuperacao: formData.linha_recuperacao || '',
    acionamento_remoto: formData.acionamento_remoto || '',
    tomada_saida_vapor: formData.tomada_saida_vapor || '',
    sistema_carga_descarga: formData.sistema_carga_descarga || '',
    dispositivo_medicao: formData.dispositivo_medicao || '',
    valvula_fundo: formData.valvula_fundo || '',
    tomada_entrada_vapor: formData.tomada_entrada_vapor || '',
    termometro_comp: formData.termometro_comp || '',
    manometro: formData.manometro || '',
    tubulacoes: formData.tubulacoes || '',
    estrutura_visual: formData.estrutura_visual || '',

    // Flags de exames (A/R/NA booleanos)
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

    // QR Code
    qr_code: qrCode,
    laudo_id_curto: laudo.id.slice(-8).toUpperCase(),
  };
}

// ─── Pool de browser (reutilização entre requests) ────────────────────────
let browserInstance = null;

async function getBrowser() {
  if (browserInstance && browserInstance.connected !== false) {
    try {
      // Testa se ainda está vivo
      const pages = await browserInstance.pages();
      if (pages) return browserInstance;
    } catch {
      browserInstance = null;
    }
  }

  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  return browserInstance;
}

async function closeBrowser() {
  if (browserInstance) {
    try { await browserInstance.close(); } catch {}
    browserInstance = null;
  }
}

// Fechar browser ao encerrar o processo
process.on('SIGTERM', closeBrowser);
process.on('SIGINT', closeBrowser);

// ─── API principal ────────────────────────────────────────────────────────

/**
 * Gera o PDF de um laudo a partir do seu ID.
 *
 * @param {string} laudoId - ID do laudo no banco
 * @param {object} options - Opções opcionais: { baseUrl }
 * @returns {Promise<Buffer>} Buffer binário do PDF
 */
async function generatePdf(laudoId, options = {}) {
  const t0 = Date.now();

  // 1) Buscar o laudo com o inspetor que criou (para a assinatura)
  const laudo = await prisma.laudo.findUnique({
    where: { id: String(laudoId) },
    include: {
      createdBy: {
        select: {
          id: true,
          nome: true,
          assinatura: true,
          assinaturaMimeType: true,
        },
      },
    },
  });
  if (!laudo) {
    throw new Error(`Laudo ${laudoId} não encontrado`);
  }

  // 2) Buscar fotos separadamente (podem ser muitas, evitar overfetch)
  const fotos = await prisma.fotoLaudo.findMany({
    where: { laudoId: laudo.id },
  });

  // 3) Montar contexto do template
  const cfg = loadConfig();
  const context = await buildContext(laudo, fotos, cfg, options);

  // 4) Renderizar HTML
  const html = TEMPLATE_COMPILED(context);

  // 5) Gerar PDF via Puppeteer
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="width: 100%; font-family: 'Times New Roman', serif; font-size: 9pt;
                    padding: 3mm 15mm 0 15mm; display: flex; align-items: center;
                    border-bottom: 0.5pt solid #999;">
          <div style="flex: 0 0 28mm;">
            <img src="data:image/png;base64,${LOGO_BASE64}"
                 style="width: 25mm; height: auto;" />
          </div>
          <div style="flex: 1; text-align: center; font-size: 12pt;">
            RELATÓRIO DE INSPEÇÃO VISUAL
          </div>
          <div style="flex: 0 0 28mm; background: #D9D9D9; padding: 1.5mm 3mm;
                      font-size: 8pt; text-align: center;">
            <div style="font-weight: bold; font-size: 7pt;">NÚMERO</div>
            <div>L-CEI-IVC-09</div>
            <div style="font-weight: bold; font-size: 7pt;">Data</div>
            <div>${context.data_inspecao || ''}</div>
          </div>
        </div>
      `,
      footerTemplate: `
        <div style="width: 100%; font-family: 'Times New Roman', serif; font-size: 8pt;
                    padding: 0 15mm; display: flex; align-items: center; color: #333;">
          <div style="flex: 0 0 25mm;">
            <img src="data:image/png;base64,${LOGO_BASE64}"
                 style="width: 22mm; height: auto;" />
          </div>
          <div style="flex: 1; text-align: center; font-size: 7pt;">
            CEINSPEC INSPEÇÕES VEICULARES E INDUSTRIAIS LTDA<br>
            CNPJ: 48.758.755/0004-29, Rua Claudino Domingues Graça, 831, Zona Industrial – Cubatão / SP
          </div>
          <div style="flex: 0 0 25mm; text-align: right; font-size: 8pt;">
            Página <span class="pageNumber"></span> de <span class="totalPages"></span>
          </div>
        </div>
      `,
      margin: {
        top: '28mm',
        bottom: '22mm',
        left: '15mm',
        right: '15mm',
      },
      // A primeira página (capa) herda a margem mas não o header/footer
      // porque o template usa @page :first { margin: 0 }
    });

    const elapsed = Date.now() - t0;
    console.log(`[PDF] Gerado ${pdfBuffer.length} bytes em ${elapsed}ms (laudoId=${laudoId})`);
    return pdfBuffer;
  } finally {
    await page.close();
  }
}

module.exports = {
  generatePdf,
  closeBrowser,
  // Exportados para testes
  _internals: {
    buildContext,
    formatDatePt,
    bufferToDataUrl,
    loadConfig,
  },
};
