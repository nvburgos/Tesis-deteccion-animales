import os
import re
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Optional, Tuple

from PIL import Image, ImageEnhance, ImageOps

CAPTURE_DATE_SOURCES = {
    "EXIF_DATE_TIME_ORIGINAL",
    "EXIF_CREATE_DATE",
    "EXIF_DATE_TIME",
    "FILENAME",
    "OCR",
    "UNKNOWN",
}

_DATE_PATTERNS = [
    re.compile(r"(?P<year>20\d{2})[-/](?P<month>\d{1,2})[-/](?P<day>\d{1,2})\s+(?P<hour>\d{1,2})[:;](?P<minute>\d{2})(?:[:;](?P<second>\d{2}))?"),
    re.compile(r"(?P<a>\d{1,2})[-/](?P<b>\d{1,2})[-/](?P<year>20\d{2})\s+(?P<hour>\d{1,2})[:;](?P<minute>\d{2})(?:[:;](?P<second>\d{2}))?"),
]


def _format_iso(parsed):
    return time.strftime("%Y-%m-%dT%H:%M:%S", parsed)


def _parse_parts(year: int, month: int, day: int, hour: int, minute: int, second: int = 0) -> Optional[str]:
    try:
        parsed = time.strptime(
            f"{year:04d}-{month:02d}-{day:02d} {hour:02d}:{minute:02d}:{second:02d}",
            "%Y-%m-%d %H:%M:%S",
        )
    except ValueError:
        return None

    return _format_iso(parsed)


def parse_exif_datetime(value) -> Optional[str]:
    if not value:
        return None

    text = str(value).strip()
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return _format_iso(time.strptime(text, fmt))
        except ValueError:
            continue

    return None


def parse_filename_datetime(image_path: str) -> Optional[str]:
    name = Path(image_path).stem
    patterns = [
        (r"(?P<year>20\d{2})[-_]?(?P<month>\d{2})[-_]?(?P<day>\d{2})[ _-]+(?P<hour>\d{2})[-_]?(?P<minute>\d{2})[-_]?(?P<second>\d{2})", "YMD"),
        (r"(?P<year>20\d{2})[-_](?P<month>\d{2})[-_](?P<day>\d{2})[ T_-](?P<hour>\d{2})[-_:](?P<minute>\d{2})[-_:](?P<second>\d{2})", "YMD"),
    ]

    configured_format = os.environ.get("CAPTURE_DATE_FILENAME_FORMAT", "").upper().strip()
    if configured_format in {"MDY", "DMY"}:
        patterns.append((r"(?P<a>\d{2})[-_](?P<b>\d{2})[-_](?P<year>20\d{2})[ _-](?P<hour>\d{2})[-_:](?P<minute>\d{2})[-_:](?P<second>\d{2})", configured_format))

    for pattern, mode in patterns:
        match = re.search(pattern, name)
        if not match:
            continue

        parts = match.groupdict()
        if mode == "MDY":
            month, day = int(parts["a"]), int(parts["b"])
        elif mode == "DMY":
            day, month = int(parts["a"]), int(parts["b"])
        else:
            month, day = int(parts["month"]), int(parts["day"])

        parsed = _parse_parts(
            int(parts["year"]),
            month,
            day,
            int(parts["hour"]),
            int(parts["minute"]),
            int(parts.get("second") or 0),
        )
        if parsed:
            return parsed

    return None


def parse_visible_datetime_text(text: str, configured_format: Optional[str] = None) -> Optional[str]:
    normalized = (
        text.replace("O", "0")
        .replace("o", "0")
        .replace("|", "1")
        .replace("l", "1")
        .replace("I", "1")
    )
    normalized = re.sub(r"\s+", " ", normalized)
    date_format = (configured_format or os.environ.get("CAPTURE_DATE_OCR_FORMAT", "MDY")).upper().strip()

    for pattern in _DATE_PATTERNS:
        for match in pattern.finditer(normalized):
            parts = match.groupdict()
            year = int(parts["year"])
            hour = int(parts["hour"])
            minute = int(parts["minute"])
            second = int(parts.get("second") or 0)

            if "month" in parts and parts.get("month"):
                month = int(parts["month"])
                day = int(parts["day"])
            else:
                if date_format == "DMY":
                    day, month = int(parts["a"]), int(parts["b"])
                elif date_format == "YMD":
                    # YMD with separators is handled by the first regex.
                    continue
                else:
                    month, day = int(parts["a"]), int(parts["b"])

            parsed = _parse_parts(year, month, day, hour, minute, second)
            if parsed:
                return parsed

    return None


def preprocess_bottom_region(image_path: str) -> Image.Image:
    crop_ratio = float(os.environ.get("CAPTURE_DATE_OCR_CROP_RATIO", "0.22"))
    crop_ratio = min(0.35, max(0.15, crop_ratio))

    with Image.open(image_path) as image:
        image = image.convert("RGB")
        width, height = image.size
        top = int(height * (1 - crop_ratio))
        region = image.crop((0, top, width, height))

    region = ImageOps.grayscale(region)
    region = ImageEnhance.Contrast(region).enhance(float(os.environ.get("CAPTURE_DATE_OCR_CONTRAST", "2.2")))
    scale = int(os.environ.get("CAPTURE_DATE_OCR_SCALE", "2"))
    if scale > 1:
        region = region.resize((region.width * scale, region.height * scale), Image.Resampling.LANCZOS)

    threshold = int(os.environ.get("CAPTURE_DATE_OCR_THRESHOLD", "165"))
    region = region.point(lambda pixel: 255 if pixel > threshold else 0)
    return region


def run_tesseract_ocr(image_path: str) -> Tuple[Optional[str], Optional[str]]:
    tesseract_cmd = os.environ.get("TESSERACT_CMD", "tesseract")
    psm = os.environ.get("CAPTURE_DATE_OCR_PSM", "6")
    whitelist = "0123456789/:;- "

    with tempfile.TemporaryDirectory() as tmp_dir:
        crop_path = Path(tmp_dir) / "capture-date-region.png"
        preprocess_bottom_region(image_path).save(crop_path)
        command = [
            tesseract_cmd,
            str(crop_path),
            "stdout",
            "--psm",
            psm,
            "-c",
            f"tessedit_char_whitelist={whitelist}",
        ]

        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=int(os.environ.get("CAPTURE_DATE_OCR_TIMEOUT", "15")),
            )
        except FileNotFoundError:
            return None, f"Tesseract no esta instalado o TESSERACT_CMD no apunta al ejecutable: {tesseract_cmd}"
        except subprocess.TimeoutExpired:
            return None, "Tesseract excedio el tiempo limite"

    if completed.returncode != 0:
        return None, completed.stderr.strip() or "Tesseract no pudo leer la region inferior"

    return completed.stdout, None


def extract_ocr_datetime(image_path: str) -> Tuple[Optional[str], Optional[str]]:
    text, error = run_tesseract_ocr(image_path)
    if error:
        return None, error

    captured_at = parse_visible_datetime_text(text or "")
    return captured_at, None


def extract_capture_datetime(image_path: str, enable_ocr: bool = True) -> Tuple[Optional[str], str]:
    try:
        with Image.open(image_path) as image:
            exif = image.getexif()
            for tag_id, source in ((36867, "EXIF_DATE_TIME_ORIGINAL"), (36868, "EXIF_CREATE_DATE"), (306, "EXIF_DATE_TIME")):
                captured_at = parse_exif_datetime(exif.get(tag_id))
                if captured_at:
                    return captured_at, source
    except Exception:
        pass

    filename_captured_at = parse_filename_datetime(image_path)
    if filename_captured_at:
        return filename_captured_at, "FILENAME"

    if enable_ocr and os.environ.get("CAPTURE_DATE_OCR_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}:
        ocr_captured_at, _ = extract_ocr_datetime(image_path)
        if ocr_captured_at:
            return ocr_captured_at, "OCR"

    return None, "UNKNOWN"


def capture_range(captured_at: Optional[str]) -> str:
    if not captured_at:
        return "Sin datos"
    hour = int(captured_at.split("T", 1)[1].split(":", 1)[0])
    ranges = ["00:00-03:00", "03:00-06:00", "06:00-09:00", "09:00-12:00", "12:00-15:00", "15:00-18:00", "18:00-21:00", "21:00-00:00"]
    return ranges[hour // 3]