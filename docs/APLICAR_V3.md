# v3 — Ligar o botão "Gerar laudo" ao PDF

Esta atualização **desliga o fluxo .docx** e liga o botão "Gerar laudo"
à rota PDF. São **2 mudanças**:

1. Substituir `src/routes/laudos-pdf.js` (aceita fotos via multipart).
2. Trocar 2 linhas em `public/index.html` (frontend aponta pro PDF).

Nenhuma mudança no banco, no `server.js`, no `package.json` ou em outros arquivos.

## Arquivos no pacote

```
src/routes/laudos-pdf.js    (SUBSTITUI — aceita multipart com fotos)
docs/APLICAR_V3.md          (este guia)
```

## Passo 1 — Substituir `src/routes/laudos-pdf.js`

Copiar o arquivo do pacote por cima do existente.

## Passo 2 — Editar `public/index.html` (2 linhas)

Localizar o bloco que hoje tem (por volta da linha 1408):

```js
    console.log(`[SUBMIT-${callId}] POST /generate...`);
    const res = await fetch('/generate', { method: 'POST', credentials: 'include', body: fd });
    console.log(`[SUBMIT-${callId}] Resposta /generate: ${res.status} ${res.statusText}`);
    
    if (!res.ok) throw new Error('Erro ao gerar laudo. Tente novamente.');

    const blob = await res.blob();
    const cdHeader = res.headers.get('Content-Disposition') || '';
    const match = cdHeader.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : 'laudo.docx';
```

**Substituir APENAS duas linhas:**

### Mudança 1 — linha 1409
De:
```js
    const res = await fetch('/generate', { method: 'POST', credentials: 'include', body: fd });
```
Para:
```js
    const res = await fetch(`/laudos/${laudo.id}/pdf`, { method: 'POST', credentials: 'include', body: fd });
```

(Muda a URL de `/generate` para `/laudos/${laudo.id}/pdf` — o `laudo.id`
já existe nesse escopo, vem do `POST /laudos` acima.)

### Mudança 2 — linha 1417
De:
```js
    const filename = match ? match[1] : 'laudo.docx';
```
Para:
```js
    const filename = match ? match[1] : 'laudo.pdf';
```

(Só muda o fallback do nome do arquivo quando o `Content-Disposition` não
vem — caso raro, mas vale consistência.)

### Opcional — ajustar logs

Os `console.log` que mencionam `/generate` continuam funcionando mas ficam
enganadores. Pra limpar, substituir também:

```js
    console.log(`[SUBMIT-${callId}] POST /generate...`);
```
Por:
```js
    console.log(`[SUBMIT-${callId}] POST /laudos/${laudo.id}/pdf...`);
```

E:
```js
    console.log(`[SUBMIT-${callId}] Resposta /generate: ${res.status} ${res.statusText}`);
```
Por:
```js
    console.log(`[SUBMIT-${callId}] Resposta /laudos/:id/pdf: ${res.status} ${res.statusText}`);
```

## Passo 3 — Testar

Na mesma sessão de terminal com o servidor parado:

```bash
node scripts/smoke-pdf.js        # ainda deve passar 24/24
npm run dev
```

No navegador:
1. Acessar o formulário
2. Preencher um laudo completo (as 10 fotos)
3. Clicar em "Gerar laudo"
4. Deve baixar um arquivo **.pdf** (não .docx)
5. Abrir o PDF — layout novo com capa, chips numerados, bloco de validação

## Como saber que funcionou

✅ O arquivo baixado tem extensão `.pdf`
✅ Console do navegador mostra `POST /laudos/.../pdf` (não `/generate`)
✅ Console do servidor mostra `[PDF-xxxxx] POST /laudos/.../pdf recebido`
✅ Abrir o PDF: é o layout novo aprovado (capa com chip verde APROVADO)

## Sobre o fluxo .docx

A rota `POST /generate` continua **existente e funcional** no servidor
— só não é mais chamada pelo frontend. Isso é intencional:

- Se algo der errado, reverter é trivial (trocar a URL de volta)
- A rota .docx ainda serve pra debug, regeneração manual, ou fallback
- Quando estiver confiante com o PDF em campo (Diego Lima + Wagner
  aprovando), aí sim remove a rota `/generate` do `server.js`

## Troubleshooting

### "Laudo não encontrado" ao gerar
O `laudo.id` vindo do `POST /laudos` anterior não está sendo passado
direito. Abrir console do navegador e verificar que o valor de `laudo.id`
está definido antes da chamada `fetch`.

### PDF baixa mas sem fotos
As fotos não estão no FormData. Verificar no console do navegador se
`fileCountBeforeSend` (log existente) é > 0 antes da chamada. As fotos
precisam estar no FormData com os mesmos nomes de campo
(`foto_frontal`, `foto_traseira`, etc.).

### Servidor retorna 500
Ver log completo. Causas comuns:
- Puppeteer não conseguiu subir Chromium → `npx puppeteer browsers install chrome`
- Migration `pdfHash` não foi aplicada → `npx prisma migrate deploy`
- Laudo criado mas sem `createdById` (raro) → verificar auth

## Reversão (caso precise)

```bash
git checkout HEAD -- public/index.html src/routes/laudos-pdf.js
```

Pronto — volta ao estado anterior instantaneamente.
