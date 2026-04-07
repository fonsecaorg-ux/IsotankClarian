/**
 * Teste rápido do endpoint POST /generate
 * Envia dados de formulário sem fotos e verifica se o .docx é devolvido.
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const boundary = '----TestBoundary' + Date.now();

function field(name, value) {
  return [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${name}"`,
    '',
    value,
  ].join('\r\n') + '\r\n';
}

const formFields = {
  numero_identificacao:   'TEST 000001-0',
  cliente:                'EMPRESA TESTE LTDA',
  endereco:               'Rua Teste, 100, Santos SP',
  data_inspecao:          '2026-04-05',
  fabricante:             'CIMC',
  numero_serie:           'TEST0001',
  pais_fabricacao:        'CHINA',
  tamanho:                '20FT',
  capacidade_liquida:     '25000 L',
  ano_fabricacao:         '2022',
  tara:                   '3760 kg',
  peso_carga_liquida:     '30000 kg',
  peso_bruto_total:       '36000 kg',
  peso_empilhamento:      '192000 Kg',
  norma_fabricacao:       'ASME SECT. VIII DIV. 1(NCS)',
  pressao_projeto:        '4 bar',
  pressao_ensaio:         '6 bar',
  pressao_maxima:         '4 bar',
  temperatura_projeto:    '-40°C à 150°C',
  material_calota:        'AWS316L',
  material_costado:       'AWS316L',
  espessura:              '6 mm',
  conexoes_flange:        '3 Pol',
  chapa_identificacao:    'APROVADO',
  cert_calibracao:        'N/A',
  cert_descontaminacao:   'N/A',
  estrutura_externa:      'APROVADO',
  corpo_tanque:           'APROVADO',
  passadicos:             'APROVADO',
  revestimento:           'APROVADO',
  isolamento_termico:     'N/A',
  escada:                 'APROVADO',
  dispositivos_canto:     'APROVADO',
  ponto_aterramento:      'APROVADO',
  fixacoes:               'APROVADO',
  bercos_fixacao:         'APROVADO',
  mossas_escavacoes:      'APROVADO',
  porosidade:             'APROVADO',
  bocal_descarga:         'APROVADO',
  boca_visita:            'APROVADO',
  valvula_alivio:         'N/A',
  linha_ar:               'APROVADO',
  linha_recuperacao:      'N/A',
  acionamento_remoto:     'APROVADO',
  tomada_saida_vapor:     'APROVADO',
  sistema_carga_descarga: 'APROVADO',
  dispositivo_medicao:    'N/A',
  valvula_fundo:          'N/A',
  tomada_entrada_vapor:   'APROVADO',
  termometro_comp:        'APROVADO',
  manometro:              'N/A',
  tubulacoes:             'APROVADO',
  estrutura_visual:       'APROVADO',
  exame_visual_externo:   'A',
  exame_visual_interno:   'NA',
  estanqueidade:          'NA',
  sistema_descarga_exame: 'NA',
  valvulas_conexoes_exame:'NA',
  conclusao:              'Equipamento em condições adequadas para transporte.',
  recomendacao:           'Recomenda-se vistoria periódica conforme normas vigentes.',
};

let body = '';
for (const [k, v] of Object.entries(formFields)) body += field(k, v);
body += `--${boundary}--\r\n`;

const bodyBuffer = Buffer.from(body, 'utf8');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/generate',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': bodyBuffer.length,
  },
};

const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  console.log('Content-Disposition:', res.headers['content-disposition']);

  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    if (res.statusCode === 200) {
      const outFile = path.join(__dirname, '..', 'output', 'test_output.docx');
      fs.writeFileSync(outFile, buf);
      console.log(`\n✅ Laudo gerado com sucesso: ${outFile}`);
      console.log(`   Tamanho: ${buf.length} bytes`);
    } else {
      console.error('❌ Erro:', buf.toString());
    }
  });
});

req.on('error', (e) => console.error('Erro de conexão:', e.message));
req.write(bodyBuffer);
req.end();
