import argparse
import json
import os
import re
import stat
import sys
import zipfile
from pathlib import Path

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}


def env_int(name, default):
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def env_float(name, default):
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        return default


def limits():
    return {
        'maxZipSizeBytes': env_int('MAX_ZIP_SIZE_MB', 2048) * 1024 * 1024,
        'maxEntries': env_int('MAX_ZIP_ENTRIES', 20000),
        'maxUncompressedBytes': env_int('MAX_UNCOMPRESSED_SIZE_MB', 10240) * 1024 * 1024,
        'maxCompressionRatio': env_float('MAX_COMPRESSION_RATIO', 100.0),
    }


def is_symlink(info):
    mode = (info.external_attr >> 16) & 0xFFFF
    return stat.S_IFMT(mode) == stat.S_IFLNK


def normalize_member_name(name):
    return name.replace('\\', '/')


def validate_member(info, destination_root=None):
    raw_name = info.filename
    name = normalize_member_name(raw_name)

    if not name or name.startswith('/') or name.startswith('\\') or re.match(r'^[A-Za-z]:', name):
        raise ValueError(f'Ruta absoluta no permitida en ZIP: {raw_name}')

    parts = [part for part in name.split('/') if part]
    if any(part == '..' for part in parts):
        raise ValueError(f'Path traversal no permitido en ZIP: {raw_name}')

    if is_symlink(info):
        raise ValueError(f'Enlace simbolico no permitido en ZIP: {raw_name}')

    if info.is_dir():
        return None

    extension = Path(name).suffix.lower()
    if extension not in IMAGE_EXTENSIONS:
        raise ValueError(f'Extension no permitida en ZIP: {raw_name}')

    if destination_root is not None:
        root = Path(destination_root).resolve()
        target = (root / Path(*parts)).resolve()
        if root != target and root not in target.parents:
            raise ValueError(f'Entrada ZIP fuera del directorio destino: {raw_name}')
        return target

    return Path(*parts)


def inspect_zip(zip_path):
    zip_file = Path(zip_path)
    zip_limits = limits()

    if not zip_file.exists():
        raise ValueError('El archivo ZIP no existe')

    zip_size = zip_file.stat().st_size
    if zip_size <= 0:
        raise ValueError('El ZIP esta vacio')
    if zip_size > zip_limits['maxZipSizeBytes']:
        raise ValueError('El ZIP supera MAX_ZIP_SIZE_MB')

    try:
        with zipfile.ZipFile(zip_file) as archive:
            bad_file = archive.testzip()
            if bad_file:
                raise ValueError(f'ZIP corrupto en entrada: {bad_file}')

            entries = archive.infolist()
            if len(entries) > zip_limits['maxEntries']:
                raise ValueError('El ZIP supera MAX_ZIP_ENTRIES')

            image_count = 0
            total_uncompressed = 0
            total_compressed = 0

            for info in entries:
                target = validate_member(info)
                if target is None:
                    continue
                image_count += 1
                total_uncompressed += max(0, info.file_size)
                total_compressed += max(0, info.compress_size)

            if image_count == 0:
                raise ValueError('El ZIP no contiene imagenes compatibles')
            if total_uncompressed > zip_limits['maxUncompressedBytes']:
                raise ValueError('El ZIP supera MAX_UNCOMPRESSED_SIZE_MB')
            if total_compressed == 0 and total_uncompressed > 0:
                raise ValueError('ZIP con relacion de compresion invalida')

            compression_ratio = total_uncompressed / max(1, total_compressed)
            if compression_ratio > zip_limits['maxCompressionRatio']:
                raise ValueError('ZIP rechazado por posible ZIP bomb')

            return {
                'ok': True,
                'imageCount': image_count,
                'entryCount': len(entries),
                'zipSizeBytes': zip_size,
                'uncompressedSizeBytes': total_uncompressed,
                'compressedSizeBytes': total_compressed,
                'compressionRatio': round(compression_ratio, 2),
            }
    except zipfile.BadZipFile as error:
        raise ValueError(f'ZIP invalido o corrupto: {error}') from error


def safe_extract_zip(zip_path, destination):
    summary = inspect_zip(zip_path)
    destination_root = Path(destination).resolve()
    destination_root.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            target = validate_member(info, destination_root)
            if target is None:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, target.open('wb') as output:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)

    return summary


def main():
    parser = argparse.ArgumentParser(description='Inspecciona o extrae ZIPs de camaras trampa de forma segura.')
    subparsers = parser.add_subparsers(dest='command', required=True)

    inspect_parser = subparsers.add_parser('inspect')
    inspect_parser.add_argument('zip_path')

    extract_parser = subparsers.add_parser('extract')
    extract_parser.add_argument('zip_path')
    extract_parser.add_argument('destination')

    args = parser.parse_args()

    try:
        if args.command == 'inspect':
            result = inspect_zip(args.zip_path)
        else:
            result = safe_extract_zip(args.zip_path, args.destination)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
