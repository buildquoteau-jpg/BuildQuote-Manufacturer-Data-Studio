#!/usr/bin/env python3
"""
insert_proclima_components.py
=============================
Direct insert of canonical Proclima component relationships.
No AI — sourced directly from the hints file and catalogue knowledge.

Components are products that SUPPORT a primary system (tools, tapes, grommets,
applicators). They are NOT separate systems in their own right even though
many appear as systems too — the component record here represents the
"use with" relationship only.

Run from repo root:
    python scripts/parser/insert_proclima_components.py [--dry-run]
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import dotenv_values

MANUFACTURER_ID = "c51fc77f-df29-42ae-8179-8a7ee77ae0b5"

# ---------------------------------------------------------------------------
# Canonical components
# Each component is a unique product record. System links defined separately.
# ---------------------------------------------------------------------------
COMPONENTS = [
    # Tapes
    {"name": "TESCON EXTORA®",          "category": "Tapes",       "uom": "m",    "description": "Weathertight sealing tape, 180-day UV. Range of widths for laps and penetrations on WRB membranes."},
    {"name": "TESCON EXTORA® PROFIL",   "category": "Tapes",       "uom": "m",    "description": "Split-backing weathertight tape for edge/profile applications. 12mm, 23mm, 25mm widths."},
    {"name": "TESCON EXTOSEAL®",        "category": "Tapes",       "uom": "m",    "description": "Butyl rubber/acrylate sill and flashing tape, 180-day UV."},
    {"name": "TESCON® NAIDECK patch",   "category": "Tapes",       "uom": "each", "description": "Double-sided butyl patch for sealing façade clip and brick tie penetrations."},
    {"name": "TESCON® NAIDECK",         "category": "Tapes",       "uom": "m",    "description": "Double-sided butyl strip for sealing purlin/batten penetrations."},
    {"name": "TESCON® VANA",            "category": "Tapes",       "uom": "m",    "description": "Multi-purpose polypropylene/acrylate tape for interior membrane overlaps."},
    {"name": "TESCON® PROFIL",          "category": "Tapes",       "uom": "m",    "description": "Three-strip release paper corner and junction sealing tape."},
    {"name": "CONTEGA® EXO",            "category": "Tapes",       "uom": "m",    "description": "Vapour permeable exterior joinery connection tape, 90-day UV."},
    {"name": "DUPLEX",                  "category": "Tapes",       "uom": "m",    "description": "Double-sided fixing tape for membrane overlaps and end laps."},
    # Adhesives / Sealants
    {"name": "ORCON® MULTIBOND",        "category": "Adhesives",   "uom": "unit", "description": "Solvent-free elastic airtight adhesive applied from a roll. For membranes to mineral/rough substrates."},
    {"name": "ORCON® CLASSIC",          "category": "Adhesives",   "uom": "unit", "description": "Multi-purpose copolymer liquid adhesive for membrane overlaps and connections."},
    {"name": "TESCON® PRIMER RP",       "category": "Adhesives",   "uom": "unit", "description": "Solvent-free acrylic primer for porous substrates before tape application."},
    # Tools
    {"name": "PRESSFIX",                "category": "Tools",       "uom": "unit", "description": "Roller pressing tool for activating pro clima adhesive tapes."},
    {"name": "PRESSFIX XL",             "category": "Tools",       "uom": "unit", "description": "Large roller pressing tool for SOLITEX EXTASANA ADHERO® self-adhesive membrane."},
    {"name": "AEROFIXX",                "category": "Tools",       "uom": "unit", "description": "Spray gun for applying AEROSANA® VISCONN sausage cartridges."},
    {"name": "AEROBOXX",                "category": "Tools",       "uom": "unit", "description": "Storage and transport case for AEROFIXX and AEROSANA® VISCONN accessories."},
    # Connection strips / accessories
    {"name": "INTELLO® conneX",         "category": "Connectors",  "uom": "m",    "description": "Connection strip for INTELLO® PLUS system junctions. 90-day UV."},
    {"name": "AEROSANA® VISCONN FLEECE","category": "Connectors",  "uom": "m",    "description": "PET fleece for embedding over cracks/joints with AEROSANA® VISCONN products."},
    {"name": "SOLITEX ADHERO® VISTO strips", "category": "Connectors", "uom": "m", "description": "Transparent connection strips and TPU control joint material for SOLITEX ADHERO® VISTO system."},
    {"name": "ADHERO® VISTO Floor Drain","category": "Accessories", "uom": "unit", "description": "PVC floor drain for SOLITEX ADHERO® VISTO membrane system."},
    {"name": "INSTAABOX",               "category": "Accessories", "uom": "unit", "description": "Polyethylene airtight sealing box for penetrations through INTELLO® PLUS."},
    # Grommets / pipe seals
    {"name": "KAFLEX mono/duo",         "category": "Grommets",    "uom": "unit", "description": "EPDM grommet for 1 or 2 cable penetrations through membranes."},
    {"name": "KAFLEX multi",            "category": "Grommets",    "uom": "unit", "description": "EPDM grommet for up to 16 cable penetrations through membranes."},
    {"name": "KAFLEX post",             "category": "Grommets",    "uom": "unit", "description": "EPDM/PP fleece patch for already-installed cable penetrations."},
    {"name": "ROFLEX 20",               "category": "Grommets",    "uom": "unit", "description": "EPDM pipe sealing grommet for pipes 15–30mm diameter."},
    {"name": "ROFLEX 30/50/100/150/200/250/300", "category": "Grommets", "uom": "unit", "description": "EPDM pipe sealing grommet range for pipes 30–320mm diameter."},
]

# ---------------------------------------------------------------------------
# Component links — {system_name, component_name, role}
# Only where the catalogue explicitly states a "use with" relationship.
# ---------------------------------------------------------------------------
LINKS = [
    # SOLITEX EXTASANA® — tapes for sealing and penetrations
    ("SOLITEX EXTASANA®",           "TESCON EXTORA®",           "recommended"),
    ("SOLITEX EXTASANA®",           "TESCON EXTOSEAL®",         "recommended"),
    ("SOLITEX EXTASANA®",           "TESCON® NAIDECK patch",    "recommended"),
    ("SOLITEX EXTASANA®",           "PRESSFIX",                 "tool"),

    # SOLITEX EXTASANA ADHERO® — self-adhesive, requires XL roller
    ("SOLITEX EXTASANA ADHERO®",    "PRESSFIX XL",              "required"),
    ("SOLITEX EXTASANA ADHERO®",    "TESCON EXTOSEAL®",         "recommended"),
    ("SOLITEX EXTASANA ADHERO®",    "TESCON® NAIDECK patch",    "recommended"),

    # SOLITEX ADHERO® FC
    ("SOLITEX ADHERO® FC",          "TESCON EXTORA®",           "recommended"),
    ("SOLITEX ADHERO® FC",          "TESCON EXTOSEAL®",         "recommended"),
    ("SOLITEX ADHERO® FC",          "TESCON® NAIDECK patch",    "recommended"),
    ("SOLITEX ADHERO® FC",          "PRESSFIX",                 "tool"),

    # SOLITEX ADHERO® VISTO — floor/CLT membrane with specific accessories
    ("SOLITEX ADHERO® VISTO",       "SOLITEX ADHERO® VISTO strips", "component"),
    ("SOLITEX ADHERO® VISTO",       "ADHERO® VISTO Floor Drain",    "component"),
    ("SOLITEX ADHERO® VISTO",       "TESCON EXTOSEAL®",             "recommended"),

    # SOLITEX ADHERO® VISTO strips — used with VISTO system
    ("SOLITEX ADHERO® VISTO strips","TESCON EXTORA®",           "recommended"),

    # SOLITEX MENTO® PLUS / 5000 / ULTRA — roof WRBs
    ("SOLITEX MENTO® PLUS",         "TESCON EXTORA®",           "recommended"),
    ("SOLITEX MENTO® PLUS",         "TESCON EXTOSEAL®",         "recommended"),
    ("SOLITEX MENTO® PLUS",         "TESCON® NAIDECK patch",    "recommended"),
    ("SOLITEX MENTO® 5000",         "TESCON EXTORA®",           "recommended"),
    ("SOLITEX MENTO® 5000",         "TESCON® NAIDECK patch",    "recommended"),
    ("SOLITEX MENTO® ULTRA",        "TESCON EXTORA®",           "recommended"),
    ("SOLITEX MENTO® ULTRA",        "TESCON EXTOSEAL®",         "recommended"),
    ("SOLITEX MENTO® ULTRA",        "TESCON® NAIDECK patch",    "recommended"),

    # DA — vapour barrier
    ("DA",                          "TESCON EXTORA®",           "recommended"),
    ("DA",                          "TESCON® VANA",             "recommended"),
    ("DA",                          "ORCON® MULTIBOND",         "recommended"),

    # TFLEX®
    ("TFLEX®",                      "TESCON EXTORA®",           "recommended"),

    # INTELLO® PLUS — IAB with full accessory set
    ("INTELLO® PLUS",               "INTELLO® conneX",          "component"),
    ("INTELLO® PLUS",               "TESCON® VANA",             "required"),
    ("INTELLO® PLUS",               "ORCON® MULTIBOND",         "recommended"),
    ("INTELLO® PLUS",               "ORCON® CLASSIC",           "recommended"),
    ("INTELLO® PLUS",               "INSTAABOX",                "component"),
    ("INTELLO® PLUS",               "KAFLEX mono/duo",          "component"),
    ("INTELLO® PLUS",               "KAFLEX multi",             "component"),
    ("INTELLO® PLUS",               "KAFLEX post",              "component"),
    ("INTELLO® PLUS",               "ROFLEX 20",                "component"),
    ("INTELLO® PLUS",               "ROFLEX 30/50/100/150/200/250/300", "component"),

    # AEROSANA® VISCONN — sprayable sealants need spray gun
    ("AEROSANA® VISCONN",           "AEROFIXX",                 "required"),
    ("AEROSANA® VISCONN",           "AEROBOXX",                 "tool"),
    ("AEROSANA® VISCONN",           "AEROSANA® VISCONN FLEECE", "component"),
    ("AEROSANA® VISCONN WHITE",     "AEROFIXX",                 "required"),
    ("AEROSANA® VISCONN WHITE",     "AEROBOXX",                 "tool"),
    ("AEROSANA® VISCONN FIBRE",     "AEROFIXX",                 "required"),
    ("AEROSANA® VISCONN FIBRE",     "AEROBOXX",                 "tool"),

    # TESCON tapes — primer recommended for porous substrates
    ("TESCON EXTORA®",              "TESCON® PRIMER RP",        "optional"),
    ("TESCON EXTOSEAL®",            "TESCON® PRIMER RP",        "optional"),
    ("TESCON® VANA",                "TESCON® PRIMER RP",        "optional"),
    ("CONTEGA® EXO",                "TESCON® PRIMER RP",        "optional"),

    # CONTEGA joinery tapes
    ("CONTEGA® EXO",                "TESCON® PROFIL",           "recommended"),

    # KAFLEX grommets — sealed with tape
    ("KAFLEX mono/duo",             "TESCON® VANA",             "recommended"),
    ("KAFLEX multi",                "TESCON® VANA",             "recommended"),
    ("KAFLEX post",                 "TESCON® VANA",             "recommended"),

    # ROFLEX pipe seals
    ("ROFLEX 20",                   "TESCON EXTORA®",           "recommended"),
    ("ROFLEX 20",                   "TESCON® NAIDECK patch",    "recommended"),
    ("ROFLEX 30/50/100/150/200/250/300", "TESCON EXTORA®",      "recommended"),
    ("ROFLEX 30/50/100/150/200/250/300", "TESCON® NAIDECK patch", "recommended"),

    # 8mm 3D Separation Mesh
    ("8mm 3D Separation Mesh",      "TESCON EXTORA®",           "recommended"),

    # INSTAABOX
    ("INSTAABOX",                   "TESCON® VANA",             "recommended"),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    repo_root = Path(__file__).parent.parent.parent
    env = dotenv_values(str(repo_root / ".env.local"))
    url = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("[ERROR] Supabase URL/key not found in .env.local")

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    print(f"[insert] Target: {url}")
    print(f"[insert] Components to insert: {len(COMPONENTS)}")
    print(f"[insert] Links to insert: {len(LINKS)}")
    print(f"[insert] Dry run: {args.dry_run}\n")

    if args.dry_run:
        print("Components:")
        for c in COMPONENTS:
            print(f"  {c['name']} ({c['category']}, {c['uom']})")
        print(f"\nLinks ({len(LINKS)}):")
        for sys_name, comp_name, role in LINKS:
            print(f"  {sys_name} → {comp_name} [{role}]")
        return

    with httpx.Client(timeout=30) as client:
        # Fetch system name→id map
        r = client.get(
            f"{url}/rest/v1/staged_systems?manufacturer_id=eq.{MANUFACTURER_ID}&select=id,name",
            headers=headers,
        )
        r.raise_for_status()
        sys_map = {s["name"]: s["id"] for s in r.json()}
        print(f"[insert] Found {len(sys_map)} systems in DB\n")

        # Clear existing components + links
        sys_ids = ",".join(sys_map.values())
        client.delete(f"{url}/rest/v1/staged_system_components?staged_system_id=in.({sys_ids})", headers=headers)
        client.delete(f"{url}/rest/v1/staged_components?manufacturer_id=eq.{MANUFACTURER_ID}", headers=headers)
        print("[insert] Cleared existing components and links\n")

        # Insert components
        now = datetime.now(timezone.utc).isoformat()
        comp_map = {}  # name → id
        for i, c in enumerate(COMPONENTS):
            payload = {
                "manufacturer_id": MANUFACTURER_ID,
                "name": c["name"],
                "category": c["category"],
                "uom": c["uom"],
                "description": c.get("description"),
                "sort_order": i * 10,
                "extraction_confidence": 1.0,
            }
            r = client.post(f"{url}/rest/v1/staged_components", json=payload, headers=headers)
            if r.status_code not in (200, 201):
                print(f"  [ERROR] {c['name']}: {r.status_code} {r.text}")
                sys.exit(1)
            row = r.json()
            row = row[0] if isinstance(row, list) else row
            comp_map[c["name"]] = row["id"]
            print(f"  [component] {c['name']} → {row['id']}")

        print(f"\n[insert] {len(comp_map)} components inserted\n")

        # Insert links
        inserted = 0
        skipped = 0
        for sys_name, comp_name, role in LINKS:
            sys_id = sys_map.get(sys_name)
            comp_id = comp_map.get(comp_name)
            if not sys_id:
                print(f"  [SKIP] System not found: {sys_name}")
                skipped += 1
                continue
            if not comp_id:
                print(f"  [SKIP] Component not found: {comp_name}")
                skipped += 1
                continue
            payload = {
                "staged_system_id": sys_id,
                "staged_component_id": comp_id,
                "role": role,
                "sort_order": inserted * 10,
            }
            r = client.post(f"{url}/rest/v1/staged_system_components", json=payload, headers=headers)
            if r.status_code not in (200, 201):
                print(f"  [ERROR] link {sys_name}→{comp_name}: {r.status_code} {r.text}")
                sys.exit(1)
            inserted += 1

        print(f"\n[insert] Done — {len(comp_map)} components, {inserted} links inserted, {skipped} skipped")


if __name__ == "__main__":
    main()
