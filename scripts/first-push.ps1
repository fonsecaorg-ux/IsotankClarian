# Primeiro envio ao GitHub (execute na pasta do projeto, com Git instalado)
# Repositório: https://github.com/fonsecaorg-ux/IsotankClarian
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git nao encontrado no PATH. Instale o Git ou use o GitHub Desktop." -ForegroundColor Red
    exit 1
}

git init
if (-not (git remote get-url origin 2>$null)) {
    git remote add origin "https://github.com/fonsecaorg-ux/IsotankClarian.git"
}
git add .
git status
git commit -m "Initial commit: CEINSPEC Isotank laudo PWA"
git branch -M main
git push -u origin main
Write-Host "Concluido." -ForegroundColor Green
