$ErrorActionPreference = "Continue"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " INICIANDO FARMA-GESTION (DESARROLLO LOCAL)" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Verificar / Iniciar Contenedor Postgres
Write-Host "`n[1/3] Verificando base de datos PostgreSQL en Docker..." -ForegroundColor Yellow
$containerStatus = docker inspect -f '{{.State.Status}}' farmacia_postgres 2>$null

if ($containerStatus -ne "running") {
    Write-Host "Levantando contenedor con Docker Compose..." -ForegroundColor Yellow
    docker compose up -d
} else {
    Write-Host "PostgreSQL ya está en ejecución." -ForegroundColor Green
}

# 2. Iniciar Backend
Write-Host "`n[2/3] Iniciando Backend en ventana independiente..." -ForegroundColor Yellow
$backendPath = Join-Path $PSScriptRoot "backend"
Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", "Set-Location '$backendPath'; npm run dev"
)

# 3. Iniciar Frontend
Write-Host "`n[3/3] Iniciando Frontend en ventana independiente..." -ForegroundColor Yellow
$frontendPath = Join-Path $PSScriptRoot "frontend"
Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", "Set-Location '$frontendPath'; npm run dev"
)

Write-Host "`n====================================================" -ForegroundColor Green
Write-Host " Todo listo! Servicios en ejecución:" -ForegroundColor Green
Write-Host " Frontend: http://localhost:5173" -ForegroundColor White
Write-Host " Backend:  http://localhost:3000" -ForegroundColor White
Write-Host " Credenciales Admin: configuradas en backend/.env (ADMIN_USERNAME / ADMIN_PASSWORD)" -ForegroundColor White
Write-Host "====================================================" -ForegroundColor Green
