# Atualização para o Laudo v2 (layout moderno + hash SHA-256)

Esta atualização **substitui 6 arquivos existentes** e **adiciona 2 novos** —
tudo dentro do spike PDF já aplicado. Zero mudanças no `server.js` ou no
fluxo `.docx`.

## Arquivos no pacote

```
src/templates/laudo.html                 (SUBSTITUI — layout completamente novo)
src/services/pdfGenerator.js             (SUBSTITUI — hash + novo contexto)
src/routes/laudos-pdf.js                 (SUBSTITUI — consumo do { buffer, hash })
src/routes/laudos-validar.js             (SUBSTITUI — hash visível + instruções)
scripts/smoke-pdf.js                     (SUBSTITUI — 24 checks do layout novo)
scripts/test-pdf.js                      (SUBSTITUI — mostra hash persistido)
prisma/migrations/20260419220000_add_laudo_pdf_hash/migration.sql  (NOVO)
```

## Passos de aplicação

### 1. Sobrescrever os 6 arquivos

Extrair o zip na raiz do projeto (por cima dos existentes). São todos
substituições diretas.

### 2. Atualizar `prisma/schema.prisma`

Adicionar **uma linha** no model `Laudo` — campo `pdfHash`:

```prisma
model Laudo {
  // ... campos existentes ...
  generatedFileName String?
  generatedAt       DateTime?
  pdfHash           String?       // ← ADICIONAR ESTA LINHA
  createdAt         DateTime    @default(now())
  // ...
}
```

Recomendado: adicionar logo após `generatedAt` como no trecho acima.

### 3. Aplicar a migration

```bash
npx prisma migrate deploy          # produção (Render)
# OU
npx prisma migrate dev             # desenvolvimento local
```

A migration (`20260419220000_add_laudo_pdf_hash`) já está no pacote.
Roda automaticamente com os comandos acima.

### 4. Regenerar o client Prisma

```bash
npx prisma generate
```

### 5. Validar com smoke test (não precisa Chromium)

```bash
node scripts/smoke-pdf.js
```

Esperado: **24/24 checks ✅**.

### 6. Testar com PDF real

```bash
node scripts/test-pdf.js
```

Gera `output/test_output.pdf` com laudo mais recente do banco e imprime:

```
[PDF] SHA-256: <hash completo 64 chars>
✓ Hash persistido em Laudo.pdfHash (confere com o arquivo)
```

Abra o PDF e confira visualmente:

- [ ] Capa com nome do equipamento em monospace grande
- [ ] Chip verde "APROVADO" + chip cinza "EXAME VISUAL EXTERNO"
- [ ] Grid 2×2 de metadados (cliente, data, local, inspetor)
- [ ] QR code no rodapé da capa + hash curto
- [ ] Seção 2 com cards agrupados (fabricante, série, dimensões)
- [ ] Tabelas quad para pesos, pressões, materiais
- [ ] Listas "✓ Aprovado" em verde e "— N/A" em cinza
- [ ] 10 fotos com chip numerado sobreposto (01 · FRONTAL, etc.)
- [ ] Parecer técnico em bloco verde
- [ ] Assinaturas com imagens
- [ ] Bloco de validação final com QR + hash SHA-256 completo

### 7. Testar a página pública de validação

No navegador:

```
http://localhost:3000/laudos/<ID>/validar
```

Esperado: card verde "Laudo válido" com hash SHA-256 + instruções
(`shasum -a 256` para Linux/Mac, `Get-FileHash` para Windows).

## O que NÃO precisa mexer

- `server.js` — nenhuma mudança
- `package.json` — nenhuma dep nova (tudo já instalado no spike anterior)
- `public/*` — nenhuma mudança no frontend
- Rotas `.docx` — continuam funcionando em paralelo

## Principais decisões técnicas

### Double-render pra hash consistente

O PDF é renderizado duas vezes: primeiro com `hash: "—"` pra calcular o
SHA-256, depois com o hash real impresso dentro. O hash final (persistido
e retornado) é o do **segundo render**, que inclui seus próprios bytes
representando o hash impresso. Isso garante que quem baixar o PDF possa
calcular o SHA-256 localmente e bater com o hash mostrado na página de
validação.

Custo: ~+500ms por geração (depois do warm-up do Puppeteer). Aceitável
pra laudos que já levam ~2s no primeiro request.

### Status derivado dos exames

O chip APROVADO/REPROVADO da capa é **calculado** a partir dos 5 campos
de exame (`exame_visual_externo`, `exame_visual_interno`, etc.). Se qualquer
um estiver marcado como `R`/`REPROVADO`, a capa mostra chip vermelho e
bloco de parecer em vermelho. Do contrário, verde.

Isso é mais robusto que depender de um campo separado "status do laudo"
que poderia ficar fora de sincronia com os exames.

### Hash no banco vs no PDF

Armazenar o hash no `Laudo.pdfHash` permite:
- Página pública mostrar o hash esperado sem precisar do arquivo
- Detecção posterior de regeneração (se hash mudar, laudo foi regerado)
- Auditoria: saber qual versão do PDF foi emitida em qual data

Limitação: se o PDF for regenerado (ex: alguém edita o formData e refaz),
o hash antigo é perdido. Se precisar de histórico de versões, adicionar
tabela `LaudoHistorico` — fora do escopo desta entrega.

## Rollback

Se algo der errado, reverter é simples:

```bash
git checkout HEAD -- src/templates/laudo.html src/services/pdfGenerator.js \
                     src/routes/laudos-pdf.js src/routes/laudos-validar.js \
                     scripts/smoke-pdf.js scripts/test-pdf.js
```

A coluna `pdfHash` no banco pode ficar (é opcional e não afeta nada
que não a use).
