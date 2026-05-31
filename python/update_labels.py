from pathlib import Path

LABELS_DIRS = [
    Path("python/dataset/train/labels"),
    Path("python/dataset/valid/labels"),
    Path("python/dataset/test/labels"),
]

for labels_dir in LABELS_DIRS:
    if not labels_dir.exists():
        continue

    for txt_file in labels_dir.glob("*.txt"):
        lines = txt_file.read_text().splitlines()
        updated_lines = []

        for line in lines:
            parts = line.split()

            if not parts:
                continue

            class_id = int(parts[0])

            # aumentar +1
            new_class_id = class_id + 1

            parts[0] = str(new_class_id)

            updated_lines.append(" ".join(parts))

        txt_file.write_text("\n".join(updated_lines))

print("Labels actualizados correctamente.")