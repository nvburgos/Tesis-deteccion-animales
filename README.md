# WildlifeAI

WildlifeAI es una plataforma web para la tesis: **"Plataforma basada en IA para la deteccion automatizada de vida silvestre en imagenes de camaras trampa"**.

El objetivo del sistema es permitir que un usuario cargue una imagen tomada por una camara trampa, envie esa imagen a un modelo de inteligencia artificial y visualice una prediccion con especie detectada, confianza, prioridad y registro historico de detecciones.

## Estado actual del proyecto

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

Tambien existe una implementacion previa de backend dentro de Next.js usando `POST /api/analyze`, Prisma, SQLite y un script Python con YOLO. Esa parte sirve como base para conectar el flujo definitivo con FastAPI o ajustar el frontend para usar la API interna de Next.

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
- **SQLite**: base de datos local de desarrollo.
- **Node.js**: ejecucion del servidor Next y llamada a scripts Python.

### Inteligencia artificial y procesamiento

- **Python**: scripts de preparacion, entrenamiento y prediccion.
- **Ultralytics YOLO**: modelo de deteccion de objetos.
- **YOLOv8**: base para entrenamiento y prediccion.
- **Modelo actual**: `python/best.pt` detecta solo `leopard`. Todavia no representa las especies objetivo del Proyecto Sacha.

### Base de datos

- **Prisma Client**: cliente para consultar y guardar detecciones.
- **SQLite**: archivo local `prisma/dev.db`.
- Tabla principal: `Detection`.

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
  | procesa imagen con YOLO
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
  -> calcula prioridad
  -> guarda resultado en SQLite con Prisma
  -> retorna JSON
```

## Estructura de carpetas

```text
wildlife-ai-ui/
+-- prisma/
|   +-- schema.prisma
|   +-- dev.db
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
| `.env` | Variables de entorno locales como `DATABASE_URL`, `PYTHON_BIN` y `YOLO_MODEL_PATH`. |
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
| `src/app/api/analyze/route.ts` | Endpoint `POST /api/analyze`. Recibe imagen, la guarda en `public/uploads`, ejecuta `python/predict.py`, calcula prioridad y guarda deteccion en SQLite. |
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
| `prisma/schema.prisma` | Define el datasource SQLite y el modelo `Detection`. |
| `prisma/dev.db` | Base de datos SQLite local de desarrollo. |

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
| `python/predict.py` | Ejecuta prediccion con YOLO sobre una imagen usando `python/best.pt`. Actualmente solo acepta la clase real `leopard`; clases no soportadas devuelven `Sin deteccion`. |
| `python/train.py` | Entrena un modelo YOLO usando `python/dataset/data.yaml` y copia el mejor peso a `python/best.pt`. |
| `python/prepare_dataset.py` | Valida datasets YOLO en `python/datasets_raw`, remapea clases objetivo y genera `python/dataset/data.yaml` solo si hay imagenes y labels validos. |
| `python/update_labels.py` | Script auxiliar para incrementar IDs de clases en archivos `.txt` de labels. Usar con cuidado. |
| `python/wildlife_classes.yaml` | Catalogo inicial de especies objetivo: jaguar, tapir_amazonico, venado_cola_blanca, ocelote y puma. |
| `python/requirements.txt` | Dependencias Python necesarias. |
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
npm run prisma:push
```

Sincroniza el schema Prisma con SQLite.

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
DATABASE_URL="file:./dev.db"
YOLO_MODEL_PATH="python/best.pt"
PYTHON_BIN=".venv\\Scripts\\python.exe"
```

### 3. Configurar Prisma

```bash
npx prisma generate
npm run prisma:push
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

Se recomienda usar Python 3.11 o 3.12.

```bash
py -3.12 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r python\requirements.txt
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
6. Guarda deteccion en SQLite.
7. Devuelve resultado al cliente.

Este es el flujo activo de la UI actual.

## Contrato actual para `POST /api/analyze`

El backend futuro debe recibir:

```text
multipart/form-data
image: File
```

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
- Persistencia SQLite para el flujo interno `/api/analyze`.
- Scripts base para preparar dataset, entrenar YOLO y predecir.
- Prediccion Python sin fallback por nombre de archivo. Si YOLO falla, devuelve `Sin deteccion` con error controlado.
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
