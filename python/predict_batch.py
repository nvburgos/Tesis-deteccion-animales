import json
import sys

from predict import predict


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Manifest path is required"}))
        sys.exit(1)

    manifest_path = sys.argv[1]

    with open(manifest_path, "r", encoding="utf-8") as file:
        image_paths = json.load(file)

    results = []

    for image_path in image_paths:
        try:
            result = predict(image_path)
        except Exception as error:
            result = {
                "species": "Sin deteccion",
                "confidence": 0,
                "coordinates": None,
                "error": f"No se pudo ejecutar el flujo de deteccion: {error}",
            }

        results.append({"imagePath": image_path, "prediction": result})

    print(json.dumps({"results": results}))


if __name__ == "__main__":
    main()
