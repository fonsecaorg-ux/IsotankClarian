'use strict';

/**
 * Smoke test: valida que o Handlebars compila, o buildContext monta
 * tudo corretamente, e o HTML final contém os placeholders substituídos.
 * NÃO requer Chromium instalado.
 */

const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const QRCode = require('qrcode');

const TEMPLATE_PATH = path.join(__dirname, '..', 'src', 'templates', 'laudo.html');
const LOGO_PATH = path.join(__dirname, '..', 'src', 'templates', 'assets', 'logo-ceinspec.png');

(async () => {
  console.log('═══ SMOKE TEST — Template PDF ═══\n');

  // 1) Compilar template
  console.log('[1] Compilando template Handlebars...');
  const src = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const tpl = Handlebars.compile(src);
  console.log('    ✅ compilou (size:', src.length, 'chars)');

  // 2) Gerar QR code fake
  const qr = await QRCode.toDataURL('http://localhost:3000/laudos/abc123/validar', { width: 200 });

  // 3) Mock data com valores reais do exemplo SUTU258026-0
  const logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
  const fakePhoto = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]).toString('base64'); // JPEG magic bytes only, só pra validar data URL
  const fakeSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]).toString('base64'); // PNG magic bytes

  const ctx = {
    logo_base64: logoBase64,
    numero_identificacao: 'SUTU 258026-0',
    cliente: 'CLARIANT BRASIL LTDA',
    endereco: 'Av. Jorge Bei Maluf, 2163 - Jardim Lazzareschi, Suzano – SP',
    tipo_equipamento: 'ISOTANK',
    data_inspecao: '17 de Março de 2026',
    fabricante: 'CIMC',
    numero_serie: 'NCTE18T 15447',
    pais_fabricacao: 'CHINA',
    tamanho: '20FT',
    capacidade_liquida: '25000 L',
    ano_fabricacao: '2018',
    identificacao: 'SUTU',
    tara: '3760 kg',
    peso_carga_liquida: '32240 kg',
    peso_bruto_total: '36000 kg',
    peso_empilhamento: '192000 Kg',
    norma_fabricacao: 'ASME SECT. VIII DIV. 1(NCS)',
    pressao_projeto: '4 bar',
    pressao_ensaio: '6 bar',
    pressao_maxima: '4 bar',
    temperatura_projeto: '- 40°C à 150°C',
    material_calota: 'AWS316L',
    material_costado: 'AWS316L',
    espessura: '6 mm',
    conexoes_flange: '3 Pol',
    chapa_identificacao: 'APROVADO',
    cert_calibracao: 'N/A',
    cert_descontaminacao: 'N/A',
    estrutura_externa: 'APROVADO',
    corpo_tanque: 'APROVADO',
    passadicos: 'APROVADO',
    revestimento: 'APROVADO',
    isolamento_termico: 'N/A',
    escada: 'APROVADO',
    dispositivos_canto: 'APROVADO',
    ponto_aterramento: 'APROVADO',
    fixacoes: 'APROVADO',
    bercos_fixacao: 'APROVADO',
    mossas_escavacoes: 'APROVADO',
    porosidade: 'APROVADO',
    bocal_descarga: 'APROVADO',
    boca_visita: 'APROVADO',
    valvula_alivio: 'N/A',
    linha_ar: 'APROVADO',
    linha_recuperacao: 'N/A',
    acionamento_remoto: 'APROVADO',
    tomada_saida_vapor: 'APROVADO',
    sistema_carga_descarga: 'APROVADO',
    dispositivo_medicao: 'N/A',
    valvula_fundo: 'N/A',
    tomada_entrada_vapor: 'APROVADO',
    termometro_comp: 'APROVADO',
    manometro: 'N/A',
    tubulacoes: 'APROVADO',
    estrutura_visual: 'APROVADO',
    exame_visual_externo_A: true,
    exame_visual_interno_NA: true,
    estanqueidade_NA: true,
    sistema_descarga_exame_NA: true,
    valvulas_conexoes_exame_NA: true,
    fotos: [
      { field: 'foto_frontal', label: 'FRONTAL', labelUpper: 'FRONTAL', dataUrl: `data:image/jpeg;base64,${fakePhoto}` },
      { field: 'foto_traseira', label: 'TRASEIRA', labelUpper: 'TRASEIRA', dataUrl: `data:image/jpeg;base64,${fakePhoto}` },
      { field: 'foto_lateral1', label: 'LATERAL', labelUpper: 'LATERAL', dataUrl: null },
      { field: 'foto_lateral2', label: 'LATERAL', labelUpper: 'LATERAL', dataUrl: `data:image/jpeg;base64,${fakePhoto}` },
      { field: 'foto_superior', label: 'SUPERIOR', labelUpper: 'SUPERIOR', dataUrl: `data:image/jpeg;base64,${fakePhoto}` },
      { field: 'foto_termometro', label: 'TERMÔMETRO', labelUpper: 'TERMÔMETRO', dataUrl: `data:image/jpeg;base64,${fakePhoto}` },
      { field: 'foto_tampa_boca_visita', label: 'TAMPA BOCA DE VISITA', labelUpper: 'TAMPA BOCA DE VISITA', dataUrl: `data:image/jpeg;base64,${fakePhoto}` },
      { field: 'foto_valvula_alivio', label: 'VÁLVULA DE ALÍVIO', labelUpper: 'VÁLVULA DE ALÍVIO', dataUrl: `data:image/jpeg;base64,${fakePhoto}` },
      { field: 'foto_valvula_descarga', label: 'VÁLVULA INFERIOR DE DESCARGA', labelUpper: 'VÁLVULA INFERIOR DE DESCARGA', dataUrl: `data:image/jpeg;base64,${fakePhoto}` },
      { field: 'foto_placa_identificacao', label: 'PLACA DE IDENTIFICAÇÃO', labelUpper: 'PLACA DE IDENTIFICAÇÃO', dataUrl: `data:image/jpeg;base64,${fakePhoto}` },
    ],
    assinatura_inspetor: `data:image/png;base64,${fakeSignature}`,
    assinatura_engenheiro: `data:image/png;base64,${fakeSignature}`,
    encarregado_nome: 'Diego Fonseca',
    engenheiro_nome: 'Diego Aparecido de Lima',
    crea_info: 'Engenheiro Mecânico – CREA:506.927.6941-S',
    cidade_data: 'Cubatão, 17 de Março de 2026',
    qr_code: qr,
    laudo_id_curto: 'ABC12345',
  };

  console.log('[2] Renderizando HTML...');
  const html = tpl(ctx);
  console.log('    ✅ renderizado (size:', html.length, 'chars)');

  // Salvar pra inspeção manual
  const outPath = path.join(__dirname, '..', 'output', 'smoke_test.html');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  console.log('    → salvo em:', outPath);

  // 4) Checagens
  console.log('\n[3] Validações:');
  const checks = [
    ['Número identificação no HTML', html.includes('SUTU 258026-0')],
    ['Cliente no HTML', html.includes('CLARIANT BRASIL LTDA')],
    ['Logo base64 embedded', html.includes('data:image/png;base64,' + logoBase64.slice(0, 50))],
    ['Data formatada no header (footer template é separado)', html.includes('17 de Março de 2026')],
    ['Marca d\'água CSS presente', html.includes('content: "CEINSPEC"')],
    ['QR Code presente', html.includes('data:image/png;base64,') && html.includes('ABC12345')],
    ['Assinatura inspetor (Diego Fonseca)', html.includes('Diego Fonseca')],
    ['Engenheiro (Diego Aparecido de Lima)', html.includes('Diego Aparecido de Lima')],
    ['Tabela dados técnicos renderizou fabricante', html.includes('CIMC')],
    ['Temperatura com caracteres especiais', html.includes('- 40°C à 150°C')],
    ['Exame externo marcado A', /Exame Visual Externo.*?A(?!\p{L})/us.test(html)],
    ['Exame interno marcado NA', /Exame Visual Interno[\s\S]*?NA/.test(html)],
    ['10 fotos no grid', (html.match(/class="foto-cell"/g) || []).length === 10],
    ['Placeholder "Foto não disponível" aparece (1x — lateral1)', (html.match(/Foto não disponível/g) || []).length === 1],
    ['Nenhum {{...}} não resolvido', !/\{\{[^}]+\}\}/.test(html)],
  ];

  let fails = 0;
  for (const [label, ok] of checks) {
    console.log(`    ${ok ? '✅' : '❌'} ${label}`);
    if (!ok) fails++;
  }

  if (fails > 0) {
    console.log(`\n❌ ${fails} check(s) falharam. Inspecionar ${outPath}`);
    process.exit(1);
  } else {
    console.log('\n✅ Todos os checks passaram!');
    console.log('\nPróximo passo: rodar `node scripts/test-pdf.js` (precisa Chromium instalado)');
  }
})().catch((e) => {
  console.error('❌ Erro no smoke test:', e);
  process.exit(1);
});
