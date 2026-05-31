Coloca aqui uno o varios datasets exportados en formato YOLOv8.

Ejemplo:

```text
python/datasets_raw/
+-- jaguar/
|   +-- data.yaml
|   +-- train/images/
|   +-- train/labels/
|   +-- valid/images/
|   +-- valid/labels/
+-- tapir/
    +-- data.yaml
    +-- train/images/
    +-- train/labels/
    +-- valid/images/
    +-- valid/labels/
```

Luego ejecuta:

```bash
npm run prepare:dataset
npm run train:yolo
```
