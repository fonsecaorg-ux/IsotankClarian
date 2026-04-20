# v6 — Corrigir bug de autofill no painel admin

## Problema

Ao clicar em qualquer lugar do painel admin (aba Laudos), a lista
de laudos esvazia mostrando "Nenhum laudo encontrado".

**Causa raiz:** O Chrome/Edge detecta o campo de senha do modal "Novo
Usuário" e aciona o mecanismo de password manager. Toda vez que você
clica em qualquer lugar da página, o Chrome "garante" que tem um
username preenchido — como o campo de busca é o primeiro `<input
type="text">` visível da página, o Chrome injeta o email do usuário
logado (`admin@ceinspec.local`) dentro dele.

O filtro de busca então dispara, procura laudos com `admin@ceinspec.local`
no número/cliente, não acha nada, e mostra "Nenhum laudo encontrado".

Bug só aparece no **admin.html** porque é a única página que tem
tanto um input de busca texto quanto um formulário com password
na mesma página. Kanban, Equipamentos, etc., não têm esse par — por
isso funcionam normalmente.

## Solução

3 medidas combinadas:

**1. Campo de busca blindado:**
- `type="search"` em vez de `text` (renderiza "✕" nativo pra limpar)
- `autocomplete="off"` + `autocapitalize="off"` + `autocorrect="off"`
- `name="q_buscar_laudos"` (não-óbvio para autofill)
- `data-lpignore="true"` (LastPass) + `data-form-type="other"` (outras extensões)

**2. Honeypot no modal Novo Usuário:**
- 2 inputs invisíveis (`display:none`, `tabindex="-1"`) com `name="fake_user"`
  e `name="fake_pass"` + autocomplete normal
- Chrome preenche estes em vez dos reais

**3. Atributos defensivos nos inputs reais:**
- `autocomplete="off"` nos campos de nome/email
- `autocomplete="new-password"` no password (indica "formulário de criar
  senha", não "formulário de login")
- `data-lpignore="true"` + `data-form-type="other"` em todos

**Importante:** os `name` originais (`name`, `email`, `password`) foram
mantidos para não quebrar o JavaScript que lê o form.

## Arquivo no pacote

```
public/admin.html   (SUBSTITUI — único arquivo modificado)
```

## Aplicação

1. Extrair o pacote na raiz do projeto, sobrescrevendo `public/admin.html`.

2. Não precisa rodar nada (só frontend, sem deps novas).

3. Commit + push:
   ```
   git add public/admin.html
   git commit -m "fix(admin): impede autofill do Chrome no campo de busca"
   git push
   ```

4. Aguardar deploy do Render (~2 min).

5. **Importante:** fazer `Ctrl+Shift+R` no navegador pra limpar cache
   antes de testar.

## Teste

Depois de fazer hard refresh no admin:

1. Verificar que o campo de busca **não tem** `admin@ceinspec.local` escrito
2. Clicar em qualquer lugar da página — campo deve continuar vazio
3. Clicar em "Ver detalhe" em qualquer laudo — modal deve abrir normalmente
4. Clicar em "Reprocessar PDF" — PDF deve baixar
5. Tentar buscar manualmente "SUTU" — filtro deve funcionar

## Rollback

Se der errado:

```bash
git revert HEAD
git push
```

## Por que não apenas `autocomplete="off"`?

Chrome ignora `autocomplete="off"` em formulários de login desde 2014
("esse recurso atrapalha usuários"). A combinação de várias medidas é
necessária pra contornar isso. Honeypot + `autocomplete="new-password"`
+ `data-lpignore` é o padrão atual recomendado para casos como esse.
