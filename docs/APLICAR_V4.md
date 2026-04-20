# v4 — Logo CEINSPEC + PDF no frontend inteiro

Esta atualização traz:

1. **Logo CEINSPEC** (amarela, transparente) na capa do laudo e no cabeçalho de todas as páginas
2. **Todos os botões do frontend** que geravam `.docx` agora geram `.pdf`:
   - `admin.html` — botão "Reprocessar PDF"
   - `kanban.html` — modal de detalhe "Reprocessar PDF"
   - `equipamentos.html` — histórico "Baixar PDF"
   - `index.html` — formulário (já estava no v3, mas o snapshot do zip tinha rollback)

**Escopo intocado:** `server.js`, `package.json`, schema do banco. A rota
`POST /generate` permanece viva como legado.

## Arquivos no pacote (7)

```
src/templates/laudo.html                         (SUBSTITUI — logo na capa)
src/templates/assets/logo-ceinspec.png           (SUBSTITUI — logo amarela transparente)
src/services/pdfGenerator.js                     (SUBSTITUI — logo no header do Puppeteer)
public/index.html                                (SUBSTITUI — fetch /laudos/:id/pdf)
public/admin.html                                (SUBSTITUI — botão Reprocessar PDF)
public/kanban.html                               (SUBSTITUI — botão Reprocessar PDF)
public/equipamentos.html                         (SUBSTITUI — botão Baixar PDF)
```

## Aplicação

Extrair o zip na raiz do projeto — sobrescreve os 7 arquivos existentes.

```bash
cd "Isotank Clariant"
unzip -o /caminho/pdf-v4.zip
cp -r pdf-v4/* .
rm -rf pdf-v4/
```

## Validação

### Smoke test (não requer Chromium nem DB):

```bash
node scripts/smoke-pdf.js
```

Esperado: **24/24 ✅**

### Teste com DB real:

```bash
node scripts/test-pdf.js
```

Gera `output/test_output.pdf`. Abrir e conferir:

- [ ] Logo amarela da CEINSPEC na **capa** (canto superior esquerdo, sem borda preta)
- [ ] Logo amarela no **cabeçalho de todas as páginas internas** (menor, alinhada à esquerda)
- [ ] Tudo o que já funcionava (chips numerados, parecer, hash, QR) continua OK

### Teste HTTP ponta a ponta:

```bash
npm run dev
```

1. **Formulário** → preencher + Gerar laudo → baixa `.pdf` com logo
2. **Admin** → tabela de laudos → botão "Reprocessar PDF" → baixa `.pdf`
3. **Kanban** → abrir modal de detalhe → "Reprocessar PDF" → baixa `.pdf`
4. **Equipamentos** → histórico de inspeções → "Baixar PDF" → baixa `.pdf`

## O que NÃO foi tocado (intencional)

- `server.js` com a rota `POST /generate` (.docx) — **fica vivo** até aceite
  oficial do Diego Lima + Wagner. Quando eles aprovarem, remover do server
  em commit separado.
- `admin.html` linhas 527 e 823 — referências a `.docx` no **módulo de
  Documentos** (upload de ITs/FORMs). Correto aceitar `.docx` ali.
- Rota `POST /laudos/:id/pdf` no backend — já estava pronta desde v3.

## Rollback

Se algo der errado em campo:

```bash
git checkout HEAD -- src/templates/laudo.html src/templates/assets/logo-ceinspec.png \
                     src/services/pdfGenerator.js public/index.html public/admin.html \
                     public/kanban.html public/equipamentos.html
```

Fica tudo como antes do v4. A rota `.docx` continua no ar, então
reverter o frontend volta imediatamente ao fluxo anterior.

## Observações sobre a logo

A logo original enviada tinha **fundo preto sólido**. Foi processada com
remoção do preto (threshold anti-alias) pra ficar transparente. Se quiser
versão diferente (ex.: logo azul pra contraste forte, logo branca pra
documentos em fundo escuro), é trocar o arquivo em
`src/templates/assets/logo-ceinspec.png`.

Dimensões no PDF:
- Capa: 38mm de largura (proporção mantida)
- Header das páginas: 22mm de largura

Ajustar em `src/templates/laudo.html` (classe `.capa-logo`) e em
`src/services/pdfGenerator.js` (inline style no `headerTemplate`) se
precisar.
