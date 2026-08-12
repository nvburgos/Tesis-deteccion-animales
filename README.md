# WildlifeAI

WildlifeAI es una plataforma web para la tesis: **"Plataforma basada en IA para la deteccion automatizada de vida silvestre en imagenes de camaras trampa"**.

El objetivo del sistema es permitir que un usuario cargue una imagen tomada por una camara trampa, envie esa imagen a un modelo de inteligencia artificial y visualice una prediccion con especie detectada, confianza, prioridad y registro historico de detecciones.

## Estado actual del proyecto

### Resumen actualizado al 2026-07-31

WildlifeAI ya funciona como una plataforma integrada para camaras trampa con:

- Analisis individual y por lotes con SpeciesNet como flujo principal.
- Worker de lotes separado (`npm run worker:batches`) con heartbeat, reintentos y recuperacion de tareas atascadas.
- Registro de camaras con coordenadas en mapa, centrado inicial en Guayaquil.
- OCR opcional de la franja visible de las fotos para extraer fecha/hora, temperatura y codigo visible de camara cuando la imagen lo trae impreso.
- Catalogo local de especies de Ecuador generado desde los PDF de mamiferos, aves y reptiles/anfibios/aves del proyecto.
- Comparacion de cobertura entre el catalogo ecuatoriano y las etiquetas/taxonomia de SpeciesNet.
- Bandeja de revision manual inteligente para casos ambiguos, de baja confianza o con etiquetas amplias como `Mammal`, `Rodent`, `Leopardus Species`, `Possum Family`.
- Buscador de especies enriquecido con nombres comunes en espanol/ingles y nombres cientificos.
- Exportacion de dataset curado a partir de detecciones revisadas/corregidas por investigadores.
- Identificacion tentativa de individuos/reencuentros mediante especie, tiempo, camara, codigo OCR, distancia entre camaras y similitud visual ligera del recorte del animal.
- Vista de individuos supuestos dentro del detalle de especie, con opcion de nombrar animales y comparar dos fotos con decisiones `Mismo individuo`, `Distinto` o `Inseguro`.

Estado importante de IA:

- SpeciesNet sigue siendo el detector/clasificador principal.
- El sistema no pretende detectar automaticamente todas las especies del catalogo ecuatoriano con precision perfecta.
- La estrategia actual es hibrida: SpeciesNet propone, el investigador corrige solo casos importantes/ambiguos, y esas correcciones alimentan un dataset curado.
- La reidentificacion de individuos todavia no es un modelo profundo especializado por manchas o patrones corporales. La version actual usa una heuristica mejorada y una firma visual ligera basada en el recorte del bounding box. Es util como preclasificacion y como apoyo a revision humana, no como confirmacion cientifica definitiva sin validacion.

Validacion reciente:

```text
npm run typecheck -> correcto
npm test -> 40 pruebas correctas
npm run build -> correcto
```

Advertencia conocida no bloqueante:

- `next build` muestra una advertencia de Turbopack/NFT relacionada con tracing desde `next.config.ts` hacia `src/app/api/batches/[id]/route.ts`. La compilacion finaliza correctamente.

El proyecto tiene una interfaz web funcional en Next.js con React y TypeScript. La pantalla principal ya esta adaptada como dashboard de deteccion de vida silvestre:

- Permite seleccionar o arrastrar una imagen.
- Muestra una vista previa de la imagen cargada.
- Tiene boton **Analizar imagen**.
- Muestra estado de procesamiento.
- Renderiza una tarjeta de resultado con especie, confianza y prioridad.
- Muestra la imagen analizada con caja de deteccion cuando el backend devuelve coordenadas.
- Incluye pagina de historial con filtros por especie y fecha.
- Incluye pagina de estadisticas con metricas principales.
- Permite cambiar el idioma visible de la UI entre espanol e ingles con un selector `ES/EN`.
- Traduce nombres comunes de especies en la interfaz sin modificar el valor original guardado en la base de datos.
- Mantiene tarjetas superiores de metricas.
- Mantiene una tabla de detecciones recientes.
- Envia la imagen real al endpoint interno `POST /api/analyze`.
- El analisis de IA se ejecuta en `python/predict.py`. El camino principal usa SpeciesNet, que integra deteccion, clasificacion y ensemble. Si SpeciesNet no puede ejecutarse o se deshabilita, el proyecto usa un respaldo propio con MegaDetector standalone + YOLO.

El backend activo esta dentro de Next.js usando `POST /api/analyze`, Prisma, PostgreSQL y el script Python `python/predict.py`. Actualmente no hay un backend FastAPI separado: la UI usa la API interna de Next.js.

## Tecnologias utilizadas

### Frontend

- **Next.js**: framework principal de React.
- **React**: construccion de componentes de interfaz.
- **TypeScript**: tipado de componentes, estados, respuestas y detecciones.
- **CSS global**: estilos definidos en `src/app/globals.css`.
- **Lucide React**: iconos del dashboard.

### Backend actual dentro del proyecto

- **Next.js API Routes**: endpoints internos en `src/app/api`.
- **Prisma ORM**: acceso a la base de datos.
- **PostgreSQL**: base de datos relacional usada por Prisma.
- **Node.js**: ejecucion del servidor Next y llamada a scripts Python.

### Inteligencia artificial y procesamiento

- **Python**: scripts de preparacion, entrenamiento y prediccion.
- **SpeciesNet**: flujo principal cuando `SPECIESNET_ENABLED` esta activo. En el paquete instalado, SpeciesNet contiene componentes de `detector`, `classifier` y `ensemble`; por eso devuelve tanto prediccion de especie como lista de detecciones.
- **MegaDetector**: aparece de dos formas. Primero, como base/adaptacion dentro del detector de SpeciesNet. Segundo, como llamada standalone desde `python/predict.py` solo cuando SpeciesNet falla o se deshabilita.
- **Ultralytics YOLO / YOLOv8**: clasificador local usado despues del MegaDetector standalone para asignar una especie configurada, o de forma directa si el MegaDetector standalone se deshabilita.
- **Modelo YOLO actual**: `python/best.pt` detecta solo `leopard`. Todavia no representa las especies objetivo del Proyecto Sacha.

### Base de datos

- **Prisma Client**: cliente para consultar y guardar detecciones.
- **PostgreSQL**: base de datos configurada con `DATABASE_URL`.
- Tablas principales: `User`, `Detection` y `BatchJob`.

## Arquitectura general

```text
Usuario
  |
  v
Interfaz Next.js / React
  |
  | selecciona imagen
  | preview local
  | POST /api/analyze
  v
Backend interno Next.js
  |
  | guarda imagen en public/uploads
  | ejecuta python/predict.py
  v
Python predict.py
  |
  | 1. SpeciesNet integrado si esta habilitado
  |    - detector + clasificador + ensemble
  | 2. si SpeciesNet no puede ejecutarse o esta deshabilitado:
  |    - MegaDetector standalone + YOLO
  | 3. si el MegaDetector standalone esta deshabilitado:
  |    - YOLO directo
  v
Respuesta JSON
  |
  v
Dashboard muestra resultado y actualiza tabla
```

Actualmente el frontend llama a:

```text
POST /api/analyze
```

La interfaz ya no usa respuestas simuladas en frontend. Muestra la respuesta real del backend.

```json
{
  "species": "Leopard",
  "confidence": 48.64,
  "priority": "Normal"
}
```

Tambien existe este flujo interno de Next.js:

```text
POST /api/analyze
  -> guarda imagen en public/uploads
  -> ejecuta python/predict.py
     -> intenta SpeciesNet
        -> SpeciesNet ejecuta su flujo integrado de detector, clasificador y ensemble
        -> de esa salida se toman especie, confianza y detecciones
     -> si SpeciesNet no puede ejecutarse o se deshabilita, intenta MegaDetector standalone
     -> si MegaDetector standalone detecta animal, clasifica especie con YOLO
     -> si MegaDetector standalone no detecta animal, devuelve Sin deteccion
     -> si MegaDetector standalone se deshabilita, ejecuta YOLO directo
  -> calcula prioridad
  -> guarda resultado en PostgreSQL con Prisma
  -> retorna JSON
```

Importante: SpeciesNet y MegaDetector no deben entenderse como dos pasos independientes que siempre se ejecutan uno despues del otro en nuestro codigo. SpeciesNet ya incluye un detector y combina detecciones con clasificacion. La llamada separada a `megadetector` en `python/predict.py` es un respaldo operativo cuando SpeciesNet no se puede usar.

## Estructura de carpetas

```text
wildlife-ai-ui/
+-- prisma/
|   +-- schema.prisma
+-- public/
|   +-- uploads/
+-- python/
|   +-- predict.py
|   +-- prepare_dataset.py
|   +-- train.py
|   +-- update_labels.py
|   +-- wildlife_classes.yaml
|   +-- requirements.txt
|   +-- datasets_raw/
+-- src/
|   +-- app/
|   |   +-- api/
|   |   |   +-- analyze/route.ts
|   |   |   +-- detections/route.ts
|   |   +-- estadisticas/page.tsx
|   |   +-- globals.css
|   |   +-- historial/page.tsx
|   |   +-- layout.tsx
|   |   +-- page.tsx
|   +-- components/
|   |   +-- Dashboard.tsx
|   |   +-- DetectionImage.tsx
|   |   +-- DetectionResult.tsx
|   |   +-- Header.tsx
|   |   +-- RecentDetections.tsx
|   |   +-- Sidebar.tsx
|   |   +-- SpeciesGallery.tsx
|   |   +-- StatsCards.tsx
|   |   +-- UploadImage.tsx
|   |   +-- dashboardTypes.ts
|   +-- lib/
|       +-- database.ts
|       +-- detections.ts
|       +-- i18n.ts
|       +-- prisma.ts
+-- package.json
+-- tsconfig.json
+-- next.config.ts
+-- README.md
```

## Descripcion de archivos principales

### Raiz del proyecto

| Archivo | Descripcion |
| --- | --- |
| `package.json` | Define dependencias, scripts de desarrollo, build, TypeScript, Prisma y comandos Python. |
| `package-lock.json` | Bloquea versiones instaladas de dependencias npm. |
| `tsconfig.json` | Configuracion de TypeScript. |
| `next.config.ts` | Configuracion de Next.js. |
| `.env` | Variables de entorno locales como `DATABASE_URL`, `PYTHON_BIN`, `SPECIESNET_ENABLED`, `MEGADETECTOR_ENABLED`, `SPECIESNET_COUNTRY`, `MEGADETECTOR_THRESHOLD` y `YOLO_MODEL_PATH`. |
| `.gitignore` | Archivos y carpetas ignoradas por Git. |
| `DESIGN.md` | Documento de referencia visual del diseno. |
| `README.md` | Documento principal del proyecto. Debe actualizarse cada vez que se realicen cambios. |

### Carpeta `src/app`

| Archivo | Descripcion |
| --- | --- |
| `src/app/page.tsx` | Pagina principal. Renderiza el componente `Dashboard`. |
| `src/app/historial/page.tsx` | Pagina de historial con filtros por especie y fecha. |
| `src/app/estadisticas/page.tsx` | Pagina de estadisticas con metricas y resumen por especie. |
| `src/app/layout.tsx` | Layout raiz de Next.js. Define idioma `es`, metadata y carga estilos globales. |
| `src/app/globals.css` | Estilos globales del dashboard: sidebar, header, cards, zona de carga, resultado, tabla y responsive. |

### Endpoints internos de Next.js

| Archivo | Descripcion |
| --- | --- |
| `src/app/api/analyze/route.ts` | Endpoint `POST /api/analyze`. Valida sesion, recibe imagen, la guarda en `public/uploads`, ejecuta `python/predict.py`, calcula prioridad y guarda deteccion en PostgreSQL. |
| `src/app/api/detections/route.ts` | Endpoint `GET /api/detections`. Devuelve metricas, coordenadas y detecciones. Soporta `limit=all`, `species` y `date`. |

### Componentes React

| Archivo | Descripcion |
| --- | --- |
| `src/components/Dashboard.tsx` | Componente orquestador. Maneja estado de archivo seleccionado, preview, analisis, resultado, metricas, detecciones recientes e idioma activo. |
| `src/components/Sidebar.tsx` | Menu lateral con navegacion y marca WildlifeAI. |
| `src/components/Header.tsx` | Encabezado principal con acciones visuales y selector de idioma `ES/EN`. |
| `src/components/StatsCards.tsx` | Tarjetas superiores: imagenes analizadas, especies detectadas y confianza promedio. |
| `src/components/UploadImage.tsx` | Area drag and drop, input file, vista previa y boton `Analizar imagen`. |
| `src/components/DetectionImage.tsx` | Visor de imagen analizada con bounding box, etiqueta de especie, confianza y mensaje visual cuando no hay deteccion. |
| `src/components/DetectionResult.tsx` | Tarjeta que muestra especie detectada, confianza, prioridad, mensaje de no deteccion y caja visual de deteccion cuando hay coordenadas. Traduce especie y prioridad segun el idioma activo. |
| `src/components/RecentDetections.tsx` | Tabla de detecciones recientes con imagen, especie traducida, ubicacion, prioridad, fecha/hora y confianza. |
| `src/components/SpeciesGallery.tsx` | Vista de galeria por especie detectada. Agrupa por el nombre original guardado y muestra la etiqueta traducida segun idioma. |
| `src/components/dashboardTypes.ts` | Tipos TypeScript compartidos: prioridad, resultado, deteccion reciente, metricas, vistas del dashboard e idioma. |

### Librerias internas

| Archivo | Descripcion |
| --- | --- |
| `src/lib/prisma.ts` | Crea y reutiliza el cliente Prisma. Evita multiples instancias en desarrollo. |
| `src/lib/database.ts` | Crea la tabla `Detection` si no existe y carga datos iniciales de ejemplo si la base esta vacia. |
| `src/lib/detections.ts` | Normaliza nombres de especies, calcula prioridad y formatea fechas relativas. |
| `src/lib/i18n.ts` | Diccionario interno de UI `es/en`, tipo `Language` y traducciones de nombres comunes de especies para presentacion. |

### Prisma y base de datos

| Archivo | Descripcion |
| --- | --- |
| `prisma/schema.prisma` | Define el datasource PostgreSQL y los modelos `User`, `Detection` y `BatchJob`. |

Modelo `Detection`:

```prisma
model Detection {
  id          Int      @id @default(autoincrement())
  imagePath   String
  species     String
  confidence  Float
  location    String
  priority    String
  x1          Float?
  y1          Float?
  x2          Float?
  y2          Float?
  createdAt   DateTime @default(now())
}
```

### Carpeta Python

| Archivo | Descripcion |
| --- | --- |
| `python/predict.py` | Orquesta el flujo de IA. Primero intenta SpeciesNet, que integra detector, clasificador y ensemble. Si SpeciesNet no puede ejecutarse o se deshabilita, usa MegaDetector standalone para detectar animales y YOLO para clasificar la especie. Si el MegaDetector standalone se deshabilita, ejecuta YOLO directo. |
| `python/train.py` | Entrena un modelo YOLO usando `python/dataset/data.yaml` y copia el mejor peso a `python/best.pt`. |
| `python/prepare_dataset.py` | Valida datasets YOLO en `python/datasets_raw`, remapea clases objetivo y genera `python/dataset/data.yaml` solo si hay imagenes y labels validos. |
| `scripts/generate-ecuador-species-catalog.py` | Extrae nombres cientificos desde los PDF de mamiferos, aves y reptiles entregados para generar el catalogo local de especies. |
| `python/update_labels.py` | Script auxiliar para incrementar IDs de clases en archivos `.txt` de labels. Usar con cuidado. |
| `python/wildlife_classes.yaml` | Catalogo inicial de especies objetivo: jaguar, tapir_amazonico, venado_cola_blanca, ocelote y puma. |
| `python/requirements.txt` | Dependencias Python necesarias: `speciesnet`, `megadetector`, `ultralytics` y utilidades como `pypdf`. |
| `python/datasets_raw/` | Carpeta donde se colocan datasets fuente exportados en formato YOLO. |

### Carpeta Public

| Carpeta | Descripcion |
| --- | --- |
| `public/uploads/` | Imagenes subidas por usuarios o pruebas. Se sirven publicamente desde `/uploads/...`. |

## Scripts disponibles

```bash
npm run dev
```

Inicia el servidor de desarrollo de Next.js.

```bash
npm run build
```

Genera build de produccion.

```bash
npm run start
```

Ejecuta la aplicacion despues del build.

```bash
npm run typecheck
```

Ejecuta TypeScript sin emitir archivos.

```bash
npm run prisma:generate
```

Genera Prisma Client.

```bash
npm run prisma:migrate -- --name init_postgresql
```

Ejecuta migraciones Prisma contra PostgreSQL.

```bash
npm run prepare:dataset
```

Prepara el dataset multi-clase desde `python/datasets_raw/`.

```bash
npm run train:yolo
```

Entrena YOLO y copia el mejor modelo a `python/best.pt`.

```bash
npm run predict:yolo
```

Ejecuta el script de prediccion Python. Requiere pasar o adaptar una ruta de imagen segun el uso del script.

## Instalacion y ejecucion

### 1. Instalar dependencias Node

```bash
npm install
```

### 2. Configurar variables de entorno

Crear o revisar `.env`:

```env
DATABASE_URL="postgresql://usuario:password@localhost:5432/wildlifeai?schema=public"
SPECIESNET_ENABLED="1"
SPECIESNET_COUNTRY="ECU"
SPECIESNET_TIMEOUT="120"
MEGADETECTOR_ENABLED="1"
MEGADETECTOR_MODEL="MDV5A"
MEGADETECTOR_THRESHOLD="0.2"
YOLO_MODEL_PATH="python/best.pt"
PYTHON_BIN=".venv\\Scripts\\python.exe"
```

### 3. Configurar PostgreSQL y Prisma

WildlifeAI usaba antes SQLite. La configuracion actual usa PostgreSQL mediante Prisma y el archivo `prisma/dev.db` fue eliminado. Antes de ejecutar migraciones, crea la base de datos `wildlifeai` en PostgreSQL y ajusta el usuario/password en `.env`.

Formato esperado:

```env
DATABASE_URL="postgresql://usuario:password@localhost:5432/wildlifeai?schema=public"
```

Ejecutar la migracion inicial y regenerar Prisma Client:

```bash
npx prisma migrate dev --name init_postgresql
npx prisma generate
```

Para abrir Prisma Studio:

```bash
npx prisma studio
```

### 4. Ejecutar frontend

```bash
npm run dev
```

Abrir:

```text
http://localhost:3000
```

## Configuracion de Python

Se recomienda usar Python 3.11 para mayor estabilidad con paquetes de vision por computador y machine learning. Python 3.12 tambien puede usarse, pero requiere ONNX `>=1.16.2` para evitar compilaciones locales de versiones antiguas.

```bash
py -3.11 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r python\requirements.txt
```

La instalacion principal incluye SpeciesNet, Ultralytics YOLO y ONNX compatible:

```bash
python -m pip install -r python/requirements.txt
```

MegaDetector standalone se mantiene como fallback opcional. Si quieres activar ese respaldo, instala:

```bash
python -m pip install -r python/requirements-fallback.txt
```

No se recomienda usar versiones alpha o beta de Python porque `torch` y `ultralytics` pueden no tener paquetes compatibles.

## Flujo funcional actual

### Flujo de interfaz

1. El usuario entra al dashboard.
2. Puede cambiar el idioma visible de la UI con el selector `ES/EN`.
3. Selecciona o arrastra una imagen.
4. El navegador genera una vista previa local.
5. El usuario presiona **Analizar imagen**.
6. El frontend envia la imagen a `POST /api/analyze`.
7. El backend guarda la imagen, ejecuta `python/predict.py` y devuelve la prediccion real.
8. Se muestra la tarjeta de resultado.
9. La tabla se recarga desde `GET /api/detections`.
10. Las metricas superiores se recalculan con las detecciones reales cargadas.
11. Los textos de UI, especies, prioridades conocidas y fechas visibles se muestran segun el idioma activo.

### Flujo interno existente con Next API

1. `POST /api/analyze` recibe `FormData`.
2. Guarda la imagen en `public/uploads`.
3. Ejecuta `python/predict.py`.
4. Lee el JSON devuelto por Python.
5. Calcula prioridad con `calculatePriority`.
6. Guarda deteccion en PostgreSQL.
7. Devuelve resultado al cliente.

Este es el flujo activo de la UI actual.

## Flujo de inteligencia artificial

El archivo central del flujo de IA es:

```text
python/predict.py
```

El orden real de ejecucion en `python/predict.py` es:

1. **SpeciesNet integrado**
   - Se ejecuta primero si `SPECIESNET_ENABLED` no esta apagado.
   - Usa `SPECIESNET_COUNTRY`, que por defecto es `ECU`.
   - SpeciesNet no es solo un clasificador aislado. El paquete instalado incluye componentes de detector, clasificador y ensemble.
   - El detector de SpeciesNet esta adaptado a partir de MegaDetector, y el ensemble combina clasificaciones y detecciones.
   - En nuestro script, `run_speciesnet()` llama a `python -m speciesnet.scripts.run_model` y lee el JSON resultante.
   - De esa salida se toma `prediction`, `prediction_score`, `detections`, `model_version` y `rawLabel`.
   - Si SpeciesNet no encuentra animales, responde `Sin deteccion`.
   - Si detecta animal pero no asigna especie concreta, responde `Sin deteccion` con confianza/coordenadas del animal detectado.

2. **MegaDetector standalone + YOLO**
   - Se ejecuta solo si SpeciesNet no puede ejecutarse, lanza error o si `SPECIESNET_ENABLED=0`.
   - Esta llamada a MegaDetector es independiente del detector que SpeciesNet usa internamente.
   - MegaDetector standalone detecta si existe un animal en la imagen.
   - Usa `MEGADETECTOR_MODEL`, por defecto `MDV5A`.
   - Usa `MEGADETECTOR_THRESHOLD`, por defecto `0.2`.
   - Si MegaDetector standalone no detecta animal, el flujo responde `Sin deteccion`.
   - Si MegaDetector standalone detecta animal, YOLO intenta clasificar la especie.

3. **YOLO directo**
   - Se ejecuta si `MEGADETECTOR_ENABLED=0` despues de que SpeciesNet no se uso o no pudo ejecutarse.
   - Usa `YOLO_MODEL_PATH`.
   - Si `YOLO_MODEL_PATH` no existe, intenta `python/best.pt`.
   - Si tampoco existe `python/best.pt`, usa `yolov8n.pt`.
   - En este momento `DISPLAY_SPECIES` solo acepta la clase `leopard`.
   - Si YOLO devuelve una clase no configurada, responde `Sin deteccion` con `warning`.

### Variables de entorno del flujo IA

| Variable | Uso | Valor por defecto |
| --- | --- | --- |
| `PYTHON_BIN` | Ejecutable usado por Next.js para correr `python/predict.py`. | `python` |
| `SPECIESNET_ENABLED` | Activa/desactiva SpeciesNet. Valores como `0`, `false`, `no` u `off` lo apagan. | activo |
| `SPECIESNET_COUNTRY` | Pais usado por SpeciesNet para ajustar prediccion geografica. | `ECU` |
| `SPECIESNET_TIMEOUT` | Tiempo maximo para ejecutar SpeciesNet, en segundos. | `120` |
| `MEGADETECTOR_ENABLED` | Activa/desactiva la llamada standalone a MegaDetector usada como respaldo operativo fuera de SpeciesNet. No controla el detector interno de SpeciesNet. | activo |
| `MEGADETECTOR_MODEL` | Modelo a cargar cuando se usa MegaDetector standalone. | `MDV5A` |
| `MEGADETECTOR_THRESHOLD` | Umbral minimo para aceptar detecciones de MegaDetector standalone. | `0.2` |
| `YOLO_MODEL_PATH` | Ruta del modelo YOLO local. | `python/best.pt` si existe; si no, `yolov8n.pt` |

### Salidas posibles de `python/predict.py`

El script siempre imprime al final una linea JSON para que `src/app/api/analyze/route.ts` pueda leerla.

Salida con especie identificada:

```json
{
  "species": "Leopard",
  "confidence": 87.42,
  "coordinates": [120.5, 30.2, 430.8, 310.4],
  "animalDetected": true,
  "detector": "SpeciesNet",
  "model": "modelo_usado",
  "rawLabel": "etiqueta_original",
  "message": "SpeciesNet identifico la especie como Leopard."
}
```

Salida con animal detectado pero sin especie concreta:

```json
{
  "species": "Sin deteccion",
  "confidence": 63.25,
  "coordinates": [120.5, 30.2, 430.8, 310.4],
  "animalDetected": true,
  "message": "SpeciesNet detecto un animal, pero no asigno una especie concreta."
}
```

Salida sin animal:

```json
{
  "species": "Sin deteccion",
  "confidence": 0,
  "coordinates": null,
  "animalDetected": false,
  "message": "SpeciesNet no encontro animales en la imagen."
}
```

Salida de error controlado:

```json
{
  "species": "Sin deteccion",
  "confidence": 0,
  "coordinates": null,
  "error": "No se pudo ejecutar el flujo de deteccion: detalle del error"
}
```

## Contrato actual para `POST /api/analyze`

El endpoint actual recibe:

```text
multipart/form-data
image: File
location?: string
```

Requiere una sesion valida. Si no existe sesion, responde `401` con `Sesion requerida`.

Proceso interno del endpoint:

1. Verifica cookie de autenticacion.
2. Ejecuta `ensureDatabase()`.
3. Recibe la imagen desde `FormData`.
4. Guarda la imagen en `public/uploads`.
5. Ejecuta `python/predict.py` usando `PYTHON_BIN`.
6. Lee la ultima linea JSON impresa por Python.
7. Calcula prioridad con `calculatePriority`.
8. Guarda la deteccion en PostgreSQL con Prisma.
9. Devuelve el resultado al frontend.

Respuesta esperada:

```json
{
  "species": "Leopard",
  "confidence": 48.64,
  "imagePath": "/uploads/archivo.jpg",
  "location": "Camara 01 | Zona Norte",
  "priority": "Normal",
  "createdAt": "2026-05-31T09:36:00.000Z",
  "coordinates": [312.25, 0, 510, 288]
}
```

Tambien puede responder cuando no detecta animal:

```json
{
  "species": "Sin deteccion",
  "confidence": 0,
  "priority": "Revision manual",
  "coordinates": null
}
```

## Idioma y traduccion de especies

La aplicacion incluye un selector visual `ES/EN` en el encabezado del dashboard.

El idioma activo se guarda en:

```text
localStorage["wildlifeai-language"]
```

La traduccion se aplica en la capa de presentacion:

- El backend y la base de datos conservan el valor original de `species`.
- `src/lib/i18n.ts` contiene el tipo `Language`, los textos de UI para `es` y `en`, y un diccionario de especies comunes.
- `getSpeciesLabel(species, language)` normaliza nombres con espacios, guiones, guiones bajos y acentos antes de buscar la traduccion.
- La tabla de detecciones, tarjeta de resultado y galeria muestran la especie traducida segun el idioma activo.
- La galeria agrupa por el nombre original guardado, no por la traduccion visible, para evitar duplicados al cambiar idioma.
- Las prioridades conocidas tambien se muestran traducidas visualmente en ingles, pero internamente siguen usando `Normal`, `Alta prioridad` y `Revision manual`.

Ejemplo:

```text
Valor guardado: Leopard
UI en espanol: Leopardo
UI en ingles: Leopard
```

## Entrenamiento YOLO

El modelo actual `python/best.pt` se conserva y por ahora solo detecta `leopard`. Todavia falta recibir imagenes reales del Proyecto Sacha para entrenar las especies objetivo de WildlifeAI.

## Catalogo ecuatoriano de especies

El proyecto incluye `src/lib/ecuadorSpeciesCatalog.ts`, generado desde los PDF entregados el 2026-07-27:

- `Mamiferos del Ecuador: lista oficial actualizada de especies`, version 2023.2.
- `Lista Roja de las Aves del Ecuador`, 2019.
- `Lista Roja de los Reptiles del Ecuador`, 2005.

Este catalogo alimenta las sugerencias de revision manual y permite clasificar nombres cientificos por grupo taxonomico. No significa que el modelo detecte automaticamente todas esas especies: para eso se necesitan imagenes reales anotadas y entrenamiento/validacion del modelo. La extraccion de reptiles proviene de un PDF con OCR antiguo, por lo que debe revisarse antes de usarla como fuente de entrenamiento.

Para regenerar el catalogo desde los PDF:

```bash
python scripts/generate-ecuador-species-catalog.py --mammals-pdf "C:\ruta\mamiferos.pdf" --birds-pdf "C:\ruta\aves.pdf" --reptiles-pdf "C:\ruta\reptiles.pdf"
```

Especies objetivo iniciales:

```text
0: jaguar
1: tapir_amazonico
2: venado_cola_blanca
3: ocelote
4: puma
```

Cuando existan imagenes reales anotadas, colocar datasets fuente en:

```text
python/datasets_raw/
```

Ejemplo:

```text
python/datasets_raw/
+-- jaguar/
|   +-- data.yaml
|   +-- train/images/
|   +-- train/labels/
|   +-- valid/images/
|   +-- valid/labels/
+-- tapir_amazonico/
    +-- data.yaml
    +-- train/images/
    +-- train/labels/
    +-- valid/images/
    +-- valid/labels/
```

Preparar dataset:

```bash
npm run prepare:dataset
```

`prepare_dataset.py` valida que existan imagenes y labels. Si faltan carpetas, imagenes o archivos `.txt`, muestra un mensaje claro, no reemplaza `python/dataset` y no se debe entrenar.

Entrenar solo despues de recibir imagenes reales del Proyecto Sacha, preparar correctamente el dataset y revisar `python/dataset/data.yaml`:

```bash
npm run train:yolo
```

El modelo entrenado se copia a:

```text
python/best.pt
```

## Que esta funcional

- Interfaz principal del dashboard.
- Sidebar, header, cards, tabla y estilos responsive.
- Selector de idioma `ES/EN` en el header.
- Persistencia del idioma elegido en `localStorage`.
- Traduccion visual de textos principales de la UI entre espanol e ingles.
- Traduccion visual de nombres comunes de especies sin alterar el valor original guardado por el modelo.
- Galeria de especies detectadas con etiquetas traducidas.
- Carga local de imagen con drag and drop o selector de archivo.
- Vista previa de imagen.
- Boton de analisis con estado de carga.
- Envio real de imagen a `POST /api/analyze`.
- Log en consola del navegador con `console.log("Respuesta backend:", data)`.
- Visualizacion de bounding box con especie y confianza sobre la imagen analizada.
- Pagina `/historial` con filtro por especie y fecha.
- Pagina `/estadisticas` con total de imagenes, total de detecciones, especies detectadas y confianza promedio.
- Calculo de metricas de la sesion.
- Tabla de detecciones recientes cargada desde `GET /api/detections`.
- Caja de deteccion sobre la imagen cuando el backend devuelve coordenadas.
- Build de Next.js.
- Typecheck de TypeScript.
- Endpoints internos `GET /api/detections` y `POST /api/analyze`.
- Persistencia PostgreSQL para el flujo interno `/api/analyze`.
- Flujo IA en `python/predict.py` con SpeciesNet como camino principal integrado: detector, clasificador y ensemble.
- Respaldo operativo con MegaDetector standalone + YOLO cuando SpeciesNet no puede ejecutarse o se deshabilita.
- Ejecucion directa de YOLO si el MegaDetector standalone esta deshabilitado.
- Scripts base para preparar dataset, entrenar YOLO y predecir.
- Prediccion Python sin fallback por nombre de archivo. Si el flujo IA falla, devuelve `Sin deteccion` con error controlado.
- Configuracion inicial de especies objetivo en `python/wildlife_classes.yaml`.
- Validaciones en `prepare_dataset.py` para no preparar datasets incompletos.

## Que falta o esta pendiente

- Crear backend Python FastAPI si se decide separar la IA del backend Next.js.
- Recibir imagenes reales anotadas del Proyecto Sacha.
- Colocar los datasets reales en `python/datasets_raw`.
- Ejecutar `npm run prepare:dataset` solo cuando existan imagenes y labels reales.
- Entrenar YOLO solo despues de validar el dataset preparado.
- Conectar el frontend a FastAPI solo cuando exista ese backend.
- Decidir si se mantiene `POST /api/analyze` o si se reemplaza por FastAPI.
- Persistir tambien los errores de ejecucion YOLO si se desea auditarlos historicamente.
- Persistir de forma separada `detector`, `model`, `rawLabel`, `animalDetected` y `animalConfidence` si se desea auditoria completa del flujo IA.
- Mejorar la visualizacion de cajas cuando existan multiples detecciones en una misma imagen.
- Agregar seleccion real de camara o ubicacion.
- Agregar autenticacion si el sistema se usara por varios usuarios.
- Agregar manejo de errores visual para imagen invalida, modelo no disponible o backend caido.
- Ampliar `DISPLAY_SPECIES` solo cuando `best.pt` realmente contenga nuevas clases entrenadas.
- Actualizar `python/predict.py` despues de entrenar un nuevo `best.pt` con jaguar, tapir_amazonico, venado_cola_blanca, ocelote y puma.
- Ampliar el diccionario `src/lib/i18n.ts` si SpeciesNet o YOLO devuelven nuevas especies que deban mostrarse traducidas.
- Agregar pruebas automatizadas de componentes y endpoints.
- Documentar despliegue cuando se defina ambiente final.

## Reglas para futuros cambios

Cada vez que se realice un cambio en el proyecto, este README debe actualizarse.

Como minimo, actualizar:

1. **Estado actual del proyecto** si cambia lo que ya funciona.
2. **Descripcion de archivos principales** si se crea, elimina o modifica un archivo importante.
3. **Que esta funcional** si se completa una nueva funcionalidad.
4. **Que falta o esta pendiente** si se agrega o se resuelve una tarea.
5. **Bitacora de cambios** con fecha, descripcion y archivos modificados.

Formato recomendado:

```text
Fecha: AAAA-MM-DD
Cambio: descripcion breve del cambio.
Archivos modificados:
- ruta/archivo.ext
Estado: funcional, pendiente o en revision.
```

## Bitacora de cambios

### 2026-06-03

Cambio: Actualizacion del README para documentar de forma exacta el flujo actual de IA: SpeciesNet como camino principal integrado con detector, clasificador y ensemble; MegaDetector standalone + YOLO como respaldo operativo; YOLO directo si el MegaDetector standalone esta deshabilitado.

Archivos modificados:

- `README.md`

Estado: documentacion funcional. El README ahora especifica las variables de entorno, el contrato de `POST /api/analyze`, las salidas posibles de `python/predict.py`, el rol integrado de SpeciesNet y la diferencia entre el detector interno de SpeciesNet y la llamada standalone a MegaDetector.

### 2026-06-02

Cambio: Implementacion de selector de idioma `ES/EN` para la UI y traduccion visual de especies, prioridades conocidas y textos principales sin modificar los datos originales guardados por el modelo.

Archivos modificados:

- `src/lib/i18n.ts`
- `src/components/Dashboard.tsx`
- `src/components/Header.tsx`
- `src/components/Sidebar.tsx`
- `src/components/StatsCards.tsx`
- `src/components/UploadImage.tsx`
- `src/components/DetectionResult.tsx`
- `src/components/RecentDetections.tsx`
- `src/components/SpeciesGallery.tsx`
- `src/components/dashboardTypes.ts`
- `src/app/globals.css`
- `README.md`

Estado: funcional. El idioma se guarda en `localStorage`, las especies se traducen solo al mostrarse y las validaciones `npm run typecheck` y `npm run build` pasaron correctamente.

### 2026-05-31

Cambio: Adaptacion del dashboard a la tesis de deteccion automatizada de vida silvestre.

Archivos modificados:

- `src/components/Dashboard.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Header.tsx`
- `src/components/StatsCards.tsx`
- `src/components/UploadImage.tsx`
- `src/components/DetectionResult.tsx`
- `src/components/RecentDetections.tsx`
- `src/components/dashboardTypes.ts`
- `src/app/globals.css`

Estado: reemplazado. El frontend ahora usa `POST /api/analyze` y ya no usa respuesta simulada.

### 2026-05-31

Cambio: Creacion de README completo con tecnologias, arquitectura, descripcion de archivos, estado funcional, pendientes y regla de actualizacion por cambios.

Archivos modificados:

- `README.md`

Estado: documentacion funcional.

### 2026-05-31

Cambio: Correccion de `python/predict.py` para eliminar predicciones falsas por nombre de archivo y limitar la salida a clases reales del modelo.

Archivos modificados:

- `python/predict.py`
- `README.md`

Estado: funcional. El script usa `python/best.pt`, imprime las clases reales del modelo con `model.names`, solo soporta `leopard` por ahora y devuelve `Sin deteccion` si YOLO falla o detecta una clase no soportada.

### 2026-05-31

Cambio: Correccion del flujo completo de analisis para eliminar el resultado quemado de Jaguar en frontend.

Archivos modificados:

- `src/components/Dashboard.tsx`
- `src/components/DetectionResult.tsx`
- `src/components/RecentDetections.tsx`
- `src/components/dashboardTypes.ts`
- `src/app/api/analyze/route.ts`
- `src/lib/database.ts`
- `src/lib/detections.ts`
- `src/data/mockData.ts`
- `README.md`

Estado: funcional. El boton `Analizar imagen` usa `POST /api/analyze`, registra `Respuesta backend` en consola, recarga la tabla desde `GET /api/detections`, no usa datos simulados y se eliminaron seeds antiguos de Jaguar/Venado/Tapir en SQLite.

### 2026-05-31

Cambio: Mejora visual de WildlifeAI con bounding boxes, historial filtrable y estadisticas.

Archivos modificados:

- `src/components/DetectionImage.tsx`
- `src/components/DetectionResult.tsx`
- `src/components/Dashboard.tsx`
- `src/components/RecentDetections.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Header.tsx`
- `src/components/StatsCards.tsx`
- `src/components/dashboardTypes.ts`
- `src/app/api/analyze/route.ts`
- `src/app/api/detections/route.ts`
- `src/app/historial/page.tsx`
- `src/app/estadisticas/page.tsx`
- `src/app/globals.css`
- `README.md`

Estado: funcional. El resultado muestra la imagen con caja de deteccion, especie y confianza cuando hay coordenadas; si no hay deteccion muestra "No se detecto ningun animal". Se agregaron paginas de historial y estadisticas, filtros por especie/fecha, y metricas de imagenes analizadas, detecciones, especies y confianza promedio.

### 2026-05-31

Cambio: Preparacion de configuracion de especies objetivo para WildlifeAI sin entrenar ni reemplazar el modelo actual.

Archivos modificados:

- `python/wildlife_classes.yaml`
- `python/prepare_dataset.py`
- `README.md`

Estado: preparacion funcional. `wildlife_classes.yaml` define jaguar, tapir_amazonico, venado_cola_blanca, ocelote y puma. `prepare_dataset.py` valida datasets reales en `datasets_raw` antes de generar `python/dataset/data.yaml`. No se entreno el modelo, no se borro `python/best.pt` y no se elimino el dataset actual de leopard.

## Flujo por camaras trampa

WildlifeAI organiza ahora las imagenes por **camara trampa** antes de iniciar el analisis. Las camaras representan el origen de las imagenes capturadas; no son dispositivos conectados en tiempo real dentro del sistema.

El sistema no muestra ni gestiona datos operativos de hardware como bateria, senal, temperatura, estado en linea o transmision en vivo. Cada camara funciona como una entidad de organizacion para asociar cargas, lotes, detecciones, estadisticas, reportes e historial.

Flujo principal actualizado:

```text
Usuario
  -> ingresa al Panel de Control
  -> selecciona una camara trampa
  -> carga imagen individual o ZIP asociado a esa camara
  -> ejecuta analisis con SpeciesNet / fallback IA
  -> consulta resultado, lotes, detecciones recientes, historial y reportes filtrados por camara
```

Rutas principales del flujo:

```text
/cameras        -> listado de camaras trampa
/cameras/[id]   -> detalle operativo de una camara
```

Las camaras se almacenan exclusivamente en PostgreSQL mediante Prisma. No existe un seed, arreglo, mock o archivo JSON con camaras predefinidas; si la tabla no contiene registros activos, `/cameras` muestra el estado vacio y permite crear la primera camara desde la interfaz.

CRUD de camaras:

```text
GET /api/cameras          -> lista camaras activas
POST /api/cameras         -> crea una camara
GET /api/cameras/[id]     -> obtiene una camara activa
PATCH /api/cameras/[id]   -> actualiza una camara
DELETE /api/cameras/[id]  -> eliminacion logica con active = false
```

Endpoints actualizados para `cameraId`:

```text
POST /api/analyze       -> requiere cameraId y guarda Detection.cameraId
GET /api/detections     -> acepta cameraId para filtrar
POST /api/batches       -> requiere cameraId y guarda BatchJob.cameraId
GET /api/batches        -> acepta cameraId para filtrar
```

Modelo Prisma agregado:

```prisma
model Camera {
  id          Int         @id @default(autoincrement())
  code        String      @unique
  name        String
  zone        String
  description String?
  active      Boolean     @default(true)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  detections  Detection[]
  batchJobs   BatchJob[]
}
```

`Detection.cameraId` y `BatchJob.cameraId` son opcionales temporalmente para conservar registros existentes sin camara asociada. Para migrar datos antiguos despues, se debe elegir una camara destino por lote o por deteccion y actualizar esos registros con un script o consulta controlada; no se deben reasignar automaticamente sin validacion del usuario.

### 2026-07-18

Cambio: Reorganizacion del flujo principal por camaras trampa. Se agrego el modelo `Camera`, relaciones opcionales en `Detection` y `BatchJob`, endpoints de camaras, rutas `/cameras` y `/cameras/[id]`, tarjetas de camaras y detalle operativo filtrado por camara.

Archivos modificados:

- `prisma/schema.prisma`
- `prisma/migrations/20260718000000_add_cameras/migration.sql`
- `src/lib/database.ts`
- `src/lib/predictionRunner.ts`
- `src/app/api/cameras/route.ts`
- `src/app/api/cameras/[id]/route.ts`
- `src/app/api/analyze/route.ts`
- `src/app/api/batches/route.ts`
- `src/app/api/detections/route.ts`
- `src/app/cameras/page.tsx`
- `src/app/cameras/[id]/page.tsx`
- `src/app/page.tsx`
- `src/app/historial/page.tsx`
- `src/app/estadisticas/page.tsx`
- `src/components/CamerasPanel.tsx`
- `src/components/CameraCard.tsx`
- `src/components/CameraDetail.tsx`
- `src/components/RecentDetections.tsx`
- `src/components/ReportsPanel.tsx`
- `src/components/Sidebar.tsx`
- `src/components/dashboardTypes.ts`
- `src/app/globals.css`
- `README.md`

Estado: pendiente de aplicar migracion en PostgreSQL. La migracion es no destructiva y conserva datos existentes dejando `cameraId` opcional.


## Procesamiento de lotes en segundo plano

El procesamiento de archivos ZIP se separo en dos responsabilidades:

```text
Next.js
  -> POST /api/batches
  -> valida ZIP, camara y sesion
  -> crea BatchJob en PostgreSQL con status Pendiente
  -> guarda el ZIP en public/uploads/batches/{batchId}/
  -> calcula totalImages leyendo las entradas del ZIP cuando es posible
  -> responde inmediatamente con batchId, status y totalImages

Worker local
  -> npm run worker:batches
  -> busca BatchJob con status Pendiente
  -> reclama el lote con updateMany(id + status Pendiente)
  -> cambia status a Procesando
  -> extrae el ZIP
  -> procesa cada imagen con el flujo SpeciesNet existente
  -> guarda Detection con cameraId y batchJobId
  -> actualiza processedImages y failedImages durante el procesamiento
  -> marca Completado o Con errores y registra completedAt
```

Comandos de ejecucion local:

```bash
npm run dev
npm run worker:batches
```

`npm run dev` inicia la aplicacion Next.js. `npm run worker:batches` debe permanecer activo en otra terminal para procesar los lotes pendientes. Para pruebas controladas puede ejecutarse una sola iteracion con:

```bash
npm run worker:batches -- --once
```

El progreso se consulta desde:

```text
GET /api/batches/[id]
```

La respuesta incluye `totalImages`, `processedImages`, `failedImages`, `pendingImages`, `percentage`, `detectionsFound`, `createdAt` y `completedAt`. La interfaz consulta este endpoint cada 3 segundos desde `BatchProgress.tsx` hasta que el lote queda en `Completado`, `Con errores` o `Fallido`.

El worker evita procesar dos veces el mismo lote usando una actualizacion atomica:

```ts
updateMany({
  where: { id: pendingJob.id, status: 'Pendiente' },
  data: { status: 'Procesando' }
})
```

Si `count` no es `1`, el lote ya fue tomado por otro proceso y el worker no lo procesa.
## Preparacion para produccion controlada: worker de lotes

El procesamiento ZIP depende de un worker Node independiente. En produccion no debe ejecutarse manualmente como una terminal olvidada; debe estar supervisado por PM2, Windows Service, systemd o Docker Compose, segun el ambiente final.

Comando local:

```bash
npm run worker:batches
```

Ejecucion de una sola iteracion para diagnostico:

```bash
npm run worker:batches -- --once
```

Variables operativas del worker:

| Variable | Uso | Valor recomendado |
| --- | --- | --- |
| `BATCH_STALE_MINUTES` | Minutos sin heartbeat para considerar un lote atascado. | `15` |
| `MAX_BATCH_ATTEMPTS` | Intentos maximos antes de marcar un lote como `Fallido`. | `3` |
| `WORKER_HEARTBEAT_SECONDS` | Frecuencia de actualizacion de `heartbeatAt`. | `10` |
| `WORKER_ID` | Identificador fijo opcional del worker. Si no existe, se genera automaticamente. | vacio |
| `PROGRESS_MICROBATCH_SIZE` | Cantidad de imagenes por microbatch de progreso. `1` emite y guarda avance por imagen. | `1` |

Campos operativos agregados a `BatchJob`:

```prisma
startedAt DateTime?
heartbeatAt DateTime?
workerId String?
attempts Int @default(0)
lastError String?
nextRetryAt DateTime?
cancelRequestedAt DateTime?
```

Comportamiento operativo:

1. El worker busca lotes `Pendiente` cuyo `nextRetryAt` este vacio o vencido.
2. Reclama el lote atomicamente con `updateMany` usando `id + status`.
3. Al reclamar asigna `workerId`, `startedAt`, `heartbeatAt`, limpia errores previos e incrementa `attempts`.
4. Durante el procesamiento actualiza `heartbeatAt` y contadores de progreso.
5. Si encuentra lotes `Procesando` con heartbeat vencido, los reencola si `attempts < MAX_BATCH_ATTEMPTS`.
6. Si el lote supera los intentos, lo marca como `Fallido` y guarda el motivo en `lastError`.
7. No reprocesa lotes `Completado`.
8. No borra detecciones parciales automaticamente.
9. Para evitar duplicados, antes de crear una deteccion consulta si ya existe `Detection` para el mismo `batchJobId + imagePath`.
10. En `SIGINT` o `SIGTERM`, el worker intenta cerrar el proceso Python y deja el lote reencolable o fallido segun los intentos.

Health check protegido:

```text
GET /api/health
```

Requiere sesion de administrador. Verifica:

- Next.js activo;
- conexion a PostgreSQL;
- migraciones Prisma sin fallos pendientes;
- existencia del storage configurado;
- heartbeat reciente del worker;
- cantidad de lotes pendientes y en procesamiento.

El endpoint no expone credenciales ni rutas fisicas del servidor.

### 2026-07-19

Cambio: Fase 4 del plan de correccion final. Se agregaron campos operativos no destructivos a `BatchJob`, heartbeat, reclamacion atomica con `workerId`, recuperacion de lotes atascados, reintentos controlados, fallo definitivo, cierre por seÃƒÂ±ales, health check protegido y pruebas de politica del worker.

Archivos modificados:

- `prisma/schema.prisma`
- `prisma/migrations/20260719090000_add_batch_worker_operational_fields/migration.sql`
- `scripts/batch-worker.js`
- `scripts/batch-worker-utils.js`
- `tests/batchWorkerPolicy.test.cjs`
- `src/app/api/health/route.ts`
- `src/app/api/batches/[id]/route.ts`
- `.env.example`
- `README.md`

Estado: migracion no destructiva aplicada. El worker ahora puede recuperarse de lotes atascados y evita duplicar detecciones mediante comprobacion logica por `batchJobId + imagePath`.
## Fase 5: paginacion y rendimiento

Se eliminaron cargas ilimitadas del historial global. La pagina `/historial` ya no usa `limit=all`; ahora consulta `GET /api/detections` con paginacion y filtros server-side.

Parametros soportados por `GET /api/detections`:

```text
page
pageSize
cameraId
researcherId
species
date
batchJobId
```

Respuesta paginada:

```json
{
  "detections": [],
  "availableSpecies": [],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 0,
    "totalPages": 1
  }
}
```

`GET /api/batches` tambien responde con paginacion:

```text
page
pageSize
cameraId
```

El resumen de `GET /api/batches/[id]` dejo de cargar todas las detecciones del lote para contar especies y detecciones. Ahora usa consultas agregadas (`count` y `groupBy`) para calcular:

- detecciones con fauna;
- imagenes sin deteccion;
- distribucion de especies;
- especies distintas.

`GET /api/cameras/[id]/stats` usa `groupBy` para especies distintas en lugar de cargar filas completas.

Pendiente recomendado: agregar indices no destructivos sobre columnas usadas por filtros frecuentes. Esa migracion debe aprobarse antes de aplicarse.

### 2026-07-20

Cambio: Fase 5 parcial del plan de correccion final. Se agrego paginacion server-side a historial y lotes, se eliminaron cargas ilimitadas desde `/historial`, y se optimizaron conteos de lote y estadisticas de camara con agregaciones Prisma.

Archivos modificados:

- `src/app/api/detections/route.ts`
- `src/app/historial/page.tsx`
- `src/app/api/batches/route.ts`
- `src/app/api/batches/[id]/route.ts`
- `src/app/api/cameras/[id]/stats/route.ts`
- `README.md`

Estado: funcional sin cambios de esquema. Pendiente de aprobacion: migracion no destructiva de indices para consultas frecuentes.
Migracion de indices aplicada en Fase 5:

```text
prisma/migrations/20260720090000_add_performance_indexes/migration.sql
```

Indices agregados:

```text
Detection.batchJobId
Detection.userId
Detection.species
Detection.priority
Detection.createdAt
Detection.manualReviewedAt
Detection(cameraId, createdAt)
Detection(cameraId, capturedAt)
Detection(batchJobId, species)
BatchJob.status
BatchJob.userId
BatchJob.createdAt
BatchJob.completedAt
BatchJob(cameraId, status)
```

La migracion solo ejecuta `CREATE INDEX`. No elimina, renombra ni modifica columnas existentes.

## Fase 6: revisiones manuales y trazabilidad

Se agrego trazabilidad minima no destructiva al modelo `Detection` para registrar el estado formal de revision, el usuario revisor, la especie original, la especie corregida y una version de revision para bloqueo optimista.

Campos agregados a `Detection`:

```prisma
manualReviewStatus String?
reviewedById Int?
reviewedBy User? @relation("DetectionReviewer", fields: [reviewedById], references: [id], onDelete: SetNull)
manualOriginalSpecies String?
manualCorrectedSpecies String?
reviewVersion Int @default(0)
```

Relacion agregada a `User`:

```prisma
reviewedDetections Detection[] @relation("DetectionReviewer")
```

Estados soportados:

- `Pendiente`
- `Confirmada`
- `Corregida`
- `Sin fauna`
- `No evaluable`
- `Descartada`

Comportamiento del guardado:

1. El frontend envia `reviewVersion` junto con la especie revisada y la observacion.
2. `PATCH /api/detections` compara esa version con la version actual en PostgreSQL.
3. Si la version cambio, responde `409 Conflict` con el mensaje `Esta revision fue modificada por otro investigador.`
4. Si la version coincide, guarda `manualReviewedAt`, `manualReviewStatus`, `reviewedById`, `manualOriginalSpecies`, `manualCorrectedSpecies`, `manualReviewNote` e incrementa `reviewVersion`.
5. La accion `Descartar imagen` no borra archivos; marca la deteccion como `Descartada` y conserva auditoria.

La clasificacion de estados se centraliza en `src/lib/manualReviewPolicy.ts`. Los modulos de Reportes, Estadisticas, Dashboard y detalle de camara usan la misma regla para contar revisiones pendientes, manteniendo compatibilidad con registros antiguos que solo tienen `priority = "Revision manual"` y `manualReviewedAt = null`.

## Fase 7: calidad, lint y pruebas minimas

Se agrego ESLint con configuracion flat compatible con TypeScript, React y hooks. El script disponible es:

```bash
npm run lint
```

El lint analiza:

```text
src
scripts
tests
next.config.ts
```

Se excluyen artefactos y dependencias locales como `.next`, `.venv`, `.tmp`, `node_modules`, `storage`, `public/uploads` y migraciones Prisma.

Pruebas automatizadas disponibles:

```bash
npm test
```

Cobertura minima actual:

- reglas de clasificacion de detecciones;
- especies invalidas y `Unknown`;
- politica de revisiones manuales;
- seguridad de ZIP;
- politicas de worker, heartbeat y reintentos;
- firma y validacion de sesiones;
- `AUTH_SECRET` obligatorio en produccion;
- verificacion de origen para mutaciones;
- rate limiting basico;
- lectura de IP cliente desde headers de proxy.

Resultado de validacion de Fase 7:

```text
npm run typecheck -> correcto
npm run lint -> 0 errores, 3 advertencias de hooks existentes
npm test -> 23 pruebas correctas
npm run build -> correcto
```

Advertencias pendientes no bloqueantes:

- dependencias de `useEffect` en `src/app/historial/page.tsx`;
- dependencias de `useEffect` en `src/components/ManualReviewsPanel.tsx`.

## Fase 8: dependencias y vulnerabilidades

Auditoria ejecutada:

```bash
npm audit
npm outdated
```

Problema encontrado:

- `postcss < 8.5.10` llegaba como dependencia transitiva de `next@16.2.6`.
- `npm audit fix --force` proponia bajar Next a `9.3.3`, lo cual no es aceptable porque rompe la arquitectura actual de App Router y Next 16.

Correccion aplicada:

```json
"overrides": {
  "postcss": "8.5.20"
}
```

Resultado:

```text
npm ls postcss -> next@16.2.6 usa postcss@8.5.20 overridden
npm audit -> 0 vulnerabilidades
npm run typecheck -> correcto
npm run lint -> 0 errores, 3 advertencias
npm test -> 23 pruebas correctas
npm run build -> correcto
```

No se ejecutaron actualizaciones mayores de Next, Prisma, TypeScript, React ni ESLint 10 para evitar rupturas de compatibilidad antes del piloto controlado.

## Fase 9: documentacion operativa y preparacion de produccion

### Arquitectura operativa

WildlifeAI se ejecuta como cinco piezas coordinadas:

| Capa | Responsabilidad |
| --- | --- |
| Next.js App Router | Interfaz, rutas protegidas y API interna. |
| PostgreSQL | Persistencia de usuarios, camaras, lotes y detecciones. |
| Prisma | ORM, migraciones y cliente de acceso a datos. |
| Worker Node | Reclama `BatchJob`, extrae ZIP seguros, ejecuta Python y actualiza progreso. |
| Python / SpeciesNet | Inferencia de fauna, coordenadas, fecha de captura y salida JSON por imagen. |

### Requisitos de entorno

| Requisito | Recomendacion para piloto controlado |
| --- | --- |
| Node.js | Version compatible con Next 16. Verificar con `node --version`. |
| npm | Usar `npm ci` en despliegue para respetar `package-lock.json`. |
| Python | Entorno virtual dedicado con dependencias de SpeciesNet instaladas. |
| PostgreSQL | Base persistente con backups automaticos. |
| Tesseract | Opcional; requerido solo para OCR de fechas visibles. |
| CPU/GPU | CPU funciona; GPU CUDA mejora tiempos de SpeciesNet si esta disponible. |
| Storage | Directorio persistente, no efimero, para uploads y ZIP procesados. |

### Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexion PostgreSQL usada por Prisma. |
| `AUTH_SECRET` | Secreto HMAC de sesiones. Obligatorio en produccion. |
| `ALLOW_PUBLIC_REGISTRATION` | Controla registro publico. Recomendado `false`. |
| `RESEND_API_KEY` | API key de Resend para enviar OTP por correo y notificaciones de lotes. En desarrollo, si no existe, el OTP se imprime en consola. |
| `EMAIL_FROM` | Remitente verificado para correos transaccionales. |
| `META_WHATSAPP_ACCESS_TOKEN` | Token permanente o de sistema para enviar mensajes con WhatsApp Cloud API. |
| `META_WHATSAPP_PHONE_NUMBER_ID` | ID del numero de telefono de WhatsApp Business en Meta. |
| `META_WHATSAPP_API_VERSION` | Version de Graph API usada para mensajes. Valor por defecto: `v23.0`. |
| `META_WHATSAPP_TEMPLATE_LANGUAGE` | Idioma de las plantillas aprobadas. Valor por defecto: `es`. |
| `META_WHATSAPP_OTP_TEMPLATE_NAME` | Plantilla aprobada de autenticacion para enviar el OTP de registro. |
| `META_WHATSAPP_OTP_BUTTON_SUBTYPE` | Tipo del boton OTP de la plantilla. Valor por defecto: `copy_code`. |
| `META_WHATSAPP_BATCH_TEMPLATE_NAME` | Plantilla aprobada para avisar al investigador cuando termina un lote. |
| `PYTHON_BIN` | Ejecutable Python usado por Next.js y worker. |
| `YOLO_MODEL_PATH` | Modelo local de respaldo si aplica. |
| `STORAGE_ROOT` | Raiz privada de almacenamiento. Recomendado `storage`. |
| `MAX_ZIP_SIZE_MB` | Tamano maximo del ZIP recibido. |
| `MAX_ZIP_ENTRIES` | Numero maximo de entradas internas del ZIP. |
| `MAX_UNCOMPRESSED_SIZE_MB` | Tamano maximo total descomprimido. |
| `MAX_COMPRESSION_RATIO` | Proteccion contra ZIP bombs. |
| `BATCH_STALE_MINUTES` | Minutos sin heartbeat para considerar lote atascado. |
| `MAX_BATCH_ATTEMPTS` | Reintentos maximos antes de marcar `Fallido`. |
| `WORKER_HEARTBEAT_SECONDS` | Frecuencia de heartbeat del worker. |
| `WORKER_ID` | Identificador fijo opcional del worker. |
| `BATCH_WORKER_POLL_MS` | Intervalo de busqueda de lotes pendientes. |
| `BATCH_WORKER_STEP_WARN_MS` | Umbral para advertir pasos lentos del worker. |
| `SPECIESNET_ENABLED` | Activa SpeciesNet. |
| `SPECIESNET_COUNTRY` | Geofence de SpeciesNet. Para Ecuador: `ECU`. |
| `SPECIESNET_TIMEOUT` | Timeout del analisis individual. |
| `SPECIESNET_BATCH_SIZE` | Tamano de lote interno para inferencia batch. |
| `PROGRESS_MICROBATCH_SIZE` | Cantidad de imagenes por microbatch antes de emitir resultados al worker. |
| `SPECIESNET_BATCH_TIMEOUT_MS` | Timeout operativo del procesamiento batch. |
| `MEGADETECTOR_ENABLED` | Activa respaldo MegaDetector standalone. |
| `MEGADETECTOR_MODEL` | Modelo MegaDetector de respaldo. |
| `MEGADETECTOR_THRESHOLD` | Umbral del detector de respaldo. |
| `ANALYSIS_MAX_IMAGE_DIMENSION` | Redimensionamiento maximo para analisis individual. |
| `TESSERACT_CMD` | Ruta/comando de Tesseract si se usa OCR. |
| `CAPTURE_DATE_FILENAME_FORMAT` | Formato esperado para fecha en nombre de archivo. |
| `CAPTURE_DATE_OCR_FORMAT` | Formato OCR: `MDY`, `DMY` o `YMD`. |

### Despliegue recomendado

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

El worker debe ejecutarse como proceso supervisado separado:

```bash
npm run worker:batches
```

Opciones recomendadas segun ambiente:

- Linux: `systemd` o Docker Compose.
- Windows: PM2 o Windows Service.
- Contenedores: servicio `web` para Next.js y servicio `worker` para lotes.

No se recomienda depender de una terminal abierta manualmente para produccion.

### Backups

Base de datos:

```bash
pg_dump "$DATABASE_URL" > wildlifeai_YYYYMMDD.sql
```

Politica minima para piloto:

- backup diario de PostgreSQL;
- retencion minima de 7 a 30 dias;
- prueba de restauracion antes del lanzamiento;
- backup del directorio `STORAGE_ROOT` junto con la base;
- documentar responsable y ubicacion de respaldos.

### Uploads y almacenamiento

- Usar `STORAGE_ROOT` en disco persistente.
- No usar filesystem efimero de serverless para ZIP o imagenes.
- Servir imagenes mediante `GET /api/files/[detectionId]`, no mediante URL publica directa.
- Mantener compatibilidad temporal con archivos antiguos en `public/uploads` hasta migrarlos.
- Validar permisos del directorio para que solo la aplicacion y el worker puedan leer/escribir.

### Logs

Logs esperados:

- API: errores con `console.error`, sin credenciales ni rutas sensibles.
- Worker: pasos numerados, duracion, heartbeat, memoria y errores completos.
- Python: eventos JSON por linea para carga de modelo, dispositivo, progreso y resultado por imagen.

Logs temporales removidos o normalizados:

- `[batch-debug]`
- `[reports]`
- `[statistics]`
- `Respuesta backend:`

Pendiente recomendado: introducir `LOG_LEVEL` y logger estructurado antes de produccion completa.

### Health check

Endpoint protegido:

```text
GET /api/health
```

Debe usarse para monitorear:

- conectividad PostgreSQL;
- migraciones pendientes;
- storage disponible;
- lotes pendientes/en procesamiento;
- heartbeat reciente del worker.

### Checklist operativo previo al piloto

- `npm ci` ejecutado sin errores.
- `npx prisma migrate deploy` aplicado.
- `npm run build` correcto.
- `npm audit` en 0 vulnerabilidades criticas/altas/moderadas.
- Worker supervisado.
- Backups probados.
- `STORAGE_ROOT` persistente.
- `AUTH_SECRET` real configurado.
- `ALLOW_PUBLIC_REGISTRATION=false` salvo decision explicita.
- HTTPS/proxy configurado antes de exponer la aplicacion.

## Actualizacion 2026-07-31: revision inteligente, dataset curado e individuos

Esta actualizacion registra el estado actual posterior a las mejoras de especies, revision humana asistida e identificacion tentativa de individuos.

### Revision inteligente de especies

La plataforma ahora manda a revision manual los resultados demasiado amplios o ambiguos, incluso cuando SpeciesNet detecta fauna con confianza razonable. Ejemplos:

- `Mammal`
- `Rodent`
- `Bird`
- `Leopardus Species`
- `Didelphis Species`
- `Possum Family`
- `Weasel Family`

El panel `ManualReviewsPanel` prioriza la cola por motivo de revision:

- etiqueta amplia;
- baja confianza;
- prioridad alta;
- ausencia de bounding box;
- validacion requerida.

Tambien muestra filtros rapidos y sugerencias de especies probables para acelerar correcciones. Las sugerencias son reglas de apoyo basadas en el catalogo local, no una prediccion adicional de IA.

### Busqueda de especies por nombre comun y cientifico

El catalogo de sugerencias ahora permite buscar especies por:

- nombre comun en espanol;
- nombre comun en ingles;
- nombre cientifico;
- etiqueta original.

Ejemplos soportados:

- `Ocelote` / `Ocelot` / `Leopardus pardalis`
- `Tigrillo` / `Margay` / `Leopardus wiedii`
- `Tapir amazonico` / `Lowland tapir` / `Tapirus terrestris`
- `Guanta` / `Lowland paca` / `Cuniculus paca`
- `Cabeza de mate` / `Tayra` / `Eira barbara`

### Dataset curado

Se agrego exportacion de dataset curado desde detecciones revisadas:

```bash
npm run export:dataset
```

Tambien existe endpoint CSV:

```text
GET /api/datasets/curated
```

El dataset curado usa registros con revision humana confirmada o corregida. Esto permite convertir el trabajo normal del investigador en datos reutilizables para entrenamiento o evaluacion futura.

### Reencuentros e individuos supuestos

El modelo `Individual` ya esta conectado con `Detection`. Cada deteccion puede guardar:

- `individualId`
- `individualMatchStatus`
- `individualMatchConfidence`
- `individualMatchBasis`

El matcher automatico usa una heuristica combinada:

- misma especie;
- intervalo temporal entre capturas;
- misma camara solo como evidencia fuerte si el intervalo es corto;
- codigo visible de camara extraido por OCR;
- distancia entre camaras cuando existen coordenadas;
- zona como respaldo debil;
- confianza del candidato;
- similitud visual ligera del recorte del animal.

La regla fue ajustada para evitar asumir que el mismo animal reaparece solo porque esta en la misma camara despues de muchos dias. Camaras distintas pero cercanas pueden sumar evidencia si el intervalo temporal es plausible.

### Comparacion visual de individuos

En el detalle de especie, dentro del apartado `Individuos supuestos`, el investigador puede:

- ver grupos de individuos propuestos;
- poner nombre a un individuo;
- comparar dos fotos lado a lado;
- decidir `Mismo individuo`, `Distinto` o `Inseguro`.

La comparacion muestra:

- porcentaje de similitud visual del recorte;
- diferencia de tiempo entre capturas;
- si las detecciones vienen de la misma camara o de camaras distintas.

La similitud visual actual se calcula con `sharp` a partir del bounding box. Se recorta el animal, se normaliza una firma visual pequena y se compara con similitud coseno. Esta tecnica es ligera y util como apoyo, pero no reemplaza un modelo especializado de reidentificacion visual.

### Archivos principales agregados o modificados

- `src/components/ManualReviewsPanel.tsx`
- `src/components/SpeciesGallery.tsx`
- `src/app/api/individuals/[id]/route.ts`
- `src/app/api/individuals/review/route.ts`
- `src/app/api/datasets/curated/route.ts`
- `src/lib/individualMatching.ts`
- `src/lib/visualSignature.ts`
- `scripts/individual-matching-utils.js`
- `scripts/visual-signature-utils.js`
- `scripts/export-curated-dataset.js`
- `src/lib/detectionClassification.ts`
- `src/lib/speciesTaxonomy.ts`
- `src/lib/i18n.ts`
- `tests/individualMatching.test.cjs`
- `tests/detectionClassification.test.cjs`
- `tests/speciesTaxonomyCatalog.test.cjs`

### Estado de validacion

Ultima validacion local:

```text
npm run typecheck -> correcto
npm test -> 40 pruebas correctas
npm run build -> correcto
```

Advertencia conocida:

- `npm run build` muestra una advertencia no bloqueante de Turbopack/NFT sobre tracing desde `next.config.ts` hacia la ruta de batches. La compilacion termina correctamente.
