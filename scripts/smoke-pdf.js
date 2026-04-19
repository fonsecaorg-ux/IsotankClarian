'use strict';

/**
 * Smoke test v2 — valida template novo (layout moderno + hash).
 * Não precisa de Chromium nem banco. Roda o Handlebars isolado.
 */

const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const QRCode = require('qrcode');

const TEMPLATE_PATH = path.join(__dirname, '..', 'src', 'templates', 'laudo.html');

(async () => {
  console.log('═══ SMOKE TEST v2 — Template PDF novo ═══\n');

  console.log('[1] Compilando template Handlebars...');
  const src = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const tpl = Handlebars.compile(src);
  console.log('    ✅ compilou (size:', src.length, 'chars)');

  const qr = await QRCode.toDataURL('http://localhost:3000/laudos/abc123/validar', { width: 200 });

  const jpegMagic = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64');
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');

  const hashFake = '4e7b9f2a1c8d6e3b0f9a2c91d4b7e8f6a3c5d2b1e9f7a4c8b6d3e1f5a9c2b0d7';

  const ctx = {
    numero_identificacao: 'SUTU 258026-0',
    cliente: 'CLARIANT BRASIL LTDA',
    endereco: 'Av. Jorge Bei Maluf, 2163 — Jardim Lazzareschi, Suzano/SP',
    tipo_equipamento: 'ISOTANK',
    data_inspecao: '17 de Março de 2026',
    equipamento_resumo: 'Isotank — CIMC, 2018 (China) · 25.000 L · 20FT',
    status_label: 'APROVADO',
    status_class: 'chip-approved',
    parecer_class: '',
    fabricante: 'CIMC',
    numero_serie: 'NCTE18T 15447',
    pais_fabricacao: 'China',
    tamanho: '20FT',
    capacidade_liquida: '25.000 L',
    ano_fabricacao: '2018',
    tara: '3.760 kg',
    peso_carga_liquida: '32.240 kg',
    peso_bruto_total: '36.000 kg',
    peso_empilhamento: '192.000 kg',
    norma_fabricacao: 'ASME Sect. VIII Div. 1 (NCS)',
    pressao_projeto: '4 bar',
    pressao_ensaio: '6 bar',
    pressao_maxima: '4 bar',
    temperatura_projeto: '-40 a 150°C',
    material_calota: 'AWS316L',
    material_costado: 'AWS316L',
    espessura: '6 mm',
    conexoes_flange: '3 pol',
    status_chapa_identificacao: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_cert_calibracao: '<span class="lista-status-valor na">— N/A</span>',
    status_cert_descontaminacao: '<span class="lista-status-valor na">— N/A</span>',
    status_estrutura_externa: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_corpo_tanque: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_passadicos: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_revestimento: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_isolamento_termico: '<span class="lista-status-valor na">— N/A</span>',
    status_escada: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_dispositivos_canto: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_ponto_aterramento: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_fixacoes: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_bercos_fixacao: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_mossas_escavacoes: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_porosidade: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_bocal_descarga: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_boca_visita: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_valvula_alivio: '<span class="lista-status-valor na">— N/A</span>',
    status_linha_ar: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_linha_recuperacao: '<span class="lista-status-valor na">— N/A</span>',
    status_acionamento_remoto: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_tomada_saida_vapor: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_sistema_carga_descarga: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_dispositivo_medicao: '<span class="lista-status-valor na">— N/A</span>',
    status_valvula_fundo: '<span class="lista-status-valor na">— N/A</span>',
    status_tomada_entrada_vapor: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_termometro_comp: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_manometro: '<span class="lista-status-valor na">— N/A</span>',
    status_tubulacoes: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    status_estrutura_visual: '<span class="lista-status-valor approved">✓ Aprovado</span>',
    exame_visual_externo_A: true,
    exame_visual_interno_NA: true,
    estanqueidade_NA: true,
    sistema_descarga_exame_NA: true,
    valvulas_conexoes_exame_NA: true,
    fotos: [
      { numero: '01', label: 'FRONTAL', dataUrl: `data:image/jpeg;base64,${jpegMagic}` },
      { numero: '02', label: 'TRASEIRA', dataUrl: `data:image/jpeg;base64,${jpegMagic}` },
      { numero: '03', label: 'LATERAL DIR.', dataUrl: null },
      { numero: '04', label: 'LATERAL ESQ.', dataUrl: `data:image/jpeg;base64,${jpegMagic}` },
      { numero: '05', label: 'SUPERIOR', dataUrl: `data:image/jpeg;base64,${jpegMagic}` },
      { numero: '06', label: 'TERMÔMETRO', dataUrl: `data:image/jpeg;base64,${jpegMagic}` },
      { numero: '07', label: 'TAMPA B. VISITA', dataUrl: `data:image/jpeg;base64,${jpegMagic}` },
      { numero: '08', label: 'VÁLV. ALÍVIO', dataUrl: `data:image/jpeg;base64,${jpegMagic}` },
      { numero: '09', label: 'DESCARGA INF.', dataUrl: `data:image/jpeg;base64,${jpegMagic}` },
      { numero: '10', label: 'PLACA ID.', dataUrl: `data:image/jpeg;base64,${jpegMagic}` },
    ],
    assinatura_inspetor: `data:image/png;base64,${pngMagic}`,
    assinatura_engenheiro: `data:image/png;base64,${pngMagic}`,
    encarregado_nome: 'Diego Fonseca',
    engenheiro_nome: 'Diego Aparecido de Lima',
    crea_info: 'CREA-SP 506.927.6941-S',
    cidade_data: 'Cubatão, 17 de Março de 2026',
    qr_code: qr,
    validacao_url: 'localhost:3000/laudos/abc123/validar',
    laudo_id_curto: '8F3A2C91',
    hash_curto: '4e7b…c2b0',
    hash_completo: hashFake,
  };

  console.log('[2] Renderizando HTML...');
  const html = tpl(ctx);
  console.log('    ✅ renderizado (size:', html.length, 'chars)');

  const outPath = path.join(__dirname, '..', 'output', 'smoke_test.html');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  console.log('    → salvo em:', outPath);

  console.log('\n[3] Validações:');
  const checks = [
    ['Número identificação na capa',              html.includes('SUTU 258026-0')],
    ['Cliente renderizado',                       html.includes('CLARIANT BRASIL LTDA')],
    ['Equipamento resumo na capa',                html.includes('Isotank — CIMC, 2018 (China)')],
    ['Chip APROVADO na capa',                     html.includes('chip-approved') && html.includes('APROVADO')],
    ['Cards de resumo de dados técnicos',         (html.match(/class="card-resumo"/g) || []).length === 3],
    ['Tabela quad PESOS renderizou',              html.includes('3.760 kg') && html.includes('192.000 kg')],
    ['Tabela quad PRESSÕES renderizou',           html.includes('4 bar') && html.includes('-40 a 150°C')],
    ['Status "✓ Aprovado" aparece (multi)',       (html.match(/✓ Aprovado/g) || []).length > 10],
    ['Status "— N/A" aparece (multi)',            (html.match(/— N\/A/g) || []).length >= 3],
    ['Tabela exames — A marcado no externo',     /Exame visual externo[\s\S]{0,800}class="valor a">A</.test(html)],
    ['Tabela exames — NA no interno',             /Exame visual interno[\s\S]{0,800}class="valor na">NA</.test(html)],
    ['10 fotos com chips numerados',              (html.match(/class="foto-chip"/g) || []).length === 10],
    ['Chip numerado "01 · FRONTAL"',              html.includes('01 · FRONTAL')],
    ['Chip numerado "10 · PLACA ID."',            html.includes('10 · PLACA ID.')],
    ['Placeholder "Foto não disponível" (1×)',   (html.match(/Foto não disponível/g) || []).length === 1],
    ['Parecer técnico APROVADO (bloco verde)',   html.includes('PARECER TÉCNICO · APROVADO')],
    ['Assinatura inspetor (Diego Fonseca)',       html.includes('Diego Fonseca')],
    ['Assinatura engenheiro',                     html.includes('Diego Aparecido de Lima')],
    ['Bloco validação com URL',                   html.includes('validacao-bloco') && html.includes('localhost:3000/laudos/abc123/validar')],
    ['Hash SHA-256 visível na validação',         html.includes(hashFake)],
    ['Hash curto no rodapé da capa',              html.includes('4e7b…c2b0')],
    ['ID curto no rodapé da capa',                html.includes('8F3A2C91')],
    ['Marca d\'água CSS presente',                html.includes('CEINSPEC · DOCUMENTO OFICIAL')],
    ['Nenhum {{...}} não resolvido',              !/\{\{[^}]+\}\}/.test(html)],
  ];

  let fails = 0;
  for (const [label, ok] of checks) {
    console.log(`    ${ok ? '✅' : '❌'} ${label}`);
    if (!ok) fails++;
  }

  if (fails > 0) {
    console.log(`\n❌ ${fails}/${checks.length} check(s) falharam.`);
    console.log(`   Inspecionar: ${outPath}`);
    process.exit(1);
  }
  console.log(`\n✅ ${checks.length}/${checks.length} checks passaram!`);
  console.log('\nPróximos passos:');
  console.log('  1. Rodar migration: npx prisma migrate dev');
  console.log('  2. Testar com DB real: node scripts/test-pdf.js');
})().catch((e) => {
  console.error('❌ Erro no smoke test:', e);
  process.exit(1);
});
