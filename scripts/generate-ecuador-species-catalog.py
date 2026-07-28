from __future__ import annotations

import argparse
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "lib" / "ecuadorSpeciesCatalog.ts"

IUCN_CATEGORIES = {"EW", "RE", "CR", "EN", "VU", "NT", "DD", "LC", "NE"}
COMMON_FALSE_WORDS = {
    "annotated",
    "apendice",
    "biodiversidad",
    "birdlife",
    "checklist",
    "content",
    "criterios",
    "del",
    "ecuador",
    "ecuadorian",
    "following",
    "fundacion",
    "international",
    "lista",
    "mammals",
    "ministerio",
    "nombre",
    "oficial",
    "pages",
    "quito",
    "regional",
    "researchgate",
    "requested",
    "roja",
    "species",
    "table",
    "universidad",
}


@dataclass(frozen=True)
class CatalogEntry:
    scientific_name: str
    group: str
    source: str
    conservation_status: str | None = None


def read_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n\n".join(page.extract_text() or "" for page in reader.pages)


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def strip_accents(value: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFD", value) if unicodedata.category(char) != "Mn"
    )


def is_probable_scientific_name(value: str) -> bool:
    words = value.split()

    if len(words) not in {2, 3}:
        return False

    if not re.fullmatch(r"[A-Z][a-z]{2,}", words[0]):
        return False

    for word in words[1:]:
        if not re.fullmatch(r"[a-z][a-z-]{2,}", word):
            return False

        if strip_accents(word).lower() in COMMON_FALSE_WORDS:
            return False

    return True


def extract_mammals(text: str, source: str) -> list[CatalogEntry]:
    start = text.find("MAMÍFEROS DEL ECUADOR: ESPECIES NATIVAS")
    end = text.find("ESPECIES NO DESCRITAS O DE INCLUSIÓN PENDIENTE")
    body = text[start:end] if start >= 0 and end > start else text
    entries: list[CatalogEntry] = []

    for match in re.finditer(r"\b\d{1,3}\.\s+([A-Z][a-z]+(?:\s+[a-z][a-z-]+){1,2})\b", body):
        scientific_name = normalize_spaces(match.group(1))

        if is_probable_scientific_name(scientific_name):
            entries.append(CatalogEntry(scientific_name, "Mamifero", source))

    return entries


def extract_birds(text: str, source: str) -> list[CatalogEntry]:
    start = text.find("ApÃ©ndice 2")
    if start < 0:
        start = text.find("Apéndice 2")

    body = text[start:] if start >= 0 else text
    entries: list[CatalogEntry] = []

    for match in re.finditer(r"\b([A-Z][a-z]{2,}(?:\s+[a-z][a-z-]{2,}){1,2})\b", body):
        scientific_name = normalize_spaces(match.group(1))

        if is_probable_scientific_name(scientific_name):
            entries.append(CatalogEntry(scientific_name, "Ave", source))

    return entries


def extract_reptiles(text: str, source: str) -> list[CatalogEntry]:
    start = text.find("ORDEN CROCODYLIA")
    end = text.find("BIBLIOGRAFÍA")
    body = text[start:end] if start >= 0 and end > start else text
    entries: list[CatalogEntry] = []

    line_pattern = re.compile(
        r"\b([A-Z][a-z]{2,}(?:\s+[a-z][a-z-]{2,}){1,2})\s+(EW|RE|CR|EN|VU|NT|DD|LC|NE)\b"
    )

    for match in line_pattern.finditer(body):
        scientific_name = normalize_spaces(match.group(1))

        if is_probable_scientific_name(scientific_name):
            entries.append(CatalogEntry(scientific_name, "Reptil", source, match.group(2)))

    return entries


def dedupe(entries: list[CatalogEntry]) -> list[CatalogEntry]:
    by_key: dict[tuple[str, str], CatalogEntry] = {}

    for entry in entries:
        key = (entry.group, entry.scientific_name.lower())
        current = by_key.get(key)

        if current is None:
            by_key[key] = entry
            continue

        if current.conservation_status is None and entry.conservation_status is not None:
            by_key[key] = entry

    return sorted(by_key.values(), key=lambda item: (item.group, item.scientific_name))


def ts_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def write_catalog(entries: list[CatalogEntry]) -> None:
    lines = [
        "export type EcuadorSpeciesCatalogEntry = {",
        "  scientificName: string",
        "  group: 'Mamifero' | 'Ave' | 'Reptil'",
        "  source: string",
        "  conservationStatus?: 'EW' | 'RE' | 'CR' | 'EN' | 'VU' | 'NT' | 'DD' | 'LC' | 'NE'",
        "}",
        "",
        "// Generated from the source PDFs provided for this thesis project.",
        "// Mammals are extracted from the official 2023.2 checklist; birds and reptiles",
        "// are extracted from red-list appendices and should be reviewed before model training.",
        "const entry = (",
        "  scientificName: string,",
        "  group: EcuadorSpeciesCatalogEntry['group'],",
        "  source: string,",
        "  conservationStatus?: EcuadorSpeciesCatalogEntry['conservationStatus']",
        "): EcuadorSpeciesCatalogEntry => ({ scientificName, group, source, conservationStatus })",
        "",
        "export const ecuadorSpeciesCatalog: EcuadorSpeciesCatalogEntry[] = [",
    ]

    for entry in entries:
        if entry.conservation_status:
            lines.append(
                "  entry("
                + ", ".join(
                    [
                        ts_string(entry.scientific_name),
                        ts_string(entry.group),
                        ts_string(entry.source),
                        ts_string(entry.conservation_status),
                    ]
                )
                + "),"
            )
            continue

        lines.append(
            "  entry("
            + ", ".join([ts_string(entry.scientific_name), ts_string(entry.group), ts_string(entry.source)])
            + "),"
        )

    lines.extend([
        "]",
        "",
        "export const ecuadorSpeciesCatalogGeneratedAt = '2026-07-27'",
        "",
    ])
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Ecuador species catalog from PDF lists.")
    parser.add_argument("--mammals-pdf", required=True, type=Path)
    parser.add_argument("--birds-pdf", required=True, type=Path)
    parser.add_argument("--reptiles-pdf", required=True, type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    entries = [
        *extract_mammals(read_pdf_text(args.mammals_pdf), "Mamíferos del Ecuador 2023.2"),
        *extract_birds(read_pdf_text(args.birds_pdf), "Lista Roja de las Aves del Ecuador 2019"),
        *extract_reptiles(read_pdf_text(args.reptiles_pdf), "Lista Roja de los Reptiles del Ecuador 2005"),
    ]
    deduped = dedupe(entries)
    write_catalog(deduped)

    counts: dict[str, int] = {}
    for entry in deduped:
        counts[entry.group] = counts.get(entry.group, 0) + 1

    print(f"Catalog written to {OUTPUT}")
    for group, count in sorted(counts.items()):
        print(f"{group}: {count}")


if __name__ == "__main__":
    main()
