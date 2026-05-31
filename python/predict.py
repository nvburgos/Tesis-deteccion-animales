import json
import os
import sys


DISPLAY_SPECIES = {
    "leopard": "Leopard",
}


def normalize_label(label):
    return label.replace("_", " ").replace("-", " ").strip().lower()


def to_display_species(label):
    normalized = normalize_label(label)

    if normalized in DISPLAY_SPECIES:
        return DISPLAY_SPECIES[normalized]

    return None


def is_configured_species(label):
    normalized = normalize_label(label)
    return normalized in DISPLAY_SPECIES


def get_model_path():
    model_path = os.environ.get("YOLO_MODEL_PATH", "python/best.pt")

    if not os.path.isabs(model_path):
        model_path = os.path.join(os.getcwd(), model_path)

    return model_path


def predict_with_yolo(image_path):
    from ultralytics import YOLO

    model_path = get_model_path()

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"YOLO model not found at {model_path}")

    model = YOLO(model_path)
    print(f"YOLO model classes: {model.names}")
    results = model(image_path, verbose=False)

    if not results or len(results[0].boxes) == 0:
        return {
            "species": "Sin deteccion",
            "confidence": 0,
            "coordinates": None,
            "model": os.path.basename(model_path),
        }

    boxes = results[0].boxes
    best_index = int(boxes.conf.argmax().item())
    class_id = int(boxes.cls[best_index].item())
    raw_label = results[0].names[class_id]

    if not is_configured_species(raw_label):
        return {
            "species": "Sin deteccion",
            "confidence": 0,
            "coordinates": None,
            "rawLabel": raw_label,
            "model": os.path.basename(model_path),
            "warning": f"Unsupported YOLO label '{raw_label}'.",
        }

    species = to_display_species(raw_label)
    confidence = round(float(boxes.conf[best_index].item()) * 100, 2)
    coordinates = [round(float(value), 2) for value in boxes.xyxy[best_index].tolist()]

    return {
        "species": species,
        "confidence": confidence,
        "coordinates": coordinates,
        "rawLabel": raw_label,
        "model": os.path.basename(model_path),
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Image path is required"}))
        sys.exit(1)

    image_path = sys.argv[1]

    try:
        result = predict_with_yolo(image_path)
    except Exception:
        result = {
            "species": "Sin deteccion",
            "confidence": 0,
            "coordinates": None,
            "error": "No se pudo ejecutar el modelo YOLO",
        }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
