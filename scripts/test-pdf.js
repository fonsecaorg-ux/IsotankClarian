'use strict';

/**
 * test-pdf.js
 * ───────────────────────────────────────────────────────────────────────────
 * Script de teste standalone do gerador de PDF.
 * Não precisa subir o servidor — roda direto no DB.
 *
 * Uso:
 *   node scripts/test-pdf.js                  → usa último laudo criado
 *   node scripts/test-pdf.js <laudoId>        → usa laudo específico
 *
 * Saída:
 *   output/test_output.pdf
 */

const fs = require('fs');
const path = require('path');

// Garantir que o cwd seja a raiz do projeto
process.chdir(path.join(__dirname, '..'));

const prisma = require('../src/lib/prisma');
const { generatePdf, closeBrowser } = require('../src/services/pdfGenerator');

async function main() {
  const argId = process.argv[2];
  let laudoId = argId;

  if (!laudoId) {
    console.log('Nenhum ID informado. Buscando o laudo mais recente...');
    const laudos = await prisma.laudo.findMany({
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { id: true, numeroIdentificacao: true, createdAt: true },
    });
    if (laudos.length === 0) {
      console.error('❌ Nenhum laudo encontrado no banco.');
      process.exit(1);
    }
    laudoId = laudos[0].id;
    console.log(
      `→ Usando laudo: ${laudoId} (${laudos[0].numeroIdentificacao || 's/ número'}, criado em ${laudos[0].createdAt.toISOString()})`
    );
  }

  console.log(`\n[TEST] Gerando PDF para laudo ${laudoId}...`);
  const t0 = Date.now();

  try {
    const pdfBuffer = await generatePdf(laudoId, {
      baseUrl: 'http://localhost:3000',
    });
    const elapsed = Date.now() - t0;
    console.log(`[TEST] PDF gerado em ${elapsed}ms (${pdfBuffer.length} bytes)`);

    // Salvar em output/
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'test_output.pdf');
    fs.writeFileSync(outputPath, pdfBuffer);

    console.log(`\n✅ PDF salvo em: ${outputPath}`);
    console.log(`   Tamanho: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
    console.log(`\n   Abra com:  xdg-open "${outputPath}"  (Linux)`);
    console.log(`             start "${outputPath}"       (Windows)`);
    console.log(`             open "${outputPath}"        (macOS)`);
  } catch (err) {
    console.error('\n❌ Erro ao gerar PDF:', err);
    process.exit(1);
  } finally {
    await closeBrowser();
    await prisma.$disconnect();
  }
}

main();
