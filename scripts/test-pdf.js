'use strict';

/**
 * test-pdf.js — v2
 * Gera PDF de um laudo real do banco e salva em output/test_output.pdf.
 * Imprime o hash SHA-256 no final pra confirmar persistência.
 *
 * Uso:
 *   node scripts/test-pdf.js              → usa laudo mais recente
 *   node scripts/test-pdf.js <laudoId>    → laudo específico
 */

const fs = require('fs');
const path = require('path');

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
    const { buffer, hash } = await generatePdf(laudoId, {
      baseUrl: 'http://localhost:3000',
    });
    const elapsed = Date.now() - t0;
    console.log(`[TEST] PDF gerado em ${elapsed}ms (${buffer.length} bytes)`);
    console.log(`[TEST] SHA-256: ${hash}`);

    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'test_output.pdf');
    fs.writeFileSync(outputPath, buffer);

    console.log(`\n✅ PDF salvo em: ${outputPath}`);
    console.log(`   Tamanho: ${(buffer.length / 1024).toFixed(1)} KB`);

    // Confirmação de persistência
    const check = await prisma.laudo.findUnique({
      where: { id: laudoId },
      select: { pdfHash: true },
    });
    if (check?.pdfHash === hash) {
      console.log(`   ✓ Hash persistido em Laudo.pdfHash (confere com o arquivo)`);
    } else if (check?.pdfHash) {
      console.warn(`   ⚠ Hash no banco (${check.pdfHash.slice(0, 12)}…) difere do arquivo (${hash.slice(0, 12)}…)`);
    } else {
      console.warn(`   ⚠ Hash NÃO persistido no banco — migration aplicada?`);
      console.warn(`   Rode: npx prisma migrate dev`);
    }

    console.log(`\n   Abrir:  xdg-open "${outputPath}"   (Linux)`);
    console.log(`           start "${outputPath}"        (Windows)`);
    console.log(`           open "${outputPath}"         (macOS)`);
  } catch (err) {
    console.error('\n❌ Erro ao gerar PDF:', err);
    process.exit(1);
  } finally {
    await closeBrowser();
    await prisma.$disconnect();
  }
}

main();
