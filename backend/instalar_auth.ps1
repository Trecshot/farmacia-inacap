$ErrorActionPreference = "Stop"

$backend = $PSScriptRoot
Set-Location $backend

Write-Host "==> Instalando dependencias de autenticación..." -ForegroundColor Cyan
npm install bcryptjs jsonwebtoken
npm install -D @types/jsonwebtoken

Write-Host "==> Creando estructura..." -ForegroundColor Cyan
$dirs = @(
  "src\types",
  "src\modules\auth"
)
foreach ($dir in $dirs) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

Write-Host ""
Write-Host "IMPORTANTE:" -ForegroundColor Yellow
Write-Host "Este script instala dependencias y agrega el script seed." -ForegroundColor Yellow
Write-Host "Primero debes copiar los archivos del ZIP dentro de backend respetando carpetas." -ForegroundColor Yellow

# package script
$pkg = Get-Content "package.json" -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $pkg.scripts) {
  $pkg | Add-Member -MemberType NoteProperty -Name scripts -Value ([ordered]@{})
}
$pkg.scripts | Add-Member -MemberType NoteProperty -Name seed -Value "tsx prisma/seed.ts" -Force
$pkg | ConvertTo-Json -Depth 100 | Set-Content -Encoding UTF8 "package.json"

# env defaults if missing
$envPath = ".env"
$envText = Get-Content $envPath -Raw -Encoding UTF8

$items = [ordered]@{
  JWT_ACCESS_SECRET = "farmacia-inacap-desarrollo-clave-jwt-2026-cambiar"
  JWT_ACCESS_EXPIRES_IN = "15m"
  REFRESH_TOKEN_DAYS = "7"
  ADMIN_RUT = "11.111.111-1"
  ADMIN_FIRST_NAME = "Administrador"
  ADMIN_LAST_NAME = "Sistema"
  ADMIN_EMAIL = "admin@farmacia.local"
  ADMIN_USERNAME = "admin"
  ADMIN_PASSWORD = "administrador"
}

foreach ($item in $items.GetEnumerator()) {
  if ($envText -notmatch "(?m)^$($item.Key)=") {
    Add-Content -Encoding UTF8 $envPath "`n$($item.Key)=`"$($item.Value)`""
  }
}

Write-Host ""
Write-Host "==> Generando Prisma..." -ForegroundColor Cyan
npx prisma generate

Write-Host ""
Write-Host "==> Validando TypeScript..." -ForegroundColor Cyan
npx tsc --noEmit

if ($LASTEXITCODE -ne 0) {
  Write-Host "TypeScript encontró errores. Envíame la salida completa." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "==> Ejecutando seed..." -ForegroundColor Cyan
npm run seed

if ($LASTEXITCODE -ne 0) {
  Write-Host "El seed encontró errores. Envíame la salida completa." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host " AUTH + RBAC INSTALADO CORRECTAMENTE" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host "Usuario: admin" -ForegroundColor White
Write-Host "Password inicial: administrador" -ForegroundColor White
Write-Host ""
Write-Host "Ahora ejecuta: npm run dev" -ForegroundColor Yellow
