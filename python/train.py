from pathlib import Path
import os
import shutil

from ultralytics import YOLO


ROOT = Path(__file__).resolve().parent
DATASET_YAML = ROOT / "dataset" / "data.yaml"
OUTPUT_MODEL = ROOT / "best.pt"
RUNS_ROOT = ROOT / "runs"


def env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def env_value(name, default):
    return os.environ.get(name, default)


def validate_dataset():
    required_paths = [
        ROOT / "dataset" / "train" / "images",
        ROOT / "dataset" / "train" / "labels",
        ROOT / "dataset" / "valid" / "images",
        ROOT / "dataset" / "valid" / "labels",
    ]

    missing = [path for path in required_paths if not path.exists()]

    if missing:
        formatted = "\n".join(f"- {path}" for path in missing)
        raise SystemExit(
            "Dataset YOLO incompleto. Crea estas carpetas antes de entrenar:\n"
            f"{formatted}\n\n"
            "Cada imagen debe tener su .txt en labels con formato YOLO."
        )

    train_images = list((ROOT / "dataset" / "train" / "images").glob("*.*"))
    train_labels = list((ROOT / "dataset" / "train" / "labels").glob("*.txt"))

    val_images = list((ROOT / "dataset" / "valid" / "images").glob("*.*"))
    val_labels = list((ROOT / "dataset" / "valid" / "labels").glob("*.txt"))
    if not train_images or not train_labels or not val_images or not val_labels:
        raise SystemExit(
            "Dataset YOLO vacio. Agrega imagenes y labels antes de entrenar:\n"
            "- python/dataset/train/images\n"
            "- python/dataset/train/labels\n"
            "- python/dataset/valid/images\n"
            "- python/dataset/valid/labels"
        )


def main():
    validate_dataset()

    base_model = env_value("YOLO_BASE_MODEL", "yolov8n.pt")
    epochs = env_int("YOLO_EPOCHS", 25)
    imgsz = env_int("YOLO_IMGSZ", 640)
    batch = env_int("YOLO_BATCH", 8)
    run_name = env_value("YOLO_RUN_NAME", "wildlife-curated")

    model = YOLO(base_model)
    results = model.train(
        data=str(DATASET_YAML),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        project=str(RUNS_ROOT),
        name=run_name,
        exist_ok=True,
    )

    best_model = Path(results.save_dir) / "weights" / "best.pt"

    if not best_model.exists():
        raise SystemExit(f"No se encontro el modelo entrenado en {best_model}")

    shutil.copy2(best_model, OUTPUT_MODEL)
    print(f"Modelo entrenado copiado a {OUTPUT_MODEL}")


if __name__ == "__main__":
    main()
