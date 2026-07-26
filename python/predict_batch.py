import argparse
import json
import os
import sys
import time
from pathlib import Path

from PIL import Image

from capture_datetime import extract_capture_datetime

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
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
    captured_at, capture_date_source = extract_capture_datetime(image_path)
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
        "animalDetected": True,
        "animalConfidence": animal_confidence,
        "detector": "SpeciesNet",
        "model": prediction.get("model_version"),
        "rawLabel": prediction.get("prediction"),
        "message": f"SpeciesNet identifico la especie como {species}.",
    }


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
    captured_at, capture_date_source = extract_capture_datetime(image_path)
    emit({
        "type": "result",
        "index": index,
        "total": total,
        "imagePath": image_path,
        "species": "Sin deteccion",
        "confidence": 0,
        "coordinates": None,
        "capturedAt": captured_at,
        "captureDateSource": capture_date_source,
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

        emit({
            "type": "result",
            "index": index,
            "total": total,
            "imagePath": image_path,
            "microbatch": chunk_number,
            "microbatchSeconds": round(seconds, 3),
            **prediction_to_result(image_path, prediction),
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