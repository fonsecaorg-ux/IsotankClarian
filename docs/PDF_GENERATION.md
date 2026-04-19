# Spike técnico — Geração de Laudo em PDF (Puppeteer)

Fluxo alternativo ao `.docx` existente. **Não modifica nada do pipeline atual** —
é puramente aditivo. Se algo der errado, basta remover os 2 `app.use` do
`server.js` e o fluxo antigo continua intocado.

## Arquivos criados nesse spike

```
src/templates/
  ├─ laudo.html                   ← Template Handlebars do laudo
  └─ assets/
     └─ logo-ceinspec.png         ← Logo azul extraído do template antigo

src/services/
  └─ pdfGenerator.js              ← Serviço (Puppeteer + Handlebars + QR)

src/routes/
  ├─ laudos-pdf.js                ← POST /laudos/:id/pdf + GET preview
  └─ laudos-validar.js            ← GET /laudos/:id/validar (público, pro QR)

scripts/
  ├─ smoke-pdf.js                 ← Valida template sem Chromium (já rodou 15/15 ✅)
  └─ test-pdf.js                  ← Gera PDF de um laudo real do DB
```

## Instalação

```bash
npm install handlebars qrcode puppeteer
```

> O `puppeteer` baixa ~170 MB de Chromium no primeiro install.
> Para rodar em ambientes onde o download falha (firewall/Render),
> trocar por `puppeteer-core` + `@sparticuz/chromium` depois.

## Patch no `server.js`

**2 linhas em cada bloco** (imports + app.use). Procure pelos trechos
existentes e adicione as linhas marcadas com `+`:

### 1) Seção de imports (próximo à linha 27)

```diff
 const documentosRoutes = require('./src/routes/documentos');
+const laudosPdfRoutes = require('./src/routes/laudos-pdf');
+const laudosValidarRoutes = require('./src/routes/laudos-validar');
 const { getConfig } = require('./src/lib/config');
```

### 2) Seção de `app.use` (próximo à linha 623)

```diff
 app.use('/documentos', documentosRoutes);
+app.use('/laudos', laudosValidarRoutes);   // público: GET /:id/validar
+app.use('/laudos', laudosPdfRoutes);       // autenticado: POST /:id/pdf
```

> **Importante:** registrar o `laudosValidarRoutes` ANTES do `laudosPdfRoutes`
> só organiza a leitura — a ordem em Express é resolvida por path+método,
> os endpoints não colidem (`GET /:id/validar` vs `POST /:id/pdf`).

## Como testar

### Teste 1: smoke (sem Chromium)
```bash
node scripts/smoke-pdf.js
```
Valida que o template compila e o HTML tem todos os placeholders substituídos.

### Teste 2: geração real (exige Chromium via npm install puppeteer)
```bash
node scripts/test-pdf.js                  # usa laudo mais recente do DB
node scripts/test-pdf.js <laudoId>        # usa laudo específico
```
Salva em `output/test_output.pdf` — abra e compare com o laudo oficial.

### Teste 3: HTTP (com servidor rodando)
```bash
# Gera e baixa PDF (requer auth_token cookie)
curl -X POST http://localhost:3000/laudos/<ID>/pdf \
  -b "auth_token=<seu_token>" \
  -o laudo.pdf

# Preview inline (abre no navegador)
http://localhost:3000/laudos/<ID>/pdf/preview

# Validação do QR (público, sem auth)
http://localhost:3000/laudos/<ID>/validar
```

## Checklist de aceite visual

Quando abrir `output/test_output.pdf` no leitor de PDF, confirmar:

- [ ] **Capa (pág 1)**: barra azul lateral + título + tabela IDENTIFICAÇÃO/CLIENTE/ENDEREÇO/EQUIPAMENTO
- [ ] **"IDENTIFICAÇÃO" em uma linha só** (bug resolvido por design — CSS controla quebra)
- [ ] **Assinatura do inspetor aparece** (bug A resolvido por design — aceita PNG ou JPEG automaticamente)
- [ ] **Assinatura do engenheiro aparece**
- [ ] **Total de páginas coerente** (esperado: 6–7, dependendo do volume de fotos)
- [ ] **Rodapé "Página X de Y" dinâmico** em todas as páginas
- [ ] **Marca d'água "CEINSPEC"** sutil em diagonal
- [ ] **QR code na última página** + texto "Escaneie para validar"
- [ ] **Header com logo + box NÚMERO/DATA** em todas as páginas exceto capa
- [ ] **10 fotos no grid 2x2** com rótulos embaixo (sem desalinhamento)
- [ ] **Dados técnicos** em tabela azul-cinza

## Comparação vs fluxo .docx atual

| Aspecto               | .docx (atual)                          | .pdf (spike)                          |
|-----------------------|----------------------------------------|---------------------------------------|
| Assinatura PNG        | OK (com fix recente)                   | OK                                    |
| Assinatura JPEG       | Quadrado cinza (bug A)                 | OK (data URL aceita qualquer mime)    |
| Numeração de página   | NUMPAGES cacheada (falso)              | Dinâmica (pageNumber/totalPages)      |
| Layout quebrado       | Depende de OOXML frágil                | CSS previsível e versionável          |
| QR code de validação  | ❌                                     | ✅                                    |
| Marca d'água          | ❌                                     | ✅                                    |
| Tamanho do artefato   | ~1 MB (template binário no repo)       | ~30 KB (HTML texto + logo)            |
| Editável no Word      | Sim                                    | Não (mas é padrão p/ laudos)          |
| Compatível Render     | Sim                                    | Depende — free tier não roda Chromium |

## Próximos passos (depois do aceite visual)

1. **Validar em produção** — rodar o spike localmente com dados reais do DB.
2. **Decidir o switch** — manter os dois endpoints por 2-3 semanas ou cortar direto.
3. **Expor na UI** — botão "Baixar PDF" no kanban/admin (se decidir manter).
4. **Para produção no Render**: migrar para `puppeteer-core` + `@sparticuz/chromium`.
5. **Para produção on-prem (Cesari)**: `puppeteer` full funciona — instalar Chromium via apt ou deixar bundled.

## Troubleshooting

### `Error: Could not find Chrome`
```bash
npx puppeteer browsers install chrome
```

### `Error: ENOENT: no such file or directory, open '.../logo-ceinspec.png'`
Confirme que `src/templates/assets/logo-ceinspec.png` existe. Se não, extraia
do template antigo:
```bash
# Temporário — pro spike
cp /caminho/ao/logo-azul.png src/templates/assets/logo-ceinspec.png
```

### QR code aponta pra domínio errado
O QR usa `baseUrl` do request (via `x-forwarded-*` headers). Se estiver atrás
de proxy, confirmar que o header chega certo. Para forçar, setar
`APP_BASE_URL=https://isotank.ceinspec.com.br` no `.env`.
