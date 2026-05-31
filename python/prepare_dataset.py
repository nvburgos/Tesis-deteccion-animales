from pathlib import Path
import shutil
import yaml


ROOT = Path(__file__).resolve().parent
RAW_ROOT = ROOT / "datasets_raw"
OUTPUT_ROOT = ROOT / "dataset"
TEMP_OUTPUT_ROOT = ROOT / "dataset_prepared_tmp"
CLASSES_YAML = ROOT / "wildlife_classes.yaml"

SPLIT_ALIASES = {
    "train": "train",
    "valid": "valid",
    "val": "valid",
    "test": "test",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

CLASS_ALIASES = {
    "jaguar": "jaguar",
    "tapir amazonico": "tapir_amazonico",
    "tapir amazónico": "tapir_amazonico",
    "tapir_amazonico": "tapir_amazonico",
    "venado cola blanca": "venado_cola_blanca",
    "venado_cola_blanca": "venado_cola_blanca",
    "ocelote": "ocelote",
    "ocelot": "ocelote",
    "puma": "puma",
}


def normalize_name(value):
    return str(value).replace("_", " ").replace("-", " ").strip().lower()


def canonical_name(value):
    normalized = normalize_name(value)
    return CLASS_ALIASES.get(normalized, normalized.replace(" ", "_"))


def load_yaml(path):
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def load_target_classes():
    data = load_yaml(CLASSES_YAML)
    names = data["names"]

    if isinstance(names, dict):
        ordered = [names[index] for index in sorted(names)]
    else:
        ordered = names

    target_names = {index: str(name) for index, name in enumerate(ordered)}
    target_classes = {canonical_name(name): index for index, name in target_names.items()}
    return target_classes, target_names


def load_source_classes(data_yaml):
    data = load_yaml(data_yaml)
    names = data.get("names")

    if not names:
        raise ValueError(f"El archivo {data_yaml} no contiene la clave 'names'.")

    if isinstance(names, dict):
        return {int(index): canonical_name(name) for index, name in names.items()}

    return {index: canonical_name(name) for index, name in enumerate(names)}


def find_data_yamls():
    if not RAW_ROOT.exists():
        return []

    return sorted(
        path
        for path in RAW_ROOT.rglob("*")
        if path.is_file() and path.name.lower() in {"data.yaml", "dataset.yaml"}
    )


def count_files(path, extensions=None):
    if not path.exists():
        return 0

    if extensions is None:
        return sum(1 for item in path.iterdir() if item.is_file())

    return sum(1 for item in path.iterdir() if item.is_file() and item.suffix.lower() in extensions)


def validate_source_dataset(source_root):
    found_split = False
    messages = []

    for source_split in SPLIT_ALIASES:
        images_dir = source_root / source_split / "images"
        labels_dir = source_root / source_split / "labels"

        if not images_dir.exists() and not labels_dir.exists():
            continue

        found_split = True

        if not images_dir.exists():
            messages.append(f"- Falta carpeta de imagenes: {images_dir}")
            continue

        if not labels_dir.exists():
            messages.append(f"- Falta carpeta de labels: {labels_dir}")
            continue

        image_count = count_files(images_dir, IMAGE_EXTENSIONS)
        label_count = count_files(labels_dir, {".txt"})

        if image_count == 0:
            messages.append(f"- No hay imagenes en: {images_dir}")

        if label_count == 0:
            messages.append(f"- No hay labels .txt en: {labels_dir}")

    if not found_split:
        messages.append(
            f"- No se encontro estructura YOLO en {source_root}. "
            "Se espera train/images y train/labels, y preferiblemente valid/images y valid/labels."
        )

    return messages


def validate_sources(data_yamls):
    errors = []

    for data_yaml in data_yamls:
        source_root = data_yaml.parent
        errors.extend(validate_source_dataset(source_root))

        try:
            load_source_classes(data_yaml)
        except Exception as error:
            errors.append(f"- No se pudo leer clases en {data_yaml}: {error}")

    if errors:
        formatted = "\n".join(errors)
        raise SystemExit(
            "Dataset fuente incompleto. No se genero un nuevo dataset y no se debe entrenar todavia.\n"
            f"{formatted}\n\n"
            "Corrige las carpetas de imagenes y labels antes de ejecutar prepare_dataset."
        )


def reset_output_dirs(output_root):
    if output_root.exists():
        shutil.rmtree(output_root)

    for split in {"train", "valid", "test"}:
        (output_root / split / "images").mkdir(parents=True, exist_ok=True)
        (output_root / split / "labels").mkdir(parents=True, exist_ok=True)


def find_image(images_dir, stem):
    for extension in IMAGE_EXTENSIONS:
        image_path = images_dir / f"{stem}{extension}"

        if image_path.exists():
            return image_path

    return None


def copy_with_remap(source_root, source_data_yaml, target_classes, output_root):
    source_classes = load_source_classes(source_data_yaml)
    source_to_target = {}

    for source_id, source_name in source_classes.items():
        if source_name not in target_classes:
            print(f"[skip] Clase no configurada: {source_name} ({source_data_yaml})")
            continue

        source_to_target[source_id] = target_classes[source_name]

    copied = 0

    for source_split, output_split in SPLIT_ALIASES.items():
        images_dir = source_root / source_split / "images"
        labels_dir = source_root / source_split / "labels"

        if not images_dir.exists() or not labels_dir.exists():
            continue

        for label_path in labels_dir.glob("*.txt"):
            image_path = find_image(images_dir, label_path.stem)

            if image_path is None:
                print(f"[skip] Label sin imagen correspondiente: {label_path}")
                continue

            remapped_lines = []

            for line in label_path.read_text(encoding="utf-8").splitlines():
                parts = line.strip().split()

                if len(parts) < 5:
                    print(f"[skip] Label invalido en {label_path}: {line}")
                    continue

                source_id = int(float(parts[0]))

                if source_id not in source_to_target:
                    continue

                parts[0] = str(source_to_target[source_id])
                remapped_lines.append(" ".join(parts))

            if not remapped_lines:
                continue

            prefix = source_root.name.lower().replace(" ", "-")
            output_name = f"{prefix}-{image_path.name}"
            output_image = output_root / output_split / "images" / output_name
            output_label = output_root / output_split / "labels" / f"{Path(output_name).stem}.txt"

            shutil.copy2(image_path, output_image)
            output_label.write_text("\n".join(remapped_lines) + "\n", encoding="utf-8")
            copied += 1

    return copied


def write_dataset_yaml(target_names, output_root):
    lines = [
        "train: train/images",
        "val: valid/images",
        "test: test/images",
        "",
        f"nc: {len(target_names)}",
        "",
        "names:",
    ]

    for index in sorted(target_names):
        lines.append(f"  {index}: {target_names[index]}")

    (output_root / "data.yaml").write_text("\n".join(lines) + "\n", encoding="utf-8")


def replace_output_dataset():
    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)

    TEMP_OUTPUT_ROOT.rename(OUTPUT_ROOT)


def main():
    target_classes, target_names = load_target_classes()
    data_yamls = find_data_yamls()

    if not data_yamls:
        raise SystemExit(
            "No hay datasets fuente. Coloca exportaciones YOLO en python/datasets_raw/<nombre>/data.yaml.\n"
            "No se genero un nuevo dataset y no se debe entrenar todavia."
        )

    validate_sources(data_yamls)
    reset_output_dirs(TEMP_OUTPUT_ROOT)
    total = 0

    for data_yaml in data_yamls:
        source_root = data_yaml.parent
        total += copy_with_remap(source_root, data_yaml, target_classes, TEMP_OUTPUT_ROOT)

    if total == 0:
        shutil.rmtree(TEMP_OUTPUT_ROOT, ignore_errors=True)
        raise SystemExit(
            "No se copio ninguna imagen con labels validos para las especies objetivo.\n"
            "No se reemplazo python/dataset y no se debe entrenar todavia.\n"
            "Revisa nombres de clases, imagenes y labels en datasets_raw."
        )

    write_dataset_yaml(target_names, TEMP_OUTPUT_ROOT)
    replace_output_dataset()

    print(f"Dataset multi-clase creado en {OUTPUT_ROOT}")
    print(f"Imagenes con labels copiadas: {total}")


if __name__ == "__main__":
    main()
