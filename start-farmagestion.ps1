$ErrorActionPreference = "Continue"

$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$ngrokDomain = "terse-nonabiding-creola.ngrok-free.dev"

if (-not (Test-Path $backend)) {
    Write-Host "No existe el backend: $backend" -ForegroundColor Red
    Read-Host "ENTER para salir"
    exit 1
}

# 1. Asegurar contenedor de PostgreSQL en Docker
Write-Host "Verificando base de datos PostgreSQL en Docker..." -ForegroundColor Cyan
$containerStatus = docker inspect -f '{{.State.Status}}' farmacia_postgres 2>$null
if ($containerStatus -ne "running") {
    Write-Host "Levantando contenedor farmacia_postgres..." -ForegroundColor Yellow
    docker compose up -d
} else {
    Write-Host "PostgreSQL está listo y en ejecución." -ForegroundColor Green
}

# 2. Iniciar Backend
Write-Host ""
Write-Host "FarmaGestión - Iniciando servicios" -ForegroundColor Green
Write-Host "Backend Local: http://localhost:3000" -ForegroundColor White
Write-Host "Health Local:  http://localhost:3000/api/health" -ForegroundColor White

$backendCommand = "Set-Location '$backend'; npm run dev"
Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $backendCommand
)

# 3. Iniciar Frontend
if (Test-Path $frontend) {
    Write-Host "Frontend Local: http://localhost:5173" -ForegroundColor White
    $frontendCommand = "Set-Location '$frontend'; npm run dev"
    Start-Process powershell.exe -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", $frontendCommand
    )
}

# 4. Iniciar ngrok opcionalmente si está disponible
$ngrok = Get-Command ngrok -ErrorAction SilentlyContinue

if ($ngrok) {
    Write-Host "API pública:    https://$ngrokDomain/api" -ForegroundColor Cyan
    Write-Host "Health público: https://$ngrokDomain/api/health" -ForegroundColor Cyan
    $ngrokCommand = "ngrok http --domain=$ngrokDomain 3000"
    Start-Sleep -Seconds 2
    Start-Process powershell.exe -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", $ngrokCommand
    )
} else {
    Write-Host ""
    Write-Host "[Nota] ngrok no está en PATH. Los servicios operarán normalmente en modo Local (localhost)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Servicios iniciados en ventanas independientes." -ForegroundColor Green
