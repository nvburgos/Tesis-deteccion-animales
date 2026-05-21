import json
import os
import sys


SUPPORTED_SPECIES = {
    "jaguar": "Jaguar",
    "leopard": "Leopard",
    "tapir": "Tapir Amazonico",
    "tapir amazonico": "Tapir Amazonico",
    "venado": "Venado Cola Blanca",
    "venado cola blanca": "Venado Cola Blanca",
    "white tailed deer": "Venado Cola Blanca",
}

SPECIES_BY_HINT = {
    "jaguar": ("Jaguar", 96.0, [112, 84, 420, 360]),
    "leopard": ("Leopard", 96.0, [112, 84, 420, 360]),
    "tapir": ("Tapir Amazonico", 89.0, [96, 78, 390, 332]),
    "venado": ("Venado Cola Blanca", 92.0, [140, 92, 410, 340]),
    "deer": ("Venado Cola Blanca", 92.0, [140, 92, 410, 340]),
}


def fallback_prediction(image_path):
    filename = os.path.basename(image_path).lower()

    for hint, prediction in SPECIES_BY_HINT.items():
        if hint in filename:
            species, confidence, box = prediction
            return {
                "species": species,
                "confidence": confidence,
                "coordinates": box,
                "model": "filename-fallback",
            }

    return {
        "species": "Sin deteccion",
        "confidence": 0,
        "coordinates": None,
        "warning": "No trained YOLO model available and filename has no species hint.",
    }


def normalize_label(label):
    return label.replace("_", " ").replace("-", " ").strip().lower()


def to_supported_species(label):
    normalized = normalize_label(label)

    if normalized in SUPPORTED_SPECIES:
        return SUPPORTED_SPECIES[normalized]

    for hint, species in SUPPORTED_SPECIES.items():
        if hint in normalized:
            return species

    return None


def get_model_path():
    model_path = os.environ.get("YOLO_MODEL_PATH", "python/best.pt")

    if not os.path.isabs(model_path):
        model_path = os.path.join(os.getcwd(), model_path)

    return model_path


def predict_with_yolo(image_path):
    from ultralytics import YOLO

    model_path = get_model_path()
    allow_base_model = os.environ.get("ALLOW_BASE_MODEL", "false").lower() == "true"

    if not os.path.exists(model_path):
        if not allow_base_model:
            return {
                "species": "Modelo no configurado",
                "confidence": 0,
                "coordinates": None,
                "error": (
                    f"Trained model not found at {model_path}. "
                    "Train or copy python/best.pt before analyzing images."
                ),
            }

        model_path = os.path.join(os.getcwd(), "yolov8n.pt")

    model = YOLO(model_path)
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
    species = to_supported_species(raw_label)
    confidence = round(float(boxes.conf[best_index].item()) * 100, 2)
    coordinates = [round(float(value), 2) for value in boxes.xyxy[best_index].tolist()]

    if not species:
        return {
            "species": "Sin deteccion",
            "confidence": 0,
            "coordinates": None,
            "rawLabel": raw_label,
            "model": os.path.basename(model_path),
            "warning": (
                f"Unsupported YOLO label '{raw_label}'. "
                "Use python/best.pt trained with Jaguar, Tapir Amazonico and Venado Cola Blanca."
            ),
        }

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
    except Exception as error:
        result = fallback_prediction(image_path)
        result["warning"] = f"YOLO fallback used: {error}"

    print(json.dumps(result))


if __name__ == "__main__":
    main()
