$ErrorActionPreference = "Stop"

$backend = $PSScriptRoot
$file = Join-Path $backend "src\modules\sales\sales.service.ts"

if (-not (Test-Path $file)) {
    Write-Host "No se encontró: $file" -ForegroundColor Red
    exit 1
}

Write-Host "==> Corrigiendo tipado de preparedItems en sales.service.ts..." -ForegroundColor Cyan

$content = Get-Content -Path $file -Raw -Encoding UTF8

$old = '  const preparedItems = [];'

$new = @'
  type PreparedSaleItem = {
    productId: string;
    quantity: number;
    discountAmount: number;
    prescriptionItemId?: string | null;
    locationId?: string | null;
    product: {
      id: string;
      name: string;
      salePrice: unknown;
      requiresPrescription: boolean;
      isControlled: boolean;
    };
    unitPrice: number;
    lineGross: number;
    lineNet: number;
    lineTax: number;
    lineTotal: number;
  };

  const preparedItems: PreparedSaleItem[] = [];
'@

if (-not $content.Contains($old)) {
    Write-Host "No encontré la línea esperada 'const preparedItems = [];'" -ForegroundColor Yellow
    Write-Host "Puede que ya esté corregido. Ejecutaré TypeScript igualmente." -ForegroundColor Yellow
}
else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $file -Value $content -Encoding UTF8
    Write-Host "Corrección aplicada." -ForegroundColor Green
}

Set-Location $backend

Write-Host "==> Validando TypeScript..." -ForegroundColor Cyan
npx tsc --noEmit

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Todavía hay errores. Envíame la salida completa." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host " SALES.SERVICE CORREGIDO CORRECTAMENTE" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Ahora ejecuta:" -ForegroundColor Yellow
Write-Host "npx tsx preparar_pos.ts" -ForegroundColor White
Write-Host "npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Y en otra PowerShell:" -ForegroundColor Yellow
Write-Host ".\probar_pos_caja_ventas.ps1" -ForegroundColor White
