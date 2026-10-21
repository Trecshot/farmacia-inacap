$ErrorActionPreference = "Stop"

$source = $PSScriptRoot
$backend = $PSScriptRoot

$sourceResolved = (Resolve-Path $source).Path.TrimEnd('\')
$backendResolved = (Resolve-Path $backend).Path.TrimEnd('\')

Write-Host "==> Instalando bloque FINAL del backend..." -ForegroundColor Cyan

if ($sourceResolved -ne $backendResolved) {
  $dirs = @(
    "src\middlewares",
    "src\modules\clinical",
    "src\modules\agreements",
    "src\modules\reports",
    "src\modules\settings",
    "src\routes"
  )

  foreach ($dir in $dirs) {
    $src = Join-Path $source $dir
    $dst = Join-Path $backend $dir
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    Copy-Item -Path (Join-Path $src "*") -Destination $dst -Recurse -Force
  }

  Copy-Item (Join-Path $source "src\app.ts") (Join-Path $backend "src\app.ts") -Force
  Copy-Item (Join-Path $source "probar_backend_final.ps1") (Join-Path $backend "probar_backend_final.ps1") -Force
}
else {
  Write-Host "Los archivos ya están dentro de backend; se omite la copia." -ForegroundColor Yellow
}

Set-Location $backend

Write-Host "==> Instalando dependencias de reportes..." -ForegroundColor Cyan
npm install exceljs pdfkit
npm install -D @types/pdfkit

if ($LASTEXITCODE -ne 0) {
  Write-Host "Error instalando dependencias." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "==> Generando Prisma Client..." -ForegroundColor Cyan
npx prisma generate

Write-Host "==> Validando TypeScript..." -ForegroundColor Cyan
npx tsc --noEmit

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "TypeScript encontro errores. Enviame TODA la salida." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host " BACKEND FINAL INSTALADO Y TYPESCRIPT CORRECTO" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "1) npm run dev" -ForegroundColor Yellow
Write-Host "2) En otra PowerShell: .\probar_backend_final.ps1" -ForegroundColor Yellow
