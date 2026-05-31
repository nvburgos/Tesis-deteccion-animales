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
- Mantiene tarjetas superiores de metricas.
- Mantiene una tabla de detecciones recientes.
- Simula una respuesta temporal si todavia no existe un backend disponible en `POST /predict`.

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
  | POST /predict
  v
Backend IA futuro FastAPI
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
POST /predict
```

Si ese endpoint no existe, la interfaz usa esta respuesta simulada:

```json
{
  "species": "Jaguar",
  "confidence": 0.96,
  "priority": "Alta prioridad"
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
|   |   +-- globals.css
|   |   +-- layout.tsx
|   |   +-- page.tsx
|   +-- components/
|   |   +-- Dashboard.tsx
|   |   +-- DetectionResult.tsx
|   |   +-- Header.tsx
|   |   +-- RecentDetections.tsx
|   |   +-- Sidebar.tsx
|   |   +-- StatsCards.tsx
|   |   +-- UploadImage.tsx
|   |   +-- dashboardTypes.ts
|   +-- data/
|   |   +-- mockData.ts
|   +-- lib/
|       +-- database.ts
|       +-- detections.ts
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
| `src/app/layout.tsx` | Layout raiz de Next.js. Define idioma `es`, metadata y carga estilos globales. |
| `src/app/globals.css` | Estilos globales del dashboard: sidebar, header, cards, zona de carga, resultado, tabla y responsive. |

### Endpoints internos de Next.js

| Archivo | Descripcion |
| --- | --- |
| `src/app/api/analyze/route.ts` | Endpoint `POST /api/analyze`. Recibe imagen, la guarda en `public/uploads`, ejecuta `python/predict.py`, calcula prioridad y guarda deteccion en SQLite. |
| `src/app/api/detections/route.ts` | Endpoint `GET /api/detections`. Devuelve metricas y ultimas detecciones desde la base de datos. |

### Componentes React

| Archivo | Descripcion |
| --- | --- |
| `src/components/Dashboard.tsx` | Componente orquestador. Maneja estado de archivo seleccionado, preview, analisis, resultado, metricas y detecciones recientes. |
| `src/components/Sidebar.tsx` | Menu lateral con navegacion y marca WildlifeAI. |
| `src/components/Header.tsx` | Encabezado principal con titulo de tesis y acciones visuales. |
| `src/components/StatsCards.tsx` | Tarjetas superiores: imagenes analizadas, especies detectadas y confianza promedio. |
| `src/components/UploadImage.tsx` | Area drag and drop, input file, vista previa y boton `Analizar imagen`. |
| `src/components/DetectionResult.tsx` | Tarjeta que muestra especie detectada, confianza, prioridad o mensaje de no deteccion. |
| `src/components/RecentDetections.tsx` | Tabla de detecciones recientes con imagen, especie, ubicacion, prioridad, fecha/hora y confianza. |
| `src/components/dashboardTypes.ts` | Tipos TypeScript compartidos: prioridad, resultado, deteccion reciente y metricas. |

### Librerias internas

| Archivo | Descripcion |
| --- | --- |
| `src/lib/prisma.ts` | Crea y reutiliza el cliente Prisma. Evita multiples instancias en desarrollo. |
| `src/lib/database.ts` | Crea la tabla `Detection` si no existe y carga datos iniciales de ejemplo si la base esta vacia. |
| `src/lib/detections.ts` | Normaliza nombres de especies, calcula prioridad y formatea fechas relativas. |

### Datos mock

| Archivo | Descripcion |
| --- | --- |
| `src/data/mockData.ts` | Datos simulados anteriores para metricas y detecciones. Actualmente no es la fuente principal del nuevo dashboard. |

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
| `python/predict.py` | Ejecuta prediccion con YOLO sobre una imagen. Retorna JSON con especie, confianza, coordenadas y modelo usado. |
| `python/train.py` | Entrena un modelo YOLO usando `python/dataset/data.yaml` y copia el mejor peso a `python/best.pt`. |
| `python/prepare_dataset.py` | Une datasets YOLO exportados, remapea clases y genera `python/dataset/data.yaml`. |
| `python/update_labels.py` | Script auxiliar para incrementar IDs de clases en archivos `.txt` de labels. Usar con cuidado. |
| `python/wildlife_classes.yaml` | Catalogo de clases objetivo para entrenamiento. |
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
2. Selecciona o arrastra una imagen.
3. El navegador genera una vista previa local.
4. El usuario presiona **Analizar imagen**.
5. El frontend intenta enviar la imagen a `POST /predict`.
6. Si no hay backend, se usa una prediccion simulada.
7. Se muestra la tarjeta de resultado.
8. Si existe una especie, se agrega una fila a detecciones recientes de la sesion.
9. Las metricas superiores se recalculan en memoria.

### Flujo interno existente con Next API

1. `POST /api/analyze` recibe `FormData`.
2. Guarda la imagen en `public/uploads`.
3. Ejecuta `python/predict.py`.
4. Lee el JSON devuelto por Python.
5. Calcula prioridad con `calculatePriority`.
6. Guarda deteccion en SQLite.
7. Devuelve resultado al cliente.

Este flujo existe, pero la nueva UI esta preparada para el backend futuro en `POST /predict`.

## Contrato esperado para `POST /predict`

El backend futuro debe recibir:

```text
multipart/form-data
image: File
```

Respuesta esperada:

```json
{
  "species": "Jaguar",
  "confidence": 0.96,
  "priority": "Alta prioridad"
}
```

Tambien puede responder cuando no detecta animal:

```json
{
  "species": null,
  "confidence": 0,
  "priority": "Revision manual",
  "message": "No se detecto ningun animal en la imagen."
}
```

## Entrenamiento YOLO

Colocar datasets fuente en:

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
+-- leopard/
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

Entrenar:

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
- Carga local de imagen con drag and drop o selector de archivo.
- Vista previa de imagen.
- Boton de analisis con estado de carga.
- Resultado simulado cuando no existe `POST /predict`.
- Calculo de metricas de la sesion.
- Tabla de detecciones recientes en memoria.
- Build de Next.js.
- Typecheck de TypeScript.
- Endpoints internos `GET /api/detections` y `POST /api/analyze`.
- Persistencia SQLite para el flujo interno `/api/analyze`.
- Scripts base para preparar dataset, entrenar YOLO y predecir.

## Que falta o esta pendiente

- Crear backend Python FastAPI con endpoint `POST /predict`.
- Conectar el frontend al backend real de FastAPI.
- Decidir si se mantiene `POST /api/analyze` o si se reemplaza totalmente por FastAPI.
- Unificar formato de confianza:
  - Frontend nuevo espera `0.96`.
  - Endpoint interno actual puede manejar valores como `96`.
- Unificar prioridades:
  - Frontend usa `Normal`, `Alta prioridad`, `Revision manual`.
  - Utilidad interna actual devuelve `Alta` o `Normal`.
- Guardar en base de datos las detecciones generadas desde el nuevo flujo `/predict`.
- Mostrar cajas de deteccion sobre la imagen usando coordenadas `x1`, `y1`, `x2`, `y2`.
- Agregar seleccion real de camara o ubicacion.
- Agregar autenticacion si el sistema se usara por varios usuarios.
- Agregar manejo de errores visual para imagen invalida, modelo no disponible o backend caido.
- Revisar `python/predict.py`: el fallback llama a `SPECIES_BY_HINT`, pero esa constante no esta definida actualmente.
- Revisar `src/data/mockData.ts`: puede eliminarse o actualizarse si ya no se usa.
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

Estado: funcional en frontend con respuesta simulada para `POST /predict`.

### 2026-05-31

Cambio: Creacion de README completo con tecnologias, arquitectura, descripcion de archivos, estado funcional, pendientes y regla de actualizacion por cambios.

Archivos modificados:

- `README.md`

Estado: documentacion funcional.

