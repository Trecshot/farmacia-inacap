# CRUD base - Farmacia INACAP

Incluye:
- Usuarios
- Roles
- Permisos
- Categorías
- Laboratorios
- Principios activos
- Productos

## Instalación
Copia las carpetas del ZIP dentro de `backend`, respetando estructura.

Luego:

```powershell
npx prisma generate
npx tsc --noEmit
npm run dev
```

En otra PowerShell:

```powershell
.\probar_crud.ps1
```

## Rutas principales
- `/api/users`
- `/api/access/roles`
- `/api/access/permissions`
- `/api/categories`
- `/api/laboratories`
- `/api/active-ingredients`
- `/api/products`

Todas están protegidas con JWT + permisos RBAC.
