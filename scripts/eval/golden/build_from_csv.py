#!/usr/bin/env python3
"""build_from_csv.py — build golden extraction-eval fixtures from the
hand-verified CSV exports in apps/web/data/extractions/<slug>/.

Those CSVs are the existing human-reviewed systems.csv / profiles.csv for
already-onboarded manufacturers (james-hardie, hume-doors, jds-doors, ...) —
they ARE the "hand-verified expected JSON" the eval brief calls for, just in
CSV form. This script re-shapes them into the golden JSON schema
run_extraction_eval.py diffs against, so re-running it after a human
correction in the CSV keeps the golden fixture in sync.

Usage:
    python scripts/eval/golden/build_from_csv.py james-hardie hume-doors jds-doors
    python scripts/eval/golden/build_from_csv.py --all
"""

import argparse
import csv
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
EXTRACTIONS_DIR = REPO_ROOT / "apps/web/data/extractions"
GOLDEN_DIR = Path(__file__).resolve().parent

DIMENSION_FIELDS = [
    "length_mm", "width_mm", "height_mm", "thickness_mm", "depth_mm",
    "gauge_mm", "diameter_mm", "roll_m", "length_m",
    "weight_kg", "weight_g", "volume_ml", "pieces",
]

# Best-effort display names for the eval report — the CSVs don't carry one.
SLUG_DISPLAY_NAMES = {
    "james-hardie": "James Hardie",
    "hume-doors": "Hume Doors",
    "jds-doors": "JDS Doors",
    "designer-groove": "Designer Groove",
}


def _num(v):
    v = (v or "").strip()
    if not v:
        return None
    try:
        f = float(v)
        return int(f) if f.is_integer() else f
    except ValueError:
        return None


def build_one(slug):
    src_dir = EXTRACTIONS_DIR / slug
    systems_csv = src_dir / "systems.csv"
    profiles_csv = src_dir / "profiles.csv"
    if not systems_csv.exists() or not profiles_csv.exists():
        print(f"[skip] {slug}: missing systems.csv/profiles.csv in {src_dir}")
        return None

    systems_by_name = {}
    order = []
    with systems_csv.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            name = (row.get("name") or "").strip()
            if not name:
                continue
            systems_by_name[name] = {
                "name": name,
                "product_code": (row.get("product_code") or "").strip() or None,
                "category": (row.get("category") or "").strip() or None,
                "profiles": [],
            }
            order.append(name)

    with profiles_csv.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            sys_name = (row.get("system_name") or "").strip()
            if sys_name not in systems_by_name:
                # Profile references a system not present in systems.csv —
                # keep it under its own bucket so it's still checked, rather
                # than silently dropped from the golden fixture.
                systems_by_name.setdefault(sys_name, {
                    "name": sys_name, "product_code": None, "category": None, "profiles": [],
                })
                if sys_name not in order:
                    order.append(sys_name)
            profile = {
                "profile_name": (row.get("profile_name") or row.get("name") or "").strip() or None,
                "product_code": (row.get("product_code") or "").strip() or None,
                "dimensions": (row.get("dimensions") or "").strip() or None,
                "uom": (row.get("uom") or "").strip() or None,
            }
            for field in DIMENSION_FIELDS:
                profile[field] = _num(row.get(field))
            systems_by_name[sys_name]["profiles"].append(profile)

    golden = {
        "manufacturer_slug": slug,
        "manufacturer_name": SLUG_DISPLAY_NAMES.get(slug, slug.replace("-", " ").title()),
        "systems": [systems_by_name[n] for n in order],
    }
    out_path = GOLDEN_DIR / f"{slug}.json"
    out_path.write_text(json.dumps(golden, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    n_systems = len(golden["systems"])
    n_profiles = sum(len(s["profiles"]) for s in golden["systems"])
    print(f"[ok] {slug}: {n_systems} systems, {n_profiles} profiles -> {out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slugs", nargs="*", help="Manufacturer directory names under apps/web/data/extractions/")
    parser.add_argument("--all", action="store_true", help="Build for every directory under apps/web/data/extractions/ (except column-schemas)")
    args = parser.parse_args()

    slugs = args.slugs
    if args.all:
        slugs = sorted(
            p.name for p in EXTRACTIONS_DIR.iterdir()
            if p.is_dir() and p.name != "column-schemas"
        )
    if not slugs:
        sys.exit("[ERROR] Pass manufacturer slugs or --all")

    for slug in slugs:
        build_one(slug)


if __name__ == "__main__":
    main()
