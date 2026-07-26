# WildlifeAI - Guia para descargar y ejecutar los cambios subidos

Este documento resume el contexto de los cambios subidos a GitHub y los pasos para que otra persona pueda descargar el proyecto, actualizar su entorno y ejecutar WildlifeAI sin perderse en los cambios recientes.

## Rama y commit

Repositorio:

```text
https://github.com/nvburgos/Tesis-deteccion-animales.git
```

Rama actual con los cambios:

```text
feacture/mejorar-diseño
```

Ultimo commit subido:

```text
5338db7 prepare WildlifeAI for controlled production pilot
```

## Como descargar los cambios

Si ya tienes el repositorio clonado:

```bash
git fetch origin
git checkout feacture/mejorar-diseño
git pull origin feacture/mejorar-diseño
```

Si todavia no tienes el repositorio:

```bash
git clone https://github.com/nvburgos/Tesis-deteccion-animales.git
cd Tesis-deteccion-animales
git checkout feacture/mejorar-diseño
```

## Instalacion de dependencias

Despues de descargar los cambios:

```bash
npm install
```

Tambien se puede usar `npm ci` si se quiere instalar exactamente lo definido en `package-lock.json`:

```bash
npm ci
```

## Variables de entorno

Crear un archivo `.env` tomando como base `.env.example`.

Variables principales:

```env
DATABASE_URL="postgresql://usuario:password@localhost:5432/wildlifeai?schema=public"
AUTH_SECRET="reemplazar-con-un-secreto-largo-y-aleatorio"
ALLOW_PUBLIC_REGISTRATION="false"

PYTHON_BIN=".venv\\Scripts\\python.exe"
STORAGE_ROOT="storage"

SPECIESNET_ENABLED="true"
SPECIESNET_COUNTRY="ECU"
SPECIESNET_BATCH_SIZE="8"

BATCH_STALE_MINUTES="15"
MAX_BATCH_ATTEMPTS="3"
WORKER_HEARTBEAT_SECONDS="10"
```

Notas:

- `AUTH_SECRET` es obligatorio en produccion.
- `ALLOW_PUBLIC_REGISTRATION=false` evita registro publico libre.
- `STORAGE_ROOT=storage` guarda imagenes y ZIP en almacenamiento privado.
- Si se usa OCR para fechas impresas en imagenes, configurar `TESSERACT_CMD`.

## Base de datos y Prisma

Los cambios incluyen migraciones nuevas no destructivas:

```text
20260719090000_add_batch_worker_operational_fields
20260720090000_add_performance_indexes
20260720110000_add_manual_review_traceability
```

Aplicar migraciones:

```bash
npx prisma migrate deploy
npx prisma generate
```

Validar el esquema:

```bash
npx prisma validate
npx prisma migrate status
```

Importante:

- No usar `prisma migrate reset`.
- No usar `prisma db push --force-reset`.
- No borrar datos existentes.

## Como ejecutar la aplicacion

Terminal 1:

```bash
npm run dev
```

Abrir:

```text
http://localhost:3000
```

Terminal 2, para procesar lotes ZIP:

```bash
npm run worker:batches
```

El worker es necesario para que los lotes ZIP avancen de `Pendiente` a `Procesando` y luego a `Completado`.

## Validaciones recomendadas

Antes de probar funcionalmente:

```bash
npx prisma validate
npx prisma migrate status
npx prisma generate
npm run typecheck
npm run lint
npm test
npm audit
npm run build
```

Resultado esperado actual:

- Prisma valido.
- Migraciones al dia.
- TypeScript correcto.
- `npm test`: 23 pruebas correctas.
- `npm audit`: 0 vulnerabilidades.
- `npm run build`: correcto.
- `npm run lint`: 0 errores, quedan 3 advertencias de hooks no bloqueantes.

## Cambios principales incluidos

### Camaras

- Las camaras ya no estan hardcodeadas.
- Se administran desde PostgreSQL mediante Prisma.
- Hay CRUD completo de camaras.
- Eliminacion logica con `active = false`.
- Endpoints:
  - `GET /api/cameras`
  - `POST /api/cameras`
  - `GET /api/cameras/[id]`
  - `PATCH /api/cameras/[id]`
  - `DELETE /api/cameras/[id]`

### Procesamiento por lotes ZIP

- `POST /api/batches` crea el lote y responde rapido.
- El procesamiento real ocurre en `scripts/batch-worker.js`.
- El worker reclama lotes pendientes de forma atomica.
- Se agregaron campos operativos:
  - `startedAt`
  - `heartbeatAt`
  - `workerId`
  - `attempts`
  - `lastError`
  - `nextRetryAt`
  - `cancelRequestedAt`
- El worker puede detectar lotes atascados y reintentarlos.
- No reprocesa lotes completados.
- Evita duplicar detecciones por logica `batchJobId + imagePath`.

### Seguridad de ZIP y archivos

- Se agrego `python/safe_zip.py`.
- Se valida:
  - ZIP vacio;
  - ZIP corrupto;
  - ZIP Slip;
  - rutas absolutas;
  - `../`;
  - archivos no permitidos;
  - ZIP bombs mediante limites configurables.
- Las imagenes se sirven mediante endpoint protegido:
  - `GET /api/files/[detectionId]`

### Metricas unificadas

- Se centralizo la clasificacion de detecciones en:

```text
src/lib/detectionClassification.ts
```

Reglas importantes:

- `Unknown` no cuenta como especie valida.
- `No CV Result` no cuenta como especie valida.
- `Sin deteccion` no cuenta como especie valida.
- `confidence <= 0` no cuenta como deteccion positiva.
- Las metricas de camara, lote, reportes y estadisticas usan reglas consistentes.

### Revisiones manuales

- Se agrego trazabilidad minima:
  - estado de revision;
  - usuario revisor;
  - especie original;
  - especie corregida;
  - version de revision;
  - nota;
  - fecha de revision.
- Se agrego bloqueo optimista con `reviewVersion`.
- Si dos personas intentan revisar el mismo registro, la segunda recibe conflicto `409`.
- Estados soportados:
  - `Pendiente`
  - `Confirmada`
  - `Corregida`
  - `Sin fauna`
  - `No evaluable`
  - `Descartada`

### Reportes

- El modulo Reportes ahora es global.
- Ruta:

```text
/reports
```

- Ya no depende de `/cameras/[id]`.
- Incluye filtros globales por camaras, periodo, grupo, especie, prioridad, confianza y revision.
- Exportaciones siguen disponibles.

### Estadisticas

- El modulo Estadisticas ahora es global.
- Ruta:

```text
/statistics
```

- Se agrego endpoint:

```text
GET /api/statistics
```

- Usa reglas compartidas de deteccion positiva y especies validas.

### Menu lateral

Se simplifico el menu:

```text
Panel de Control
Especies
Revisiones
----------------
Reportes
Historial
Estadisticas
Usuarios
```

Se eliminaron:

- Mapa de Campo
- Soporte

### Calidad y pruebas

Se agrego ESLint:

```text
eslint.config.mjs
```

Script:

```bash
npm run lint
```

Pruebas agregadas:

```text
tests/batchWorkerPolicy.test.cjs
tests/detectionClassification.test.cjs
tests/manualReviewPolicy.test.cjs
tests/safeZip.test.cjs
tests/securityPolicy.test.cjs
```

## Advertencias conocidas

### Advertencia de build

`npm run build` pasa correctamente, pero muestra una advertencia de Turbopack:

```text
Encountered unexpected file in NFT list
Import trace:
  App Route:
    ./next.config.ts
    ./src/app/api/batches/route.ts
```

No bloquea el piloto controlado, pero debe revisarse antes de produccion completa.

### Advertencias de lint

`npm run lint` queda con 0 errores y 3 advertencias de dependencias de hooks:

- `src/app/historial/page.tsx`
- `src/components/ManualReviewsPanel.tsx`

No bloquean la ejecucion actual.

## Orden recomendado para probar

1. Iniciar PostgreSQL.
2. Configurar `.env`.
3. Ejecutar migraciones.
4. Ejecutar `npm run dev`.
5. Ejecutar `npm run worker:batches`.
6. Iniciar sesion.
7. Ir a `/cameras`.
8. Crear o abrir una camara.
9. Subir un ZIP pequeno.
10. Ver progreso del lote.
11. Revisar resumen, distribucion y tabla.
12. Abrir detalle de deteccion.
13. Probar Revisiones.
14. Probar Reportes.
15. Probar Estadisticas.
16. Probar Historial.

## Comandos rapidos de diagnostico

```bash
git status
npm run typecheck
npm run lint
npm test
npm audit
npm run build
npx prisma validate
npx prisma migrate status
```

## Estado actual

El sistema queda listo para un piloto controlado.

No debe considerarse produccion plena hasta:

- definir supervisor real para el worker;
- probar backups y restauracion;
- resolver la advertencia Turbopack;
- confirmar storage persistente;
- configurar HTTPS;
- validar permisos finales de usuarios.
