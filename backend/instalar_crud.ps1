$ErrorActionPreference = "Stop"

$source = $PSScriptRoot
$backend = $PSScriptRoot

$sourceResolved = (Resolve-Path $source).Path.TrimEnd('\')
$backendResolved = (Resolve-Path $backend).Path.TrimEnd('\')

Write-Host "==> Instalando CRUD base..." -ForegroundColor Cyan

if ($sourceResolved -ne $backendResolved) {
  $copyDirs = @(
    "src\utils",
    "src\modules\users",
    "src\modules\access",
    "src\modules\catalog",
    "src\routes",
    "src\middlewares"
  )

  foreach ($dir in $copyDirs) {
    $srcPath = Join-Path $source $dir
    $dstPath = Join-Path $backend $dir

    New-Item -ItemType Directory -Force -Path $dstPath | Out-Null
    Copy-Item -Path (Join-Path $srcPath "*") -Destination $dstPath -Recurse -Force
  }

  Copy-Item -Path (Join-Path $source "probar_crud.ps1") -Destination (Join-Path $backend "probar_crud.ps1") -Force
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
  Write-Host "Hay errores de TypeScript. Envíame la salida completa." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host " CRUD BASE INSTALADO CORRECTAMENTE" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "1) Ejecuta: npm run dev" -ForegroundColor Yellow
Write-Host "2) En otra PowerShell: .\probar_crud.ps1" -ForegroundColor Yellow
