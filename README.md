# CEINSPEC — Laudo Visual Isotank

PWA mobile-first para inspeção visual de isotanks em campo.  
O inspetor preenche o formulário no celular, tira as fotos e o sistema gera automaticamente o laudo Word no padrão oficial da CEINSPEC.

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
├── server.js                        # Servidor Express — rota POST /generate
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
├── scripts/
│   ├── prepare-template.js          # Gera template/template.docx (rodar 1x)
│   ├── verify-template.js           # Valida tags no template
│   └── test-generate.js             # Teste end-to-end via HTTP
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
