$ErrorActionPreference = "Stop"

$source = $PSScriptRoot
$backend = $PSScriptRoot

$sourceResolved = (Resolve-Path $source).Path.TrimEnd('\')
$backendResolved = (Resolve-Path $backend).Path.TrimEnd('\')

Write-Host "==> Instalando POS + Caja + Ventas..." -ForegroundColor Cyan

if ($sourceResolved -ne $backendResolved) {
  $copyDirs = @(
    "src\modules\cash",
    "src\modules\sales",
    "src\routes"
  )

  foreach ($dir in $copyDirs) {
    $srcPath = Join-Path $source $dir
    $dstPath = Join-Path $backend $dir

    New-Item -ItemType Directory -Force -Path $dstPath | Out-Null
    Copy-Item -Path (Join-Path $srcPath "*") -Destination $dstPath -Recurse -Force
  }

  Copy-Item (Join-Path $source "preparar_pos.ts") (Join-Path $backend "preparar_pos.ts") -Force
  Copy-Item (Join-Path $source "probar_pos_caja_ventas.ps1") (Join-Path $backend "probar_pos_caja_ventas.ps1") -Force
}
else {
  Write-Host "Los archivos ya están dentro de backend; se omite la copia." -ForegroundColor Yellow
}

Set-Location $backend

Write-Host "==> Generando Prisma Client..." -ForegroundColor Cyan
npx prisma generate

Write-Host "==> Validando TypeScript..." -ForegroundColor Cyan
npx tsc --noEmit

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "TypeScript encontró errores. Envíame la salida completa." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "==> Preparando caja principal..." -ForegroundColor Cyan
npx tsx preparar_pos.ts

if ($LASTEXITCODE -ne 0) {
  Write-Host "No fue posible preparar la caja POS." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host " POS + CAJA + VENTAS INSTALADO" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "1) Ejecuta: npm run dev" -ForegroundColor Yellow
Write-Host "2) En otra PowerShell: .\probar_pos_caja_ventas.ps1" -ForegroundColor Yellow
