/**
 * prepare-template.js
 * Gera template/template.docx a partir do laudo exemplo,
 * substituindo valores reais por tags {tag} do docxtemplater.
 * Execute UMA VEZ antes de iniciar o servidor: node scripts/prepare-template.js
 *
 * Placeholders de foto (400×300, #CCCCCC) são gerados com pngjs (JS puro);
 * em máquinas x64, sharp também serve, mas não há binário win32-arm64.
 */

const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = path.join(__dirname, '..', 'LAUDO ESTRUTURAL_ISOTANK_SUTU258026-0.docx');
const DEST = path.join(__dirname, '..', 'template', 'template.docx');

const content = fs.readFileSync(SRC, 'binary');
const zip = new PizZip(content);
let xml = zip.file('word/document.xml').asText();

// ─── 1. Normalizar: remover atributos rsid que fragmentam os runs ─────────────
xml = xml.replace(/ w:rsidR="[^"]*"/g, '');
xml = xml.replace(/ w:rsidRPr="[^"]*"/g, '');
xml = xml.replace(/ w:rsidTr="[^"]*"/g, '');
xml = xml.replace(/ w14:paraId="[^"]*"/g, '');
xml = xml.replace(/ w14:textId="[^"]*"/g, '');
xml = xml.replace(/ w:rsidDel="[^"]*"/g, '');

// ─── helpers ─────────────────────────────────────────────────────────────────
function getCellText(cellContent) {
  const texts = [];
  cellContent.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (m, t) => texts.push(t));
  return texts.join('').trim();
}

function buildReplacedCell(cellContent, newText) {
  const tcPrMatch = cellContent.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  const tcPr = tcPrMatch ? tcPrMatch[0] : '';
  const pPrMatch = cellContent.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0] : '';
  const rPrMatch = cellContent.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[0] : '';
  return `<w:tc>${tcPr}<w:p>${pPr}<w:r>${rPr}<w:t>${newText}</w:t></w:r></w:p></w:tc>`;
}

// ─── 2. Substituições em células únicas (texto único no doc) ─────────────────
const uniqueReplacements = [
  ['SUTU 258026-0',                                  '{numero_identificacao}'],
  ['CLARIANT BRASIL LTDA',                           '{cliente}'],
  ['Av. Jorge Bei Maluf, 2163 - Jardim Lazzareschi, Suzano \u2013 SP', '{endereco}'],
  ['17/03/2026',                                     '{data_inspecao}'],
  ['CIMC',                                           '{fabricante}'],
  ['NCTE18T 15447',                                  '{numero_serie}'],
  ['CHINA',                                          '{pais_fabricacao}'],
  ['20FT',                                           '{tamanho}'],
  ['25000 L',                                        '{capacidade_liquida}'],
  ['2018',                                           '{ano_fabricacao}'],
  ['SUTU',                                           '{identificacao}'],
  ['3760 kg',                                        '{tara}'],
  ['32240 kg',                                       '{peso_carga_liquida}'],
  ['36000 kg',                                       '{peso_bruto_total}'],
  ['192000 Kg',                                      '{peso_empilhamento}'],
  ['ASME SECT. VIII DIV. 1(NCS)',                    '{norma_fabricacao}'],
  ['6 bar',                                          '{pressao_ensaio}'],
  ['- 40\u00b0C \u00e0 150\u00b0C',                '{temperatura_projeto}'],
  ['6 mm',                                           '{espessura}'],
  ['3 Pol',                                          '{conexoes_flange}'],
];

// Substituições com múltiplas ocorrências (ordem no XML importa)
// Formato: [targetText, [...tagsEmOrdem]]
const multiReplacements = {
  '4 bar': ['{pressao_projeto}', '{pressao_maxima}'],
  'AWS316L': ['{material_calota}', '{material_costado}'],
  // Exames (header A/NA/R/OBS ficam; só os valores de exame são substituídos)
  'A':  [null, '{exame_visual_externo}'],          // 1ª ocorrência = header (null = manter)
  'NA': [null, '{exame_visual_interno}', '{estanqueidade}', '{sistema_descarga_exame}', '{valvulas_conexoes_exame}'],
  // Aprovados e N/As nos dados técnicos / estrutura / componentes
  'APROVADO': [
    '{chapa_identificacao}',    // 1
    '{estrutura_externa}',      // 2
    '{corpo_tanque}',           // 3
    '{passadicos}',             // 4
    '{revestimento}',           // 5
    '{escada}',                 // 6
    '{dispositivos_canto}',     // 7
    '{ponto_aterramento}',      // 8
    '{fixacoes}',               // 9
    '{bercos_fixacao}',         // 10
    '{mossas_escavacoes}',      // 11
    '{porosidade}',             // 12
    '{bocal_descarga}',         // 13
    '{boca_visita}',            // 14
    '{linha_ar}',               // 15
    '{acionamento_remoto}',     // 16
    '{tomada_saida_vapor}',     // 17
    '{sistema_carga_descarga}', // 18
    '{tomada_entrada_vapor}',   // 19
    '{termometro_comp}',        // 20
    '{tubulacoes}',             // 21
    '{estrutura_visual}',       // 22
  ],
  'N/A': [
    '{cert_calibracao}',        // 1
    '{cert_descontaminacao}',   // 2
    '{isolamento_termico}',     // 3
    '{valvula_alivio}',         // 4
    '{linha_recuperacao}',      // 5
    '{dispositivo_medicao}',    // 6
    '{valvula_fundo}',          // 7
    '{manometro}',              // 8
  ],
};

// Contadores de ocorrência por texto
const counters = {};

xml = xml.replace(/<w:tc>([\s\S]*?)<\/w:tc>/g, (match, cellContent) => {
  const fullText = getCellText(cellContent);
  if (!fullText) return match;

  // Tenta substituição única
  for (const [src, tag] of uniqueReplacements) {
    if (fullText === src) {
      return buildReplacedCell(cellContent, tag);
    }
  }

  // Tenta substituição múltipla
  if (multiReplacements[fullText] !== undefined) {
    const tags = multiReplacements[fullText];
    counters[fullText] = (counters[fullText] || 0) + 1;
    const idx = counters[fullText] - 1;
    if (idx < tags.length && tags[idx] !== null) {
      return buildReplacedCell(cellContent, tags[idx]);
    }
    // null = manter célula original (ex: cabeçalho da tabela de exames)
    return match;
  }

  return match;
});

// ─── 3b. Substituições em parágrafos livres (fora de células) ─────────────────
function replaceParagraphContaining(xmlStr, searchText, newTag) {
  // Regex para parágrafo (com ou sem atributos na tag <w:p>)
  return xmlStr.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (match) => {
    const texts = [];
    match.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (m, t) => texts.push(t));
    const full = texts.join('').trim();
    if (!full.includes(searchText)) return match;

    const pPrMatch = match.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
    const pPr = pPrMatch ? pPrMatch[0] : '';
    const rPrMatch = match.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : '';
    return `<w:p>${pPr}<w:r>${rPr}<w:t>${newTag}</w:t></w:r></w:p>`;
  });
}

// Conclusão (primeiro parágrafo da seção)
xml = replaceParagraphContaining(xml, 'A inspe\u00e7\u00e3o visual externa realizada', '{conclusao}');
// Segundo parágrafo da conclusão (ressalva sobre CIV/CIPP)
xml = replaceParagraphContaining(xml, 'Ressalta-se, contudo', '');

// Recomendação
xml = replaceParagraphContaining(xml, 'A presente inspe\u00e7\u00e3o possui car\u00e1ter exclusivamente visual', '{recomendacao}');
xml = replaceParagraphContaining(xml, 'Recomenda-se que o equipamento', '');

// Assinaturas e data de emissão são tratadas diretamente no server.js,
// pois mesclam valores fixos de config com a data da inspeção.

// ─── 3c. Rodapé: remover run com desenho "Imagem 12" (elemento corrompido) ─────
xml = xml.replace(
  /<w:r(?:\s[^>]*)?>[\s\S]*?<wp:docPr[^>]*\bname="Imagem 12"[\s\S]*?<\/w:r>/g,
  ''
);

// ─── 4. Salvar template ───────────────────────────────────────────────────────
(function writeTemplate() {
  const png = new PNG({ width: 400, height: 300, colorType: 2 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = 204;
      png.data[idx + 1] = 204;
      png.data[idx + 2] = 204;
      png.data[idx + 3] = 255;
    }
  }
  const placeholderPng = PNG.sync.write(png);

  zip.file('word/document.xml', xml);
  for (let i = 1; i <= 10; i += 1) {
    zip.file(`word/media/image${i}.png`, placeholderPng);
  }

  const outDir = path.dirname(DEST);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(DEST, buffer);
  console.log('Template gerado com sucesso:', DEST);
})();
