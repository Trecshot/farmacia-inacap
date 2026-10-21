# Auth + RBAC - Farmacia INACAP

## Archivos
Copiar el contenido respetando exactamente la estructura de carpetas.

## Dependencias nuevas
```powershell
npm install bcryptjs jsonwebtoken
npm install -D @types/jsonwebtoken
```

## Variables nuevas de `.env`
Agrega:

```env
JWT_ACCESS_SECRET="CAMBIA_ESTA_CLAVE_POR_UNA_DE_AL_MENOS_32_CARACTERES"
JWT_ACCESS_EXPIRES_IN="15m"
REFRESH_TOKEN_DAYS=7

ADMIN_RUT="11.111.111-1"
ADMIN_FIRST_NAME="Administrador"
ADMIN_LAST_NAME="Sistema"
ADMIN_EMAIL="admin@farmacia.local"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="administrador"
```

Cambia `JWT_ACCESS_SECRET` y `ADMIN_PASSWORD` antes de usar producción.

## Script seed
En `package.json`, agrega:

```json
"seed": "tsx prisma/seed.ts"
```

## Ejecutar
```powershell
npx prisma generate
npx tsc --noEmit
npm run seed
npm run dev
```

## Endpoints
- POST `/api/auth/login`
- POST `/api/auth/refresh`
- POST `/api/auth/logout`
- GET `/api/auth/me`

### Login
```json
{
  "username": "admin",
  "password": "administrador"
}
```

### Refresh
```json
{
  "refreshToken": "TOKEN_DEVUELTO_POR_LOGIN"
}
```

### Me
Header:

`Authorization: Bearer ACCESS_TOKEN`
