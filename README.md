# CEINSPEC — Laudo Visual Isotank

PWA mobile-first para inspeção visual de isotanks em campo.  
O inspetor preenche o formulário no celular, tira as fotos e o sistema gera o **laudo em PDF** (layout próprio HTML → Puppeteer), com hash SHA-256 para validação pública via QR.

O fluxo **Word (`.docx`)** via `POST /generate` e Docxtemplater **permanece no código** como legado / reprocessamento, mas **não é mais o destino do botão “Gerar laudo”** no PWA — o download padrão é **`LAUDO_*.pdf`**.

**Repositório:** [github.com/fonsecaorg-ux/IsotankClarian](https://github.com/fonsecaorg-ux/IsotankClarian)

### Primeiro push (Git na sua máquina)

Com o [Git](https://git-scm.com/downloads) instalado, na pasta do projeto:

```bash
git init
git remote add origin https://github.com/fonsecaorg-ux/IsotankClarian.git
git add .
git commit -m "Initial commit: CEINSPEC Isotank laudo PWA"
git branch -M main
git push -u origin main
```

No Windows PowerShell também pode usar: `.\scripts\first-push.ps1`

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express 5 |
| Upload de fotos | Multer |
| Geração do laudo | Docxtemplater + PizZip |
| Frontend | HTML/CSS/JS vanilla — PWA mobile-first |
| Dev server | Nodemon |

---

## Pré-requisitos

- Node.js 18+
- npm

---

## Instalação

```bash
# Clone / baixe o projeto e entre na pasta
cd "Isotank Clariant"

# Instale as dependências
npm install

# (Única vez) Gere o template Word a partir do laudo exemplo
npm run prepare-template
```

O script `prepare-template` lê o arquivo `LAUDO ESTRUTURAL_ISOTANK_SUTU258026-0.docx` e gera `template/template.docx` com 61 campos `{tag}` prontos para o docxtemplater.  
**Só precisa rodar novamente se o laudo exemplo for substituído por uma versão atualizada.**

---

## Rodando

### Banco local (recomendado para testar no PC)

O Prisma está configurado para **PostgreSQL** (igual ao Render). Para não depender da cloud:

1. Instale o [Docker Desktop](https://www.docker.com/products/docker-desktop/) (se ainda não tiver).
2. Na pasta do projeto:
   ```bash
   docker compose up -d
   ```
3. Copie `env.example` para `.env` e ajuste se precisar (a URL já aponta para o Postgres do Docker).
4. Aplique migrações e suba o servidor:
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   npm run dev
   ```

Para parar o Postgres: `docker compose down` (os dados ficam no volume até `docker compose down -v`).

### Servidor

```bash
# Desenvolvimento (reinicia automaticamente ao salvar)
npm run dev

# Produção
npm start
```

Acesse no navegador: **http://localhost:3000**

Para acessar pelo celular em campo, conecte o celular na mesma rede Wi-Fi e use o IP da máquina:  
`http://192.168.x.x:3000`

---

## Estrutura do projeto

```
Isotank Clariant/
│
├── server.js                        # Express — rotas /generate (docx legado), /laudos, PDF, etc.
├── config.json                      # Responsáveis fixos (ver abaixo)
├── package.json
│
├── template/
│   └── template.docx                # Template com tags {campo} (gerado pelo script)
│
├── public/                          # Frontend estático servido pelo Express
│   ├── index.html                   # Formulário PWA completo
│   ├── manifest.json                # Manifesto para instalação no celular
│   └── sw.js                        # Service worker
│
├── src/
│   ├── templates/laudo.html         # Template Handlebars do PDF
│   ├── services/pdfGenerator.js     # Geração PDF + pdfHash
│   └── routes/laudos-pdf.js         # POST /laudos/:id/pdf (multipart)
│
├── scripts/
│   ├── smoke-pdf.js                 # Valida template PDF (sem Chromium)
│   ├── test-pdf.js                  # Gera output/test_output.pdf (DB + Chromium)
│   ├── prepare-template.js                 # Gera template/template.docx (rodar 1x)
│   ├── rebuild_template_from_original_safe.py  # Rebuild seguro do template (Python + lxml)
│   ├── verify-template.js                # Valida tags no template
│   ├── test-generate.js                  # Teste HTTP do fluxo .docx (legado)
│   ├── check_docx_rels.py                # Valida r:embed / r:id vs ficheiros no ZIP
│   ├── find_bad_xmlns.py                 # Deteta chaves { } dentro de xmlns (XML inválido)
│   └── inspect_document_xml.py         # Contagens rápidas + parse Expat do document.xml
│
├── uploads/                         # Fotos temporárias (limpas após cada geração)
├── output/                          # Laudos gerados (para testes locais)
│
└── LAUDO ESTRUTURAL_ISOTANK_SUTU258026-0.docx   # Laudo exemplo original da CEINSPEC
```

---

## Configuração dos responsáveis fixos

Edite `config.json` para alterar os dados que aparecem no rodapé do laudo:

```json
{
  "encarregado": "Elton Vieira",
  "engenheiro": "Diego Aparecido de Lima",
  "crea_info": "Engenheiro Mecânico – CREA:506.927.6941-S",
  "cidade": "Cubatão"
}
```

Após alterar, **não é necessário** reiniciar o servidor — o arquivo é lido a cada geração.

---

## Seções do formulário

| # | Seção | Campos |
|---|---|---|
| 1 | Identificação | N° do container, cliente, endereço, data da inspeção |
| 2 | Dados Técnicos | Fabricante, n° série, dimensões, pesos, pressões, materiais, norma, certificados |
| 3 | Estrutura Externa | 12 itens — Aprovado / Reprovado / N/A |
| 4 | Componentes e Acessórios | 15 itens — Aprovado / Reprovado / N/A |
| 5 | Exames e Fotos | 5 exames (A / R / NA) + 10 fotos pela câmera |
| 6 | Conclusão | Texto livre de conclusão e recomendação |

---

## Registro fotográfico

O formulário solicita 10 fotos, capturadas diretamente pela câmera traseira do celular:

1. Frontal
2. Traseira
3. Lateral 1
4. Lateral 2
5. Superior
6. Termômetro
7. Tampa da Boca de Visita
8. Válvula de Alívio
9. Válvula Inferior de Descarga
10. Placa de Identificação

As fotos substituem as imagens de exemplo do laudo diretamente no arquivo `.docx`, sem dependência de módulos externos de imagem.

---

## Fluxo de geração

```
[Inspetor preenche o form + tira fotos no celular]
              ↓
    POST /generate  (multipart/form-data)
              ↓
    Docxtemplater preenche os 61 campos de texto
              ↓
    Fotos substituem word/media/image1-10.png no zip
              ↓
    Download automático do arquivo LAUDO_{ID}.docx
```

---

## Scripts utilitários

```bash
# Verificar se todos os 61 tags estão no template e se o docxtemplater aceita
node scripts/verify-template.js

# Teste end-to-end sem precisar abrir o browser (gera output/test_output.docx)
node scripts/test-generate.js
```

---

## Instalando como PWA no celular (Android)

1. Abra o Chrome e acesse `http://<IP-da-maquina>:3000`
2. Toque no menu ⋮ → **"Adicionar à tela inicial"**
3. O app fica disponível como ícone, sem precisar digitar o endereço novamente

---

## Desafios na geração do `.docx` (e como foram resolvidos)

Durante a evolução do projeto apareceu um problema grave: **o ficheiro gerado não abria de forma consistente** — nem no Word Online / SharePoint, nem em alguns fluxos de upload (por exemplo Google Drive), e em casos extremos o Word deixava de reconhecer o pacote como documento válido.

### O que estava na origem do problema

1. **Sanitização para Word Online (ficheiro `.wdp` / HD Photo)**  
   O template antigo incluía mídia **WDP** (`hdphoto1.wdp`), pouco suportada no Word na web. Ao remover o ficheiro do ZIP era obrigatório remover também a **relação** em `word/_rels/document.xml.rels` e trechos do `word/document.xml` que ainda referenciassem o `rId` — caso contrário o pacote OOXML ficava **inconsistente**.

2. **Bug crítico na regex das `<Relationship>`**  
   O código usava um padrão do tipo `[^/>]+` para capturar os atributos das relações. Isso **falhava sempre** que o atributo `Type` continha `http://…` (há uma `/` logo no início do URL). Resultado: **nenhuma** relação era processada, o `.wdp` era apagado do ZIP **mas a entrada no `.rels` continuava** → ficheiro **corrompido** (não abre “de jeito nenhum”).

3. **`{ano_fabricacao}` dentro de `xmlns` (XML inválido)**  
   Substituições globais do texto `2018` (ano de exemplo) por `{ano_fabricacao}` acabaram por alterar também URIs de namespace do Office (`…/word/2018/wordml`). Em XML, o valor de `xmlns` tem de ser um URI válido — **chaves `{` `}` não são permitidas** aí. Isso invalidava o `document.xml` de forma silenciosa até parsers mais estritos (e o Word Online).

4. **Reparo agressivo do XML (“recover”)**  
   Tentativas de “reparar” o `document.xml` com bibliotecas em modo *recover* reescreviam a árvore e **destruíam o layout** (páginas em branco, legendas de fotos desalinhadas, etc.). Ou seja: **abria**, mas **visualmente quebrado**.

### Como chegámos a uma solução estável

- **Correção da regex** em `server.js` para processar corretamente todas as `<Relationship …/>` (incluindo `Type` com `http://`).
- Manter a sanitização do ZIP **depois** do `doc.render()`, com remoção controlada de `.wdp`, `.rels`, `[Content_Types].xml` e referências no `document.xml` (sem cortar blocos ao acaso).
- **Reconstruir o `template/template.docx` a partir do original** com o script `scripts/rebuild_template_from_original_safe.py`: aplica placeholders **apenas em texto** (`w:t` via `lxml`), **sem** substituições cegas no XML inteiro — preserva **layout** e mantém o **OOXML válido**.
- Scripts de apoio para diagnóstico: `scripts/find_bad_xmlns.py`, `scripts/inspect_document_xml.py`, `scripts/check_docx_rels.py`.

> **Resumo:** o “não abre” vinha sobretudo de **pacote OOXML inconsistente** e de **XML inválido no `document.xml`**; o “abre mas quebrado” vinha de **reparos agressivos**. A solução final passa por **regex correcta**, **sanitização coerente** e **rebuild seguro do template**.

### Fotos na base de dados mas não embutidas no Word

Apareceu outro sintoma, distinto da corrupção do ficheiro: **as fotos chegavam à aplicação e eram persistidas** (tabela `FotoLaudo` / disco), **mas o `.docx` descarregado às vezes voltava sem imagens** ou só com placeholders — embora o fluxo “inspetor + formulário + câmara” parecesse correcto.

**O que estava a acontecer**

- A injeção no Word faz-se sobrescrevendo entradas no ZIP do template (`word/media/image1.png` … `image10.png`) **a partir dos ficheiros enviados no `multipart`** (`req.files`), **antes** do `doc.render()`.
- O **primeiro** `POST /generate` (ex.: inspetor com `FormData` completo) incluía `foto_frontal`, etc., e o servidor logava `Injetando foto …` — o laudo saía com imagens e as fotos eram gravadas na base **depois** da resposta.
- Um **segundo** pedido ao mesmo `laudoId` — típico de **outro perfil** (ex.: administrador) ou de um fluxo que só envia **`laudoId`** sem reanexar ficheiros — chegava com **`req.files` vazio**. O código **não** voltava a ler as fotos já guardadas; o template era processado **sem** substituir os PNGs → **Word “sem” fotos**, apesar dos registos existirem na base.

**Como se confirmou**

- Nos logs do Render (ou local), linhas `[FOTOS] Campos recebidos em req.files:` mostravam `foto_frontal` num pedido e **`(nenhum)`** noutro, para o **mesmo** `laudoId` — com tamanhos de `.docx` diferentes (com vs. sem bytes de imagem).

**Solução**

- Em `server.js`, depois de processar o multipart, se existir `laudoId` e ainda houver slots de foto **não** preenchidos nessa requisição, o servidor **carrega os blobs** (ou ficheiros em modo disco) de `FotoLaudo` via Prisma e **injeta no ZIP** nos mesmos caminhos `word/media/imageN.png`. Assim, **re-gerações só com `laudoId`** voltam a incluir as fotos já associadas ao laudo.

> **Resumo:** não era falha do mapeamento `foto_*` → `imageN.png` na primeira geração; era **segunda geração sem multipart**. A solução é **fallback a partir do armazenamento** (`FotoLaudo`) para os campos em falta no upload.

---

## Observações

- O laudo é gerado e enviado diretamente para download — **nada é gravado em disco**.
- As fotos vivem apenas na RAM durante a requisição (`multer.memoryStorage`); o buffer é descartado automaticamente pelo GC após o envio.
- O template Word é carregado em memória **uma única vez** no startup e reutilizado em todas as requisições.
- Para uso em produção, rode atrás de HTTPS (obrigatório para `capture="environment"` funcionar em Android via rede local ou domínio).

---

## Deploy no Render

O servidor é compatível com o **filesystem efêmero** do Render por não escrever nada fora do repositório.

### Passos

1. Faça push do projeto para um repositório GitHub (incluindo `template/template.docx` e `config.json`).
2. No Render, crie um novo **Web Service** apontando para o repositório.
3. Configure:

| Campo | Valor |
|---|---|
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | Free (ou superior) |

4. Adicione a variável de ambiente se quiser porta customizada (o Render injeta `PORT` automaticamente — o servidor já usa `process.env.PORT`).

> **Atenção:** a pasta `uploads/` e `output/` existem apenas localmente para testes. No Render elas nunca são criadas nem necessárias — todo o processamento é em RAM.

### Erro “Not Found” ao abrir o site

| Causa | O que fazer |
|---|---|
| **Serviço errado** | Crie um **Web Service** (Node), **não** um *Static Site*. Este app precisa rodar `node server.js` para servir o PWA e as rotas de laudo (PDF, `/generate` legado, etc.). |
| **Start Command** | Deve ser `npm start` (ou `node server.js`). |
| **Root Directory** | Deixe vazio (raiz do repositório), a menos que o projeto esteja em subpasta. |
| **Deploy antigo / falha no build** | Abra **Logs** no painel do Render: se o processo cair na subida (ex.: `template/template.docx` ausente), o site pode responder com erro. Faça **Manual Deploy → Clear build cache & deploy**. |

O servidor escuta em `0.0.0.0` e na porta `PORT` definida pelo Render.

---

## Roadmap (próximas versões)

| Área | Descrição |
|---|---|
| **Autenticação** | Tela de login e identificação do inspetor |
| **SharePoint** | Salvamento automático do laudo gerado na pasta da Ceinspec |
| **Indicadores** | Dashboard com métricas de inspeções realizadas |
| **Kanban** | Gestão visual do status dos laudos (pendente, gerado, assinado) |
| **Alertas de vencimento** | Notificações automáticas de equipamentos com inspeção próxima do vencimento |
| **CRM** | Gestão de clientes e equipamentos inspecionados |
| **Autenticação** | Login com identificação do inspetor, substituindo config.json |
