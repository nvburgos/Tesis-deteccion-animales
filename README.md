# WildlifeAI

Dashboard inteligente para analizar imagenes de camaras trampa con Next.js, Prisma, SQLite y un script Python preparado para Ultralytics YOLO.

## Requisitos

- Node.js
- Python 3.11 o 3.12 recomendado
- Opcional para YOLO real: Ultralytics YOLO

No uses Python alpha/beta para YOLO. Si `python --version` muestra algo como `Python 3.15.0a7`, instala Python 3.11 o 3.12 porque `torch` y `ultralytics` pueden no tener paquetes compatibles.

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

- Dashboard con metricas calculadas desde la base de datos.
- Tabla de detecciones recientes con especie, ubicacion, prioridad, fecha y confianza.
- Boton `Nueva Observación` para cargar imagenes.
- Endpoint `POST /api/analyze` que guarda la imagen, ejecuta `python/predict.py`, calcula prioridad y almacena el resultado.
- Endpoint `GET /api/detections` que devuelve detecciones y metricas actualizadas.
- SQLite + Prisma para persistencia local.

## Estructura

```text
wildlife-ai-ui/
+-- prisma/
|   +-- schema.prisma
+-- python/
|   +-- predict.py
|   +-- best.pt              # modelo personalizado futuro
+-- public/
|   +-- uploads/
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
|   +-- lib/
|       +-- database.ts
|       +-- detections.ts
|       +-- prisma.ts
```

## YOLO

`python/predict.py` intenta cargar `python/best.pt`. Si no existe, usa `yolov8n.pt`. Si `ultralytics` no esta instalado, devuelve una prediccion de demostracion para que el flujo completo siga funcionando durante desarrollo.

Para usar deteccion real:

```bash
py -3.12 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r python\requirements.txt
```

Luego coloca el modelo entrenado como:

```text
python/best.pt
```

El entrenamiento recomendado debe hacerse con Ultralytics YOLO y dataset etiquetado en formato YOLO.

Si tienes varias versiones de Python, puedes indicar a Next que use el Python del entorno virtual:

```env
PYTHON_BIN=".venv\\Scripts\\python.exe"
```
