const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, '../template/template.docx');
if (!fs.existsSync(templatePath)) {
  console.error('ERRO: não existe', templatePath);
  console.error('Gere com: node scripts/prepare-template.js (origem: LAUDO ESTRUTURAL_ISOTANK_SUTU258026-0.docx)');
  process.exit(1);
}

const content = fs.readFileSync(templatePath, 'binary');
const zip = new PizZip(content);

// Extract all {tags} from the template
const xml = zip.file('word/document.xml').asText();
const tags = [...new Set((xml.match(/\{[a-z0-9_]+\}/gi) || []))].sort();
console.log('Tags encontradas no template:', tags);
console.log('Total:', tags.length);

const hasDiego = xml.includes('Diego Aparecido de Lima');
const hasCrea = xml.includes('CREA:506.927.6941-S');
const hasEngMec = xml.includes('Engenheiro Mecânico');
console.log('Marcadores pós-processamento (server.js): Diego:', hasDiego, '| CREA:', hasCrea, '| Eng. Mecânico:', hasEngMec);
if (!hasDiego || !hasCrea) {
  console.warn('AVISO: template pode estar desatualizado — prepare-template.js não foi aplicado ao exemplo.');
}

// Try to fill with dummy data to test docxtemplater
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

const testData = {};
tags.forEach(t => {
  testData[t.replace(/[{}]/g, '')] = `[${t}]`;
});

try {
  doc.render(testData);
  console.log('\nDocxtemplater: OK - template processado sem erros');
} catch (err) {
  console.error('\nErro no docxtemplater:', err.message);
  if (err.properties && err.properties.errors) {
    console.error('Detalhes:', JSON.stringify(err.properties.errors, null, 2));
  }
}
