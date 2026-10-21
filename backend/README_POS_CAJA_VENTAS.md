# POS + Caja + Ventas

Bloque backend para Farmacia INACAP.

Incluye:

- Cajas / terminales
- Apertura y cierre de caja
- Movimientos manuales de caja
- Ventas POS
- Pago efectivo, débito, crédito, transferencia u otro
- Descuento por línea
- Descuento automático de inventario mediante FEFO
- Registro de lote usado en cada venta
- Movimientos de inventario por venta
- Anulación con devolución de stock
- Reintegro de saldo de receta al anular
- Boleta/factura abstracta
- Emisión DTE simulada para el proyecto académico

## Instalación

Si el ZIP fue descomprimido directamente dentro de backend:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\instalar_pos_caja_ventas.ps1
```

Luego:

```powershell
npm run dev
```

En otra PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\probar_pos_caja_ventas.ps1
```

## Nota tributaria

`/api/sales/:id/tax-document/mock-issue` es una simulación de integración SII.
No intenta representar una conexión productiva real con SII.
