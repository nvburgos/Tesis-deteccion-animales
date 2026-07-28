import json
import sys

from capture_datetime import extract_capture_metadata


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Image path is required"}))
        return 1

    print(json.dumps(extract_capture_metadata(sys.argv[1]), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
