from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG_TS = ROOT / "src" / "lib" / "ecuadorSpeciesCatalog.ts"
REPORTS_DIR = ROOT / "reports"
DEFAULT_MODEL_DIR = (
    Path.home()
    / ".cache"
    / "kagglehub"
    / "models"
    / "google"
    / "speciesnet"
    / "pyTorch"
    / "v4.0.2a"
    / "1"
)


def normalize_name(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def binomial(value: str) -> str:
    parts = normalize_name(value).split()
    return " ".join(parts[:2]) if len(parts) >= 2 else normalize_name(value)


def parse_catalog(path: Path) -> list[dict[str, str]]:
    pattern = re.compile(
        r"entry\('(?P<name>(?:\\'|[^'])*)', '(?P<group>[^']+)', '(?P<source>(?:\\'|[^'])*)'(?:, '(?P<status>[^']+)')?\)"
    )
    entries = []

    for match in pattern.finditer(path.read_text(encoding="utf-8")):
        entries.append(
            {
                "scientific_name": match.group("name").replace("\\'", "'"),
                "group": match.group("group"),
                "source": match.group("source").replace("\\'", "'"),
                "conservation_status": match.group("status") or "",
            }
        )

    if not entries:
        raise SystemExit(f"No catalog entries found in {path}")

    return entries


def parse_speciesnet_labels(path: Path) -> dict[str, dict[str, str]]:
    labels = {}

    with path.open("r", encoding="utf-8") as file:
        for line in file:
            parts = line.rstrip("\n").split(";")

            if len(parts) != 7:
                continue

            uuid, taxon_class, order, family, genus, species, common_name = parts
            if not genus or not species:
                continue

            scientific_name = normalize_name(f"{genus} {species}")
            labels[scientific_name] = {
                "speciesnet_label": line.strip(),
                "speciesnet_common_name": common_name,
                "speciesnet_class": taxon_class,
                "speciesnet_order": order,
                "speciesnet_family": family,
                "speciesnet_genus": genus,
                "speciesnet_species": species,
                "speciesnet_uuid": uuid,
                "speciesnet_full_class_string": ";".join(parts[1:6]),
            }

    return labels


def parse_speciesnet_taxonomy(path: Path) -> dict[str, dict[str, str]]:
    taxonomy = {}

    with path.open("r", encoding="utf-8") as file:
        for line in file:
            parts = line.rstrip("\n").split(";")

            if len(parts) != 7:
                continue

            uuid, taxon_class, order, family, genus, species, common_name = parts
            if not genus or not species:
                continue

            scientific_name = normalize_name(f"{genus} {species}")
            taxonomy[scientific_name] = {
                "taxonomy_label": line.strip(),
                "taxonomy_common_name": common_name,
                "taxonomy_full_class_string": ";".join(parts[1:6]),
                "taxonomy_uuid": uuid,
            }

    return taxonomy


def geofence_status(full_class_string: str, geofence: dict, country: str) -> str:
    rules = geofence.get(full_class_string)

    if not rules:
        return "no explicit rule"

    allow = rules.get("allow")
    if allow:
        return "allowed" if country in allow else "blocked by allow-list"

    block = rules.get("block")
    if block and country in block:
        regions = block[country]
        return "partially blocked" if regions else "blocked"

    return "allowed"


def find_latest_file(model_dir: Path, pattern: str) -> Path:
    matches = sorted(model_dir.glob(pattern))

    if not matches:
        raise SystemExit(f"No file matching {pattern} found in {model_dir}")

    return matches[-1]


def write_reports(rows: list[dict[str, str]], country: str, model_dir: Path) -> None:
    REPORTS_DIR.mkdir(exist_ok=True)
    csv_path = REPORTS_DIR / "speciesnet-coverage-ecuador-catalog.csv"
    md_path = REPORTS_DIR / "speciesnet-coverage-ecuador-catalog.md"

    fieldnames = [
        "scientific_name",
        "group",
        "source",
        "conservation_status",
        "match_level",
        "speciesnet_detectable",
        "geofence_status",
        "speciesnet_common_name",
        "speciesnet_label",
    ]

    with csv_path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    counts = Counter(row["match_level"] for row in rows)
    by_group = Counter((row["group"], row["match_level"]) for row in rows)
    detectable_by_group = Counter(row["group"] for row in rows if row["speciesnet_detectable"] == "yes")
    allowed_detectable_by_group = Counter(
        row["group"]
        for row in rows
        if row["speciesnet_detectable"] == "yes" and row["geofence_status"] == "allowed"
    )
    blocked_detectable = sum(
        1
        for row in rows
        if row["speciesnet_detectable"] == "yes" and row["geofence_status"] != "allowed"
    )

    lines = [
        "# SpeciesNet coverage against Ecuador catalog",
        "",
        f"Country geofence checked: `{country}`",
        f"SpeciesNet model directory: `{model_dir}`",
        "",
        "## Summary",
        "",
        f"- Catalog entries reviewed: {len(rows)}",
        f"- Direct model species matches: {counts['direct_model_species']}",
        f"- Taxonomy-only species matches: {counts['taxonomy_only_species']}",
        f"- Binomial matches for catalog subspecies/taxonomic variants: {counts['binomial_model_species']}",
        f"- Detectable matches allowed for Ecuador: {sum(allowed_detectable_by_group.values())}",
        f"- Detectable matches blocked or not explicitly allowed for Ecuador: {blocked_detectable}",
        f"- Not found in SpeciesNet taxonomy/model labels: {counts['not_found']}",
        "",
        "## Detectable direct matches by group",
        "",
    ]

    for group in sorted({row["group"] for row in rows}):
        lines.append(f"- {group}: {detectable_by_group[group]}")

    lines.extend(["", "## Detectable and allowed for Ecuador by group", ""])
    for group in sorted({row["group"] for row in rows}):
        lines.append(f"- {group}: {allowed_detectable_by_group[group]}")

    lines.extend(["", "## Match Levels By Group", ""])
    for group in sorted({row["group"] for row in rows}):
        lines.append(f"### {group}")
        for match_level in ["direct_model_species", "binomial_model_species", "taxonomy_only_species", "not_found"]:
            lines.append(f"- {match_level}: {by_group[(group, match_level)]}")
        lines.append("")

    lines.extend(
        [
            "## Notes",
            "",
            "- `direct_model_species` means the exact scientific binomial appears as a SpeciesNet classifier label.",
            "- `binomial_model_species` means the catalog entry had extra words, usually a subspecies, but the first two words match a SpeciesNet classifier label.",
            "- `taxonomy_only_species` means the name appears in SpeciesNet taxonomy but not as a direct classifier output label.",
            "- `not_found` means it was not found in the local SpeciesNet model taxonomy or classifier labels.",
            "- `allowed` means the local geofence file does not block that class for Ecuador. This is not a promise of high accuracy.",
            "",
        ]
    )

    md_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {csv_path}")
    print(f"Wrote {md_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare local Ecuador catalog against SpeciesNet labels.")
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--country", default="ECU")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    labels_path = find_latest_file(args.model_dir, "*.labels*.txt")
    taxonomy_path = find_latest_file(args.model_dir, "taxonomy_release*.txt")
    geofence_path = find_latest_file(args.model_dir, "geofence_release*.json")

    catalog = parse_catalog(CATALOG_TS)
    model_labels = parse_speciesnet_labels(labels_path)
    taxonomy = parse_speciesnet_taxonomy(taxonomy_path)
    geofence = json.loads(geofence_path.read_text(encoding="utf-8"))
    rows = []

    for entry in catalog:
        exact = normalize_name(entry["scientific_name"])
        first_two = binomial(entry["scientific_name"])
        model_match = model_labels.get(exact)
        binomial_match = model_labels.get(first_two) if first_two != exact else None
        taxonomy_match = taxonomy.get(exact) or taxonomy.get(first_two)
        chosen = model_match or binomial_match or taxonomy_match

        if model_match:
            match_level = "direct_model_species"
            detectable = "yes"
        elif binomial_match:
            match_level = "binomial_model_species"
            detectable = "yes"
        elif taxonomy_match:
            match_level = "taxonomy_only_species"
            detectable = "no"
        else:
            match_level = "not_found"
            detectable = "no"

        full_class_string = ""
        if chosen:
            full_class_string = chosen.get("speciesnet_full_class_string") or chosen.get("taxonomy_full_class_string", "")

        rows.append(
            {
                **entry,
                "match_level": match_level,
                "speciesnet_detectable": detectable,
                "geofence_status": geofence_status(full_class_string, geofence, args.country) if full_class_string else "",
                "speciesnet_common_name": (chosen or {}).get("speciesnet_common_name")
                or (chosen or {}).get("taxonomy_common_name", ""),
                "speciesnet_label": (chosen or {}).get("speciesnet_label") or (chosen or {}).get("taxonomy_label", ""),
            }
        )

    write_reports(rows, args.country, args.model_dir)


if __name__ == "__main__":
    main()
