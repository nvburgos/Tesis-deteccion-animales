# Despliegue en Railway

## Servicios necesarios

Crear un proyecto en Railway con:

1. `PostgreSQL`
2. Servicio web desde GitHub usando este repositorio.
3. Servicio worker desde el mismo repositorio.
4. Un volumen persistente conectado al servicio web y, si Railway lo permite en tu plan, otro al worker.

## Servicio web

Start command:

```bash
npm run railway:web
```

Variables:

```env
AUTH_SECRET="un-secreto-largo-y-aleatorio"
ALLOW_PUBLIC_REGISTRATION="true"
DATABASE_URL="${{Postgres.DATABASE_URL}}"
RESEND_API_KEY="re_..."
EMAIL_FROM="WildlifeAI <notificaciones@tu-dominio.com>"
APP_URL="https://tu-app.up.railway.app"
STORAGE_ROOT="/app/storage"
PYTHON_BIN="/opt/venv/bin/python"
SPECIESNET_COUNTRY="ECU"
```

Volumen recomendado:

```text
Mount path: /app/storage
```

## Servicio worker

Crear otro servicio desde el mismo repo y cambiar el start command:

```bash
npm run railway:worker
```

Usar las mismas variables que el servicio web:

```env
AUTH_SECRET="..."
DATABASE_URL="${{Postgres.DATABASE_URL}}"
RESEND_API_KEY="..."
EMAIL_FROM="..."
APP_URL="https://tu-app.up.railway.app"
STORAGE_ROOT="/app/storage"
PYTHON_BIN="/opt/venv/bin/python"
SPECIESNET_COUNTRY="ECU"
```

## Orden de prueba

1. Desplegar PostgreSQL.
2. Desplegar web.
3. Abrir la URL publica y probar registro/login.
4. Desplegar worker.
5. Subir un ZIP pequeno y revisar logs del worker.
6. Confirmar correo de lote finalizado.

## Notas

- El comando del web ejecuta `prisma migrate deploy` antes de iniciar Next.
- El worker no ejecuta migraciones; solo procesa lotes pendientes.
- Si no configuras volumen, los archivos subidos pueden perderse en un redeploy.
