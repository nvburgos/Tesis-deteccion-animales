import argparse
import csv
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

from capture_datetime import capture_range, extract_capture_metadata

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def load_dotenv():
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def get_database_url():
    load_dotenv()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL no esta configurado.")
    return database_url


def get_psql_command():
    configured = os.environ.get("PSQL_CMD")
    if configured:
        return configured
    resolved = shutil.which("psql")
    if resolved:
        return resolved
    raise RuntimeError(
        "psql no esta instalado o no esta en PATH. Instala PostgreSQL client tools o configura PSQL_CMD con la ruta a psql.exe."
    )


def run_psql(sql, tuples_only=True):
    command = [get_psql_command(), get_database_url(), "-X", "--set", "ON_ERROR_STOP=1"]
    if tuples_only:
        command.extend(["-t", "-A", "-F", "\t"])
    command.extend(["-c", sql])
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip() or "psql fallo")
    return completed.stdout


def sql_literal(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def ensure_capture_columns():
    sql = """
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Detection'
  AND column_name IN ('capturedAt', 'captureDateSource', 'cameraTrapCode', 'temperatureCelsius', 'temperatureFahrenheit', 'visibleMetadataText');
"""
    count = int((run_psql(sql).strip() or "0").splitlines()[-1])
    if count < 2:
        raise RuntimeError(
            "La tabla Detection aun no tiene capturedAt/captureDateSource. Aplica primero la migracion no destructiva 20260719050000_add_detection_capture_datetime."
        )
    return count == 6


def resolve_image_path(image_path):
    if not image_path:
        return None
    normalized = image_path.replace("\\", "/")
    candidates = []
    if normalized.startswith("/"):
        candidates.append(PROJECT_ROOT / "public" / normalized.lstrip("/"))
        candidates.append(PROJECT_ROOT / normalized.lstrip("/"))
    else:
        candidates.append(PROJECT_ROOT / normalized)
        candidates.append(PROJECT_ROOT / "public" / normalized)

    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def fetch_detections(args):
    clauses = ['"capturedAt" IS NULL']
    if args.camera_id:
        clauses.append(f'"cameraId" = {int(args.camera_id)}')
    if args.batch_id:
        clauses.append(f'"batchJobId" = {int(args.batch_id)}')
    where = " AND ".join(clauses)
    limit = f" LIMIT {int(args.limit)}" if args.limit else ""
    sql = f'SELECT "id", "imagePath" FROM "Detection" WHERE {where} ORDER BY "id" ASC{limit};'
    output = run_psql(sql)
    rows = []
    for line in output.splitlines():
        if not line.strip():
            continue
        parsed = next(csv.reader([line], delimiter="\t"))
        if len(parsed) >= 2:
            rows.append({"id": int(parsed[0]), "imagePath": parsed[1]})
    return rows


def update_detection(detection_id, metadata, has_metadata_columns):
    captured_at = metadata.get("capturedAt")
    source = metadata.get("captureDateSource")
    metadata_sql = ""
    if has_metadata_columns:
        metadata_sql = (
            f', "cameraTrapCode" = {sql_literal(metadata.get("cameraTrapCode"))}'
            f', "temperatureCelsius" = {sql_literal(metadata.get("temperatureCelsius"))}::double precision'
            f', "temperatureFahrenheit" = {sql_literal(metadata.get("temperatureFahrenheit"))}::double precision'
            f', "visibleMetadataText" = {sql_literal(metadata.get("visibleMetadataText"))}'
        )
    sql = (
        'UPDATE "Detection" '
        f'SET "capturedAt" = {sql_literal(captured_at)}::timestamp, "captureDateSource" = {sql_literal(source)}{metadata_sql} '
        f'WHERE "id" = {int(detection_id)};'
    )
    run_psql(sql, tuples_only=False)


def main():
    parser = argparse.ArgumentParser(description="Completa Detection.capturedAt usando EXIF, nombre de archivo u OCR.")
    parser.add_argument("--camera-id", type=int)
    parser.add_argument("--batch-id", type=int)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        has_metadata_columns = ensure_capture_columns()
        rows = fetch_detections(args)
    except Exception as error:
        print(f"[backfill] No se puede iniciar: {error}", file=sys.stderr)
        return 1

    stats = {"total": len(rows), "updated": 0, "unknown": 0, "missingFile": 0, "dryRun": args.dry_run}
    print(f"[backfill] Registros a revisar: {len(rows)}")

    for index, row in enumerate(rows, start=1):
        detection_id = row["id"]
        resolved_path = resolve_image_path(row["imagePath"])
        if not resolved_path:
            stats["missingFile"] += 1
            print(f"[{index}/{len(rows)}] Detection {detection_id}: archivo no encontrado {row['imagePath']}")
            continue

        metadata = extract_capture_metadata(str(resolved_path), enable_ocr=True)
        captured_at = metadata.get("capturedAt")
        source = metadata.get("captureDateSource")
        if not captured_at:
            stats["unknown"] += 1
            print(f"[{index}/{len(rows)}] Detection {detection_id}: UNKNOWN")
            continue

        print(
            f"[{index}/{len(rows)}] Detection {detection_id}: {captured_at} source={source} "
            f"camera={metadata.get('cameraTrapCode')} tempC={metadata.get('temperatureCelsius')} range={capture_range(captured_at)}"
        )
        if not args.dry_run:
            update_detection(detection_id, metadata, has_metadata_columns)
        stats["updated"] += 1

    print(json.dumps(stats, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
