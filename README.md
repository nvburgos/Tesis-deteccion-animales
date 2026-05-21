# WildlifeAI

Dashboard inteligente para analizar imagenes de camaras trampa con Next.js, Prisma, SQLite y Ultralytics YOLO.

## Requisitos

- Node.js
- Python 3.11 o 3.12
- Ultralytics YOLO

No uses Python alpha/beta. Si `python --version` muestra algo como `Python 3.15.0a7`, instala Python 3.11 o 3.12 porque `torch` y `ultralytics` pueden no tener paquetes compatibles.

## Ejecutar

```bash
npm install
npx prisma generate
npm run dev
```

Abre:

```bash
http://localhost:3000
```

## Funcionalidad

- Dashboard con metricas calculadas desde SQLite.
- Tabla de detecciones recientes con especie, ubicacion, prioridad, fecha y confianza.
- Boton `Nueva Observacion` para cargar imagenes.
- Endpoint `POST /api/analyze` que guarda la imagen, ejecuta `python/predict.py`, calcula prioridad y almacena el resultado.
- Endpoint `GET /api/detections` que devuelve detecciones y metricas actualizadas.
- Entrenamiento local con Ultralytics YOLO mediante `python/train.py`.

## Estructura

```text
wildlife-ai-ui/
+-- prisma/
|   +-- schema.prisma
+-- python/
|   +-- predict.py
|   +-- train.py
|   +-- dataset.yaml
|   +-- dataset/
|   |   +-- images/train/
|   |   +-- images/val/
|   |   +-- labels/train/
|   |   +-- labels/val/
|   +-- best.pt
+-- public/
|   +-- uploads/
+-- src/
|   +-- app/api/analyze/route.ts
|   +-- app/api/detections/route.ts
|   +-- components/Dashboard.tsx
|   +-- lib/
```

## Configurar Python

```bash
py -3.12 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r python\requirements.txt
```

En `.env`:

```env
DATABASE_URL="file:./dev.db"
YOLO_MODEL_PATH="python/best.pt"
PYTHON_BIN=".venv\\Scripts\\python.exe"
```

## Entrenar modelo

Coloca tu dataset etiquetado en formato YOLO:

```text
python/dataset/
+-- images/
|   +-- train/
|   +-- val/
+-- labels/
    +-- train/
    +-- val/
```

Las clases deben coincidir con `python/dataset.yaml`:

```text
0: Jaguar
1: Tapir Amazonico
2: Venado Cola Blanca
```

Cada imagen debe tener un `.txt` con anotaciones YOLO en la carpeta `labels` correspondiente.

Entrena:

```bash
npm run train:yolo
```

El script copia automaticamente el mejor peso a:

```text
python/best.pt
```

Despues reinicia Next:

```bash
npm run dev
```

## Nota sobre yolov8n.pt

`yolov8n.pt` es un modelo base entrenado con COCO. No detecta correctamente especies amazonicas como jaguar, tapir amazonico o venado cola blanca. Por eso la API exige `python/best.pt` y evita guardar detecciones falsas cuando falta el modelo entrenado.
