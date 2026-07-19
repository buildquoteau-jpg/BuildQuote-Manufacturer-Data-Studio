#!/usr/bin/env python3
"""Deterministically sanitize the 2026-07-19 NewTechWood parser plan.

No AI calls and no database writes. The source plan is never modified.
"""

import argparse
import json
import re
import unicodedata
from pathlib import Path


SYSTEM_MAP = {
    "system_8": "system_7",   # Nivo Pedestal System -> Nivo Pedestals
    "system_9": "system_6",   # Castellation ... System -> canonical range
    "system_10": "system_5",  # Shadowline ... System -> canonical range
}
DROP_SYSTEMS = {"system_11"}  # installation guide, not a product system
UNSUPPORTED_SKUS = {
    "NPTAD-677", "NPT25-337", "NPT40-273", "NPT50-274",
    "NPT80-275", "NPT140-276", "NPEX60-0206", "NPSC-0338",
}


def norm(value):
    text = unicodedata.normalize("NFKC", value or "").casefold()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def confidence(row):
    try:
        return float(row.get("extraction_confidence") or 0)
    except (TypeError, ValueError):
        return 0


def dedupe(rows, key_fn):
    kept = {}
    remap = {}
    for row in rows:
        key = key_fn(row)
        old_temp = row.get("_temp_key")
        if key not in kept:
            kept[key] = row
            continue
        winner = kept[key]
        if confidence(row) > confidence(winner):
            loser_temp = winner.get("_temp_key")
            kept[key] = row
            if loser_temp and old_temp:
                remap[loser_temp] = old_temp
        elif old_temp and winner.get("_temp_key"):
            remap[old_temp] = winner["_temp_key"]
    return list(kept.values()), remap


def rewrite(value, remap):
    if isinstance(value, dict):
        return {k: rewrite(v, remap) for k, v in value.items()}
    if isinstance(value, list):
        return [rewrite(v, remap) for v in value]
    if isinstance(value, str):
        while value in remap and remap[value] != value:
            value = remap[value]
        return value
    return value


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    plan = json.loads(Path(args.input).read_text(encoding="utf-8"))
    before = {k: len(v) for k, v in plan.items() if isinstance(v, list)}

    plan["stagedSystems"] = [
        row for row in plan["stagedSystems"]
        if row.get("_temp_key") not in DROP_SYSTEMS | set(SYSTEM_MAP)
    ]
    plan = rewrite(plan, SYSTEM_MAP)

    for component in plan["stagedComponents"]:
        if component.get("sku") in UNSUPPORTED_SKUS:
            old_sku = component["sku"]
            component["sku"] = None
            notes = component.setdefault("parser_notes", [])
            notes.append({
                "qa_flag": "unsupported_sku_removed",
                "severity": "high",
                "detail": f"SKU {old_sku} removed because it does not occur anywhere in the merged source.",
                "source": "deterministic_sanitizer",
                "needs_human_review": True,
            })

    profiles, profile_map = dedupe(
        plan["stagedSystemProfiles"],
        lambda r: (r.get("_staged_system_temp_key"), norm(r.get("product_code")) or norm(r.get("name"))),
    )
    colours, colour_map = dedupe(
        plan["stagedSystemColours"],
        lambda r: (r.get("_staged_system_temp_key"), norm(r.get("colour_name"))),
    )
    components, component_map = dedupe(
        plan["stagedComponents"],
        lambda r: ("sku", norm(r.get("sku"))) if norm(r.get("sku")) else ("name", norm(r.get("name"))),
    )
    remap = {**profile_map, **colour_map, **component_map}
    plan["stagedSystemProfiles"] = profiles
    plan["stagedSystemColours"] = colours
    plan["stagedComponents"] = components
    plan = rewrite(plan, remap)

    links, _ = dedupe(
        plan["stagedSystemComponents"],
        lambda r: (r.get("_staged_system_temp_key"), r.get("_staged_component_temp_key")),
    )
    plan["stagedSystemComponents"] = links

    valid_systems = {r["_temp_key"] for r in plan["stagedSystems"]}
    valid_profiles = {r["_temp_key"] for r in plan["stagedSystemProfiles"]}
    valid_colours = {r["_temp_key"] for r in plan["stagedSystemColours"]}
    valid_components = {r["_temp_key"] for r in plan["stagedComponents"]}
    plan["stagedSystemProfiles"] = [r for r in plan["stagedSystemProfiles"] if r.get("_staged_system_temp_key") in valid_systems]
    plan["stagedSystemColours"] = [r for r in plan["stagedSystemColours"] if r.get("_staged_system_temp_key") in valid_systems]
    plan["stagedSystemComponents"] = [
        r for r in plan["stagedSystemComponents"]
        if r.get("_staged_system_temp_key") in valid_systems
        and r.get("_staged_component_temp_key") in valid_components
    ]

    valid_entities = valid_systems | valid_profiles | valid_colours | valid_components
    for section in ("fieldVerifications", "parserFieldEvidence"):
        plan[section] = [
            row for row in plan[section]
            if not row.get("_entity_temp_key") or row.get("_entity_temp_key") in valid_entities
        ]

    after = {k: len(v) for k, v in plan.items() if isinstance(v, list)}
    Path(args.output).write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"before": before, "after": after, "output": args.output}, indent=2))


if __name__ == "__main__":
    main()
