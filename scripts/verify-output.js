const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../output/test_output.docx'), 'binary');
const zip = new PizZip(content);
const xml = zip.file('word/document.xml').asText();

// Check for unfilled tags (should be none)
const remaining = xml.match(/\{[a-z_]+\}/g) || [];
if (remaining.length > 0) {
  console.log('❌ Tags não substituídas:', [...new Set(remaining)]);
} else {
  console.log('✅ Todas as tags foram substituídas');
}

// Build joined-run text (how Word actually renders the document)
const allRunTexts = [];
xml.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (m, t) => allRunTexts.push(t));
const fullDocText = allRunTexts.join('');

// Check key values were inserted
const checks = [
  ['TEST 000001-0', 'numero_identificacao'],
  ['EMPRESA TESTE LTDA', 'cliente'],
  ['5 de Abril de 2026', 'data_inspecao'],
  ['Equipamento em condições adequadas', 'conclusao'],
  ['Elton Vieira', 'encarregado'],
  ['Diego Aparecido de Lima', 'engenheiro'],
];

let allOk = true;
for (const [val, field] of checks) {
  // Check both raw XML and joined run text (handles split-run values)
  if (xml.includes(val) || fullDocText.includes(val)) {
    console.log(`✅ ${field}: "${val}"`);
  } else {
    console.log(`❌ ${field}: "${val}" NÃO encontrado`);
    allOk = false;
  }
}

if (allOk) console.log('\n✅ Laudo gerado corretamente!');
