const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../template/template.docx'), 'binary');
const zip = new PizZip(content);

// Extract all {tags} from the template
const xml = zip.file('word/document.xml').asText();
const tags = [...new Set((xml.match(/\{[a-z_]+\}/g) || []))].sort();
console.log('Tags encontradas no template:', tags);
console.log('Total:', tags.length);

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
