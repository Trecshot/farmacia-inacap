$ErrorActionPreference = "Stop"

$source = $PSScriptRoot
$backend = $PSScriptRoot

$sourceResolved = (Resolve-Path $source).Path.TrimEnd('\')
$backendResolved = (Resolve-Path $backend).Path.TrimEnd('\')

Write-Host "==> Instalando bloque Compras + Inventario..." -ForegroundColor Cyan

if ($sourceResolved -ne $backendResolved) {
  $copyDirs = @(
    "src\utils",
    "src\modules\suppliers",
    "src\modules\purchases",
    "src\modules\inventory",
    "src\routes"
  )

  foreach ($dir in $copyDirs) {
    $srcPath = Join-Path $source $dir
    $dstPath = Join-Path $backend $dir

    New-Item -ItemType Directory -Force -Path $dstPath | Out-Null
    Copy-Item -Path (Join-Path $srcPath "*") -Destination $dstPath -Recurse -Force
  }

  Copy-Item `
    -Path (Join-Path $source "probar_inventario_compras.ps1") `
    -Destination (Join-Path $backend "probar_inventario_compras.ps1") `
    -Force
}
else {
  Write-Host "Los archivos ya están dentro de backend; se omite la copia para evitar sobrescribir archivos consigo mismos." -ForegroundColor Yellow
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

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host " COMPRAS + INVENTARIO INSTALADO CORRECTAMENTE" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "1) Ejecuta: npm run dev" -ForegroundColor Yellow
Write-Host "2) En otra PowerShell ejecuta: .\probar_inventario_compras.ps1" -ForegroundColor Yellow
