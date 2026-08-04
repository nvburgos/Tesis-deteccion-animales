import json
import os
import re
import subprocess
import sys
import tempfile
from functools import lru_cache

from PIL import Image
import yaml

from capture_datetime import extract_capture_metadata

DISPLAY_SPECIES = {
    "leopard": "Leopard",
}

DATASET_YAML = os.path.join(os.getcwd(), "python", "dataset", "data.yaml")
BROAD_LABEL_PATTERNS = [
    re.compile(r"\banimal\b", re.IGNORECASE),
    re.compile(r"\bmammal\b", re.IGNORECASE),
    re.compile(r"\bbird\b", re.IGNORECASE),
    re.compile(r"\breptile\b", re.IGNORECASE),
    re.compile(r"\bamphibian\b", re.IGNORECASE),
    re.compile(r"\bfamily\b", re.IGNORECASE),
    re.compile(r"\bgenus\b", re.IGNORECASE),
    re.compile(r"\bspecies\b", re.IGNORECASE),
]

MEGADETECTOR_LABELS = {
    "1": "animal",
    "2": "person",
    "3": "vehicle",
}


def normalize_label(label):
    return label.replace("_", " ").replace("-", " ").strip().lower()


def to_display_species(label):
    normalized = normalize_label(label)
    trained_labels = load_trained_label_map()

    if normalized in DISPLAY_SPECIES:
        return DISPLAY_SPECIES[normalized]

    if normalized in trained_labels:
        return trained_labels[normalized]

    return None


def is_configured_species(label):
    normalized = normalize_label(label)
    return normalized in DISPLAY_SPECIES or normalized in load_trained_label_map()


@lru_cache(maxsize=1)
def load_trained_label_map():
    if not os.path.exists(DATASET_YAML):
        return {}

    try:
        with open(DATASET_YAML, "r", encoding="utf-8") as file:
            data = yaml.safe_load(file) or {}
    except Exception:
        return {}

    names = data.get("names") or {}
    if isinstance(names, dict):
        values = [names[index] for index in sorted(names)]
    else:
        values = names

    return {normalize_label(str(name)): str(name).replace("_", " ").strip() for name in values}


def env_flag(name, default=True):
    value = os.environ.get(name)

    if value is None:
        return default

    return value.strip().lower() not in {"0", "false", "no", "off"}


def env_float(name, default):
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def get_model_path():
    model_path = os.environ.get("YOLO_MODEL_PATH")

    if not model_path:
        local_best = os.path.join(os.getcwd(), "python", "best.pt")
        model_path = "python/best.pt" if os.path.exists(local_best) else "yolov8n.pt"

    if not os.path.isabs(model_path):
        model_path = os.path.join(os.getcwd(), model_path)

    return model_path


def has_curated_yolo_model():
    model_path = get_model_path()
    local_best = os.path.join(os.getcwd(), "python", "best.pt")
    explicit_model = os.environ.get("YOLO_MODEL_PATH")
    is_curated_model = os.path.exists(local_best) or bool(explicit_model and os.path.basename(explicit_model).lower() not in {"yolov8n.pt", "yolov8s.pt", "yolov8m.pt", "yolov8l.pt", "yolov8x.pt"})
    return bool(load_trained_label_map()) and is_curated_model and os.path.exists(model_path)


def is_broad_or_uncertain_species(species):
    if not species:
        return True

    normalized = normalize_label(species)
    if normalized in {"sin deteccion", "sin detección", "unknown", "no cv result", "no detection"}:
        return True

    return any(pattern.search(species) for pattern in BROAD_LABEL_PATTERNS)


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
    try:
        from megadetector.detection.run_detector import load_detector
    except ImportError as error:
        raise RuntimeError(
            "MegaDetector optional dependency is not installed. "
            "Install it with: python -m pip install -r python/requirements-fallback.txt"
        ) from error

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
    model_path = get_model_path()
    model = load_yolo_model(model_path)
    print(f"YOLO model classes: {model.names}", file=sys.stderr)
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


def should_try_curated_yolo(result):
    if not env_flag("CURATED_MODEL_ENABLED", True):
        return False

    if not has_curated_yolo_model():
        return False

    if not result.get("animalDetected"):
        return False

    species = result.get("species")
    confidence = float(result.get("confidence") or 0)
    low_confidence_threshold = env_float("SPECIESNET_LOW_CONFIDENCE_THRESHOLD", 60)

    return is_broad_or_uncertain_species(species) or confidence < low_confidence_threshold


def apply_curated_yolo_if_needed(image_path, speciesnet_result):
    if not should_try_curated_yolo(speciesnet_result):
        return speciesnet_result

    threshold = env_float("CURATED_MODEL_CONFIDENCE_THRESHOLD", 55)

    try:
        curated_result = classify_species_with_yolo(image_path)
    except Exception as error:
        speciesnet_result["curatedModelError"] = str(error)
        return speciesnet_result

    curated_confidence = float(curated_result.get("confidence") or 0)
    speciesnet_result["speciesnetSpecies"] = speciesnet_result.get("species")
    speciesnet_result["speciesnetConfidence"] = speciesnet_result.get("confidence")
    speciesnet_result["curatedModelSpecies"] = curated_result.get("species")
    speciesnet_result["curatedModelConfidence"] = curated_confidence
    speciesnet_result["curatedModel"] = curated_result.get("model")

    if curated_result.get("species") != "Sin deteccion" and curated_confidence >= threshold:
        return {
            **speciesnet_result,
            "species": curated_result["species"],
            "confidence": curated_confidence,
            "coordinates": curated_result.get("coordinates") or speciesnet_result.get("coordinates"),
            "detector": "SpeciesNet + YOLO curado",
            "model": curated_result.get("model"),
            "rawLabel": curated_result.get("rawLabel"),
            "message": (
                f"SpeciesNet devolvio una etiqueta amplia o dudosa; "
                f"el modelo curado propuso {curated_result['species']}."
            ),
        }

    speciesnet_result["message"] = (
        speciesnet_result.get("message")
        or "SpeciesNet detecto un animal, pero el modelo curado aun no tuvo confianza suficiente."
    )
    return speciesnet_result


@lru_cache(maxsize=2)
def load_yolo_model(model_path):
    from ultralytics import YOLO

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"YOLO model not found at {model_path}")

    return YOLO(model_path)


def with_capture_datetime(image_path, result):
    metadata = extract_capture_metadata(image_path)
    result.setdefault("capturedAt", metadata.get("capturedAt"))
    result.setdefault("captureDateSource", metadata.get("captureDateSource"))
    result.setdefault("cameraTrapCode", metadata.get("cameraTrapCode"))
    result.setdefault("temperatureCelsius", metadata.get("temperatureCelsius"))
    result.setdefault("temperatureFahrenheit", metadata.get("temperatureFahrenheit"))
    result.setdefault("visibleMetadataText", metadata.get("visibleMetadataText"))
    return result


def predict(image_path):
    if env_flag("SPECIESNET_ENABLED", True):
        try:
            speciesnet_result = run_speciesnet(image_path)
            return with_capture_datetime(image_path, apply_curated_yolo_if_needed(image_path, speciesnet_result))
        except Exception as error:
            print(f"SpeciesNet failed, trying fallback flow: {error}", file=sys.stderr)

    if env_flag("MEGADETECTOR_ENABLED", True):
        try:
            detection = detect_animal_with_megadetector(image_path)
        except RuntimeError as error:
            print(f"Warning: {error}. Falling back to YOLO direct.", file=sys.stderr)
            return with_capture_datetime(image_path, classify_species_with_yolo(image_path))

        if not detection["animalDetected"]:
            return with_capture_datetime(image_path, {
                "species": "Sin deteccion",
                "confidence": 0,
                "coordinates": None,
                "animalDetected": False,
                "detector": detection["detector"],
                "message": "MegaDetector no encontro animales en la imagen.",
            })

        species_result = classify_species_with_yolo(image_path)
        species_result["animalDetected"] = True
        species_result["animalConfidence"] = detection["confidence"]
        species_result["animalCoordinates"] = detection["coordinates"]
        species_result["detector"] = detection["detector"]

        if species_result["species"] == "Sin deteccion":
            species_result["coordinates"] = detection["coordinates"]
            species_result["confidence"] = detection["confidence"]
            species_result["message"] = "Se detecto un animal, pero el clasificador no identifico una especie configurada."

        return with_capture_datetime(image_path, species_result)

    return with_capture_datetime(image_path, classify_species_with_yolo(image_path))


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
