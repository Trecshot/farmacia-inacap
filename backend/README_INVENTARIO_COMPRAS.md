# Compras + Inventario + FEFO

Incluye:
- Proveedores
- Órdenes de compra
- Recepción parcial/completa
- Creación de lotes
- Stock por ubicación
- Movimientos de inventario
- Transferencias
- Ajustes
- Consulta FEFO
- Alertas por stock y vencimiento

## Instalación
Descomprime dentro de `backend` y ejecuta:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\instalar_inventario_compras.ps1
```

## Prueba
Con el backend corriendo:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\probar_inventario_compras.ps1
```
