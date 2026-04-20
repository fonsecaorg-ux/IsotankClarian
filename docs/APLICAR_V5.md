# v5 — Corrigir geração de PDF no Render

## Problema

No deploy do Render, o fluxo funciona até persistir as fotos, mas trava
no Puppeteer:

```
Could not find Chrome (ver. 147.0.7727.56).
This can occur if either
 1. you did not perform an installation before running the script
 2. your cache path is incorrectly configured
```

O `puppeteer` tenta baixar o Chromium no build, mas Render não permite
isso (firewall no Google Storage + restrição de tamanho no free tier).

## Solução

Trocar `puppeteer` (bundled) por `puppeteer-core` + `@sparticuz/chromium`,
um Chromium enxuto (~50 MB vs ~300 MB) feito especificamente pra
serverless e planos constrangidos.

O código detecta automaticamente o ambiente:
- **Local/desenvolvimento**: usa `puppeteer` bundled (como hoje)
- **Produção (Render)**: usa `puppeteer-core` + `@sparticuz/chromium`

## Passos

### 1. Instalar as 2 dependências novas

```bash
npm install puppeteer-core @sparticuz/chromium
```

Isso adiciona no `package.json`. **Não remover `puppeteer`** — continua
sendo usado em desenvolvimento.

### 2. Substituir o arquivo

```
pdf-v5/src/services/pdfGenerator.js  →  src/services/pdfGenerator.js
```

### 3. Detecção de ambiente

O código agora detecta produção pelas envs (qualquer uma aciona o modo
sparticuz):

- `RENDER=true` (injetada automaticamente pelo Render)
- `NODE_ENV=production`
- `USE_SPARTICUZ=true` (override manual)

**Não precisa adicionar nada no `.env`** — `RENDER=true` já vem automática.

### 4. Smoke test local

```bash
node scripts/smoke-pdf.js
```

Deve imprimir `[PDF] Usando puppeteer bundled (desenvolvimento)` e
passar 24/24.

### 5. Deploy no Render

```bash
git add package.json package-lock.json src/services/pdfGenerator.js
git commit -m "fix(pdf): usa @sparticuz/chromium em produção (Render)"
git push
```

Aguardar o rebuild do Render.

### 6. Validar em produção

Após o deploy, repetir o teste (gerar um laudo com 10 fotos). No log
do Render você deve ver:

```
[PDF] Usando puppeteer-core + @sparticuz/chromium (produção)
[PDF-xxxxx] POST /laudos/.../pdf recebido
[PDF-xxxxx] 10 foto(s) persistida(s) no DB
[PDF] Gerado 187432 bytes em 4500ms (laudoId=..., hash=...)
```

A primeira geração em produção costuma levar ~4-5s (cold start do
Chromium descompactado). Gerações seguintes são rápidas (~800ms).

## Observação sobre tamanho do bundle

`@sparticuz/chromium` vem compactado como `chromium.br` (Brotli) e é
descompactado no `/tmp` no primeiro uso. Isso significa:

- **Download do pacote npm**: ~50 MB (cabe tranquilo no Render)
- **Descompactado em /tmp**: ~130 MB (usa uns 100 MB de RAM temporário)
- **RAM em uso**: ~200-300 MB durante geração do PDF

Free tier do Render tem 512 MB de RAM. Está no limite, mas funciona.
Se começar a dar OOM (out of memory), aí vale upgrade pra Starter ($7/mês).

## Rollback

Se der errado no Render, rollback é 1 linha:

```bash
git revert HEAD
git push
```

O código cai de volta pro `puppeteer` bundled — que não funciona no
Render, mas pelo menos não piora.

## Próximos passos (depois que funcionar)

- [ ] Diego Fonseca gera 2-3 laudos reais pra confirmar
- [ ] Apresentação Diego Lima + Wagner
- [ ] Quando aceitarem: commit removendo rota `/generate` + pasta `template/`
