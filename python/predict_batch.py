import argparse
import json
import os
import re
import sys
import time
from functools import lru_cache
from pathlib import Path

from PIL import Image
import yaml

from capture_datetime import extract_capture_metadata

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
DATASET_YAML = Path.cwd() / "python" / "dataset" / "data.yaml"
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


def log(message):
    print(message, file=sys.stderr, flush=True)


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def get_device():
    try:
        import torch

        return "GPU" if torch.cuda.is_available() else "CPU"
    except Exception:
        return "CPU"


def normalize_label(label):
    return str(label).replace("_", " ").replace("-", " ").strip().lower()


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
        local_best = Path.cwd() / "python" / "best.pt"
        model_path = "python/best.pt" if local_best.exists() else "yolov8n.pt"

    model_path = Path(model_path)
    if not model_path.is_absolute():
        model_path = Path.cwd() / model_path

    return model_path


@lru_cache(maxsize=1)
def load_trained_label_map():
    if not DATASET_YAML.exists():
        return {}

    try:
        with DATASET_YAML.open("r", encoding="utf-8") as file:
            data = yaml.safe_load(file) or {}
    except Exception:
        return {}

    names = data.get("names") or {}
    if isinstance(names, dict):
        values = [names[index] for index in sorted(names)]
    else:
        values = names

    return {normalize_label(name): str(name).replace("_", " ").strip() for name in values}


def has_curated_yolo_model():
    local_best = Path.cwd() / "python" / "best.pt"
    explicit_model = os.environ.get("YOLO_MODEL_PATH")
    is_generic_yolo = explicit_model and Path(explicit_model).name.lower() in {"yolov8n.pt", "yolov8s.pt", "yolov8m.pt", "yolov8l.pt", "yolov8x.pt"}
    is_curated_model = local_best.exists() or bool(explicit_model and not is_generic_yolo)
    return bool(load_trained_label_map()) and is_curated_model and get_model_path().exists()


def is_configured_species(label):
    return normalize_label(label) in load_trained_label_map()


def to_display_species(label):
    return load_trained_label_map().get(normalize_label(label))


def is_broad_or_uncertain_species(species):
    if not species:
        return True

    normalized = normalize_label(species)
    if normalized in {"sin deteccion", "sin detección", "unknown", "no cv result", "no detection"}:
        return True

    return any(pattern.search(str(species)) for pattern in BROAD_LABEL_PATTERNS)


def list_images(folder):
    root = Path(folder)
    return sorted(
        str(path.resolve())
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )


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


def prediction_to_result(image_path, prediction):
    metadata = extract_capture_metadata(image_path)
    captured_at = metadata.get("capturedAt")
    capture_date_source = metadata.get("captureDateSource")
    detections = prediction.get("detections", [])
    animal_detections = [
        detection for detection in detections if str(detection.get("category")) == "1"
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
            "capturedAt": captured_at,
            "captureDateSource": capture_date_source,
            "cameraTrapCode": metadata.get("cameraTrapCode"),
            "temperatureCelsius": metadata.get("temperatureCelsius"),
            "temperatureFahrenheit": metadata.get("temperatureFahrenheit"),
            "visibleMetadataText": metadata.get("visibleMetadataText"),
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
            "capturedAt": captured_at,
            "captureDateSource": capture_date_source,
            "cameraTrapCode": metadata.get("cameraTrapCode"),
            "temperatureCelsius": metadata.get("temperatureCelsius"),
            "temperatureFahrenheit": metadata.get("temperatureFahrenheit"),
            "visibleMetadataText": metadata.get("visibleMetadataText"),
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
        "capturedAt": captured_at,
        "captureDateSource": capture_date_source,
        "cameraTrapCode": metadata.get("cameraTrapCode"),
        "temperatureCelsius": metadata.get("temperatureCelsius"),
        "temperatureFahrenheit": metadata.get("temperatureFahrenheit"),
        "visibleMetadataText": metadata.get("visibleMetadataText"),
        "animalDetected": True,
        "animalConfidence": animal_confidence,
        "detector": "SpeciesNet",
        "model": prediction.get("model_version"),
        "rawLabel": prediction.get("prediction"),
        "message": f"SpeciesNet identifico la especie como {species}.",
    }


@lru_cache(maxsize=2)
def load_yolo_model(model_path):
    from ultralytics import YOLO

    if not model_path.exists():
        raise FileNotFoundError(f"YOLO model not found at {model_path}")

    return YOLO(str(model_path))


def classify_species_with_yolo(image_path):
    model_path = get_model_path()
    model = load_yolo_model(model_path)
    results = model(image_path, verbose=False)

    if not results or len(results[0].boxes) == 0:
        return {
            "species": "Sin deteccion",
            "confidence": 0,
            "coordinates": None,
            "model": model_path.name,
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
            "model": model_path.name,
            "warning": f"Unsupported YOLO label '{raw_label}'.",
        }

    return {
        "species": to_display_species(raw_label),
        "confidence": round(float(boxes.conf[best_index].item()) * 100, 2),
        "coordinates": [round(float(value), 2) for value in boxes.xyxy[best_index].tolist()],
        "rawLabel": raw_label,
        "model": model_path.name,
    }


def should_try_curated_yolo(result):
    if not env_flag("CURATED_MODEL_ENABLED", True):
        return False

    if not has_curated_yolo_model():
        return False

    if not result.get("animalDetected"):
        return False

    confidence = float(result.get("confidence") or 0)
    low_confidence_threshold = env_float("SPECIESNET_LOW_CONFIDENCE_THRESHOLD", 60)

    return is_broad_or_uncertain_species(result.get("species")) or confidence < low_confidence_threshold


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


def load_predictions_json(path):
    if not path.exists():
        return {}

    try:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except Exception:
        return {}

    predictions = data.get("predictions", data)

    if isinstance(predictions, dict):
        return predictions

    if isinstance(predictions, list):
        return {
            str(item.get("filepath")): item
            for item in predictions
            if isinstance(item, dict) and item.get("filepath")
        }

    return {}


def emit_missing_prediction(image_path, index, total):
    metadata = extract_capture_metadata(image_path)
    emit({
        "type": "result",
        "index": index,
        "total": total,
        "imagePath": image_path,
        "species": "Sin deteccion",
        "confidence": 0,
        "coordinates": None,
        "capturedAt": metadata.get("capturedAt"),
        "captureDateSource": metadata.get("captureDateSource"),
        "cameraTrapCode": metadata.get("cameraTrapCode"),
        "temperatureCelsius": metadata.get("temperatureCelsius"),
        "temperatureFahrenheit": metadata.get("temperatureFahrenheit"),
        "visibleMetadataText": metadata.get("visibleMetadataText"),
        "error": "SpeciesNet did not return a prediction for this image",
    })


def run_prediction_microbatch(model, chunk, chunk_number, total_chunks, completed, total, country, run_mode, batch_size, folder):
    chunk_json = Path(folder) / f".speciesnet-predictions.chunk-{chunk_number}.json"
    if chunk_json.exists():
        chunk_json.unlink()

    emit({
        "type": "stage",
        "stage": "processing_images",
        "message": f"Procesando microbatch {chunk_number} de {total_chunks}",
        "from": completed + 1,
        "to": completed + len(chunk),
        "total": total,
    })

    start = time.perf_counter()
    model.predict(
        filepaths=chunk,
        country=country,
        run_mode=run_mode,
        batch_size=batch_size,
        progress_bars=False,
        predictions_json=chunk_json,
    )
    seconds = time.perf_counter() - start

    predictions = load_predictions_json(chunk_json)
    for offset, image_path in enumerate(chunk, start=1):
        index = completed + offset
        prediction = predictions.get(image_path)
        if prediction is None:
            emit_missing_prediction(image_path, index, total)
            continue

        result = prediction_to_result(image_path, prediction)
        result = apply_curated_yolo_if_needed(image_path, result)
        emit({
            "type": "result",
            "index": index,
            "total": total,
            "imagePath": image_path,
            "microbatch": chunk_number,
            "microbatchSeconds": round(seconds, 3),
            **result,
        })

    return seconds


def run_batch(folder, batch_size, microbatch_size, timeout_seconds):
    emit({"type": "stage", "stage": "starting_python", "message": "Inicializando Python"})
    image_paths = list_images(folder)
    total = len(image_paths)
    country = os.environ.get("SPECIESNET_COUNTRY", "ECU")
    run_mode = os.environ.get("SPECIESNET_RUN_MODE", "multi_thread")

    emit({"type": "start", "total": total, "device": get_device(), "batchSize": batch_size, "microbatchSize": microbatch_size})

    if total == 0:
        emit({"type": "complete", "total": total, "seconds": 0})
        return 0

    emit({"type": "stage", "stage": "loading_speciesnet", "message": "Cargando SpeciesNet"})
    load_start = time.perf_counter()
    from speciesnet import DEFAULT_MODEL, SpeciesNet

    model_name = os.environ.get("SPECIESNET_MODEL", DEFAULT_MODEL)
    model = SpeciesNet(model_name, components="all", geofence=True, multiprocessing=(run_mode == "multi_process"))
    load_seconds = time.perf_counter() - load_start
    emit({"type": "model_loaded", "seconds": round(load_seconds, 3), "device": get_device()})
    emit({"type": "stage", "stage": "model_ready", "message": "Modelo cargado. Procesando imagenes"})

    inference_start = time.perf_counter()
    total_chunks = (total + microbatch_size - 1) // microbatch_size
    completed = 0
    for chunk_number, start_index in enumerate(range(0, total, microbatch_size), start=1):
        chunk = image_paths[start_index:start_index + microbatch_size]
        run_prediction_microbatch(model, chunk, chunk_number, total_chunks, completed, total, country, run_mode, batch_size, folder)
        completed += len(chunk)

    total_seconds = time.perf_counter() - inference_start
    emit({"type": "complete", "total": total, "seconds": round(total_seconds, 3)})
    emit({"type": "done", "total": total, "seconds": round(total_seconds, 3)})
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--batch-size", type=int, default=int(os.environ.get("SPECIESNET_BATCH_SIZE", "8")))
    parser.add_argument("--microbatch-size", type=int, default=int(os.environ.get("PROGRESS_MICROBATCH_SIZE", "1")))
    parser.add_argument("--timeout", type=int, default=int(os.environ.get("SPECIESNET_BATCH_TIMEOUT", "0")))
    args = parser.parse_args()

    try:
        raise SystemExit(run_batch(args.folder, max(1, args.batch_size), max(1, args.microbatch_size), args.timeout))
    except RuntimeError as error:
        message = str(error).lower()
        if args.batch_size > 1 and ("out of memory" in message or "resource exhausted" in message):
            next_batch_size = max(1, args.batch_size // 2)
            log(f"[predict_batch] Memoria insuficiente; reintentando con batch_size={next_batch_size}")
            raise SystemExit(run_batch(args.folder, next_batch_size, max(1, args.microbatch_size), args.timeout))
        emit({"type": "fatal", "error": f"No se pudo ejecutar SpeciesNet por lote: {error}"})
        raise SystemExit(1)
    except Exception as error:
        emit({"type": "fatal", "error": f"No se pudo ejecutar SpeciesNet por lote: {error}"})
        raise SystemExit(1)


if __name__ == "__main__":
    main()
