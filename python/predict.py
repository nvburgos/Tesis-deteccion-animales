import json
import os
import sys


DISPLAY_SPECIES = {
    "leopard": "Leopard",
    "boar": "Jabali",
    "cheetah": "Chita",
    "elephant": "Elefante",
    "lion": "Leon",
    "deer": "Venado",
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


def to_display_species(label):
    normalized = normalize_label(label)

    if normalized in DISPLAY_SPECIES:
        return DISPLAY_SPECIES[normalized]

    for hint, species in DISPLAY_SPECIES.items():
        if hint in normalized:
            return species

    return normalized.title()


def is_configured_species(label):
    normalized = normalize_label(label)

    if normalized in DISPLAY_SPECIES:
        return True

    return any(hint in normalized for hint in DISPLAY_SPECIES)


def get_model_path():
    model_path = os.environ.get("YOLO_MODEL_PATH", "python/best.pt")

    if not os.path.isabs(model_path):
        model_path = os.path.join(os.getcwd(), model_path)

    return model_path


def predict_with_yolo(image_path):
    from ultralytics import YOLO

    model_path = get_model_path()
    allow_base_model = os.environ.get("ALLOW_BASE_MODEL", "false").lower() == "true"
    using_custom_model = os.path.exists(model_path)

    if not using_custom_model:
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
    species = to_display_species(raw_label)
    confidence = round(float(boxes.conf[best_index].item()) * 100, 2)
    coordinates = [round(float(value), 2) for value in boxes.xyxy[best_index].tolist()]

    if not using_custom_model and not is_configured_species(raw_label):
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
