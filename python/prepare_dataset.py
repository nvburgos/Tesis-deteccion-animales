from pathlib import Path
import shutil
import yaml


ROOT = Path(__file__).resolve().parent
RAW_ROOT = ROOT / "datasets_raw"
OUTPUT_ROOT = ROOT / "dataset"
CLASSES_YAML = ROOT / "wildlife_classes.yaml"

SPLIT_ALIASES = {
    "train": "train",
    "valid": "valid",
    "val": "valid",
    "test": "test",
}

CLASS_ALIASES = {
    "leopard": "Leopard",
    "boar": "Jabali",
    "cheetah": "Chita",
    "elephant": "Elefante",
    "lion": "Leon",
    "deer": "Venado",
}


def normalize_name(value):
    return str(value).replace("_", " ").replace("-", " ").strip().lower()


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

    normalized = [normalize_name(name) for name in ordered]
    return {name: index for index, name in enumerate(normalized)}


def load_source_classes(data_yaml):
    data = load_yaml(data_yaml)
    names = data["names"]

    if isinstance(names, dict):
        return {int(index): normalize_name(name) for index, name in names.items()}

    return {index: normalize_name(name) for index, name in enumerate(names)}


def find_data_yamls():
    return sorted(
        path
        for path in RAW_ROOT.rglob("*")
        if path.is_file() and path.name.lower() in {"data.yaml", "dataset.yaml"}
    )


def reset_output_dirs():
    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)

    for split in {"train", "valid", "test"}:
        (OUTPUT_ROOT / split / "images").mkdir(parents=True, exist_ok=True)
        (OUTPUT_ROOT / split / "labels").mkdir(parents=True, exist_ok=True)


def copy_with_remap(source_root, source_data_yaml, target_classes):
    source_classes = load_source_classes(source_data_yaml)
    source_to_target = {}

    for source_id, source_name in source_classes.items():
        canonical_name = CLASS_ALIASES.get(source_name, source_name)

        if canonical_name not in target_classes:
            print(f"[skip] Clase no configurada: {source_name} ({source_data_yaml})")
            continue

        source_to_target[source_id] = target_classes[canonical_name]

    copied = 0

    for source_split, output_split in SPLIT_ALIASES.items():
        images_dir = source_root / source_split / "images"
        labels_dir = source_root / source_split / "labels"

        if not images_dir.exists() or not labels_dir.exists():
            continue

        for label_path in labels_dir.glob("*.txt"):
            image_path = next(images_dir.glob(f"{label_path.stem}.*"), None)

            if image_path is None:
                continue

            remapped_lines = []

            for line in label_path.read_text(encoding="utf-8").splitlines():
                parts = line.strip().split()

                if len(parts) < 5:
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
            output_image = OUTPUT_ROOT / output_split / "images" / output_name
            output_label = OUTPUT_ROOT / output_split / "labels" / f"{Path(output_name).stem}.txt"

            shutil.copy2(image_path, output_image)
            output_label.write_text("\n".join(remapped_lines) + "\n", encoding="utf-8")
            copied += 1

    return copied


def write_dataset_yaml(target_classes):
    names = {index: name for name, index in target_classes.items()}
    lines = [
        "train: train/images",
        "val: valid/images",
        "test: test/images",
        "",
        f"nc: {len(names)}",
        "",
        "names:",
    ]

    for index in sorted(names):
        lines.append(f"  {index}: {names[index]}")

    (OUTPUT_ROOT / "data.yaml").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    target_classes = load_target_classes()
    data_yamls = find_data_yamls()

    if not data_yamls:
        raise SystemExit(
            "No hay datasets fuente. Coloca exportaciones YOLO en python/datasets_raw/<nombre>/data.yaml"
        )

    reset_output_dirs()
    total = 0

    for data_yaml in data_yamls:
        source_root = data_yaml.parent
        total += copy_with_remap(source_root, data_yaml, target_classes)

    write_dataset_yaml(target_classes)
    print(f"Dataset multi-clase creado en {OUTPUT_ROOT}")
    print(f"Imagenes con labels copiadas: {total}")

    if total == 0:
        raise SystemExit("No se copio ninguna imagen. Revisa nombres de clases y estructura YOLO.")


if __name__ == "__main__":
    main()
