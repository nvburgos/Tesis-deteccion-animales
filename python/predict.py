import json
import os
import subprocess
import sys
import tempfile
from functools import lru_cache

from PIL import Image


DISPLAY_SPECIES = {
    "leopard": "Leopard",
}

MEGADETECTOR_LABELS = {
    "1": "animal",
    "2": "person",
    "3": "vehicle",
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


def env_flag(name, default=True):
    value = os.environ.get(name)

    if value is None:
        return default

    return value.strip().lower() not in {"0", "false", "no", "off"}


def get_model_path():
    model_path = os.environ.get("YOLO_MODEL_PATH")

    if not model_path:
        local_best = os.path.join(os.getcwd(), "python", "best.pt")
        model_path = "python/best.pt" if os.path.exists(local_best) else "yolov8n.pt"

    if not os.path.isabs(model_path):
        model_path = os.path.join(os.getcwd(), model_path)

    return model_path


def normalized_bbox_to_xyxy(bbox, image_size):
    width, height = image_size
    x, y, box_width, box_height = bbox

    return [
        round(float(x) * width, 2),
        round(float(y) * height, 2),
        round(float(x + box_width) * width, 2),
        round(float(y + box_height) * height, 2),
    ]


def speciesnet_class_to_display_name(label):
    if not label:
        return None

    parts = [part.strip() for part in str(label).split(";") if part.strip()]
    common_name = parts[-1] if parts else str(label).strip()

    if common_name.lower() in {"blank", "unknown", "animal"}:
        return None

    return common_name.replace("_", " ").replace("-", " ").title()


def run_speciesnet(image_path):
    country = os.environ.get("SPECIESNET_COUNTRY", "ECU")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".json") as output_file:
        output_path = output_file.name

    command = [
        sys.executable,
        "-m",
        "speciesnet.scripts.run_model",
        "--filepaths",
        image_path,
        "--predictions_json",
        output_path,
        "--country",
        country,
        "--bypass_prompts",
        "--ignore_existing_predictions",
        "--noprogress_bars",
    ]

    try:
        subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=int(os.environ.get("SPECIESNET_TIMEOUT", "120")),
        )

        with open(output_path, "r", encoding="utf-8") as file:
            data = json.load(file)
    finally:
        if os.path.exists(output_path):
            os.remove(output_path)

    predictions = data.get("predictions", [])

    if not predictions:
        raise RuntimeError("SpeciesNet did not return predictions")

    prediction = predictions[0]
    detections = prediction.get("detections", [])
    animal_detections = [
        detection for detection in detections if detection.get("category") == "1"
    ]
    best_detection = max(animal_detections, key=lambda item: item.get("conf", 0), default=None)
    species = speciesnet_class_to_display_name(prediction.get("prediction"))
    confidence = round(float(prediction.get("prediction_score", 0)) * 100, 2)

    coordinates = None
    animal_confidence = 0

    if best_detection:
        with Image.open(image_path) as image:
            coordinates = normalized_bbox_to_xyxy(best_detection["bbox"], image.size)
        animal_confidence = round(float(best_detection.get("conf", 0)) * 100, 2)

    if not best_detection:
        return {
            "species": "Sin deteccion",
            "confidence": 0,
            "coordinates": None,
            "animalDetected": False,
            "detector": "SpeciesNet",
            "model": prediction.get("model_version"),
            "message": "SpeciesNet no encontro animales en la imagen.",
        }

    if not species:
        return {
            "species": "Sin deteccion",
            "confidence": animal_confidence,
            "coordinates": coordinates,
            "animalDetected": True,
            "animalConfidence": animal_confidence,
            "detector": "SpeciesNet",
            "model": prediction.get("model_version"),
            "rawLabel": prediction.get("prediction"),
            "message": "SpeciesNet detecto un animal, pero no asigno una especie concreta.",
        }

    return {
        "species": species,
        "confidence": confidence,
        "coordinates": coordinates,
        "animalDetected": True,
        "animalConfidence": animal_confidence,
        "detector": "SpeciesNet",
        "model": prediction.get("model_version"),
        "rawLabel": prediction.get("prediction"),
        "message": f"SpeciesNet identifico la especie como {species}.",
    }


@lru_cache(maxsize=1)
def load_megadetector():
    from megadetector.detection.run_detector import load_detector

    model_name = os.environ.get("MEGADETECTOR_MODEL", "MDV5A")
    return load_detector(model_name)


def detect_animal_with_megadetector(image_path):
    threshold = float(os.environ.get("MEGADETECTOR_THRESHOLD", "0.2"))

    with Image.open(image_path) as image:
        image = image.convert("RGB")
        detector = load_megadetector()
        result = detector.generate_detections_one_image(
            image,
            image_id=image_path,
            detection_threshold=threshold,
        )

        detections = result.get("detections", [])
        animal_detections = [
            detection for detection in detections if detection.get("category") == "1"
        ]

        if not animal_detections:
            best_detection = max(detections, key=lambda item: item.get("conf", 0), default=None)
            return {
                "animalDetected": False,
                "confidence": 0,
                "coordinates": None,
                "detector": os.environ.get("MEGADETECTOR_MODEL", "MDV5A"),
                "rawLabel": MEGADETECTOR_LABELS.get(str(best_detection.get("category"))) if best_detection else None,
            }

        best_detection = max(animal_detections, key=lambda item: item.get("conf", 0))

        return {
            "animalDetected": True,
            "confidence": round(float(best_detection.get("conf", 0)) * 100, 2),
            "coordinates": normalized_bbox_to_xyxy(best_detection["bbox"], image.size),
            "detector": os.environ.get("MEGADETECTOR_MODEL", "MDV5A"),
            "rawLabel": "animal",
        }


def classify_species_with_yolo(image_path):
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


def predict(image_path):
    if env_flag("SPECIESNET_ENABLED", True):
        try:
            return run_speciesnet(image_path)
        except Exception as error:
            print(f"SpeciesNet failed, falling back to MegaDetector + YOLO: {error}", file=sys.stderr)

    if env_flag("MEGADETECTOR_ENABLED", True):
        detection = detect_animal_with_megadetector(image_path)

        if not detection["animalDetected"]:
            return {
                "species": "Sin deteccion",
                "confidence": 0,
                "coordinates": None,
                "animalDetected": False,
                "detector": detection["detector"],
                "message": "MegaDetector no encontro animales en la imagen.",
            }

        species_result = classify_species_with_yolo(image_path)
        species_result["animalDetected"] = True
        species_result["animalConfidence"] = detection["confidence"]
        species_result["animalCoordinates"] = detection["coordinates"]
        species_result["detector"] = detection["detector"]

        if species_result["species"] == "Sin deteccion":
            species_result["coordinates"] = detection["coordinates"]
            species_result["confidence"] = detection["confidence"]
            species_result["message"] = "Se detecto un animal, pero el clasificador no identifico una especie configurada."

        return species_result

    return classify_species_with_yolo(image_path)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Image path is required"}))
        sys.exit(1)

    image_path = sys.argv[1]

    try:
        result = predict(image_path)
    except Exception as error:
        result = {
            "species": "Sin deteccion",
            "confidence": 0,
            "coordinates": None,
            "error": f"No se pudo ejecutar el flujo de deteccion: {error}",
        }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
