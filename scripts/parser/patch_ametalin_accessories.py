#!/usr/bin/env python3
"""
patch_ametalin_accessories.py
=============================
Inserts Ametalin insulation accessories as staged_components, links them to
all Ametalin staged_systems, and patches every system with install_guide_urls (jsonb, migration 026).

Data sourced from: Ametalin Insulation Accessories Range Guide (APS-21223-0).
  - sku                = Bunnings item number (from "Item Number" column)
  - manufacturer_product_code in parser_notes = product code from manufacturer

Usage:
    python scripts/parser/patch_ametalin_accessories.py --manufacturer-id <uuid> [--dry-run]
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import dotenv_values

INSTALL_GUIDE_URL = (
    "https://www.ametalin.com/wp-content/uploads/PDFs/VirtualBooth/"
    "13-Ametalin-Insulation-Accessories-Range-Guide.pdf"
)

# ---------------------------------------------------------------------------
# Accessories from the Ametalin Insulation Accessories Range Guide APS-21223-0
# Fields: name, sku (Bunnings item no.), manufacturer_product_code, category,
#         description, uom, width_mm, thickness_mm, roll_m, length_mm, height_mm
# ---------------------------------------------------------------------------
COMPONENTS = [
    {
        "name":     "Ametalin Double Sided Insulation Fixing Tape",
        "sku":      "0811320",
        "mpn":      "DSFT-3850",
        "category": "Tape",
        "uom":      "roll",
        "description": (
            "Double-sided fixing tape for installing reflective foil insulation and "
            "permeable membranes to steel-frame stud work. Aggressive acrylic adhesive, "
            "hand tearable, conforms to irregular surfaces. Temperature range -30°C to +120°C."
        ),
        "width_mm":     38,
        "thickness_mm": 0.150,
        "roll_m":       50,
    },
    {
        "name":     "Ametalin QuickTape™",
        "sku":      "0248911",
        "mpn":      "QT-4850",
        "category": "Tape",
        "uom":      "roll",
        "description": (
            "Release liner-free woven polymer fabric tape for joining, repairs, and sealing "
            "overlapped edges of building membranes. Premium grade adhesive, hand tearable. "
            "Ideal for VapourTech® wall wraps and Passive House air-tight sealing. "
            "Temperature range -30°C to +80°C."
        ),
        "width_mm":     48,
        "thickness_mm": 0.205,
        "roll_m":       50,
    },
    {
        "name":     "Ametalin Reinforced Insulation Ducting Tape™",
        "sku":      "0029077",
        "mpn":      "IDTR-7250",
        "category": "Tape",
        "uom":      "roll",
        "description": (
            "Reinforced high-performance tape with cold-weather acrylic adhesive. "
            "UV resistant, fire-rated, vapour sealing, hand tearable. Ideal for reflective "
            "membranes and HVAC/ducting applications. Temperature range -30°C to +120°C."
        ),
        "width_mm":     72,
        "thickness_mm": 0.178,
        "roll_m":       50,
    },
    {
        "name":     "Ametalin Insulation Ducting Tape™",
        "sku":      "081027",
        "mpn":      "IDT-5050",
        "category": "Tape",
        "uom":      "roll",
        "description": (
            "Premium UV-resistant metallised polyester tape with cold-weather acrylic adhesive. "
            "UV resistant, fire-rated, vapour sealing, hand tearable. Won't delaminate with age. "
            "Ideal for reflective membranes and HVAC/ducting. Temperature range -30°C to +120°C."
        ),
        "width_mm":     50,
        "thickness_mm": 0.40,
        "roll_m":       50,
    },
    {
        "name":     "Ametalin Non-combustible Insulation Flashing Tape",
        "sku":      None,          # CSO = call sales office, not a retail SKU
        "mpn":      "NCFT-150-25",
        "category": "Tape",
        "uom":      "roll",
        "description": (
            "Non-combustible wide-format flashing tape for weatherproofing and vapour-sealing "
            "joins, overlaps, and repairs around window and door penetrations. Laminated E-glass "
            "fabric with high-tack solvent acrylic adhesive. Suitable for all BALs to FZ. "
            "Temperature range -30°C to +120°C."
        ),
        "width_mm":     150,
        "thickness_mm": 10,
        "roll_m":       25,
    },
    {
        "name":     "Ametalin Cap Nails™",
        "sku":      "0131605",
        "mpn":      "CN-250",
        "category": "Fastener",
        "uom":      "box",
        "description": (
            "Collated polymer cap head nails — 10 nails per strip, 25 strips per box (250 nails). "
            "25mm nail length. Provides 20× the holding power of plain nails or staples. "
            "Distributes wind load on membrane; reduces blow-offs. Recommended for timber frame "
            "installations in high-wind areas."
        ),
        "width_mm":  25,   # cap/nail diameter
        "length_mm": 25,   # nail length in mm
        "pieces":    250,
    },
    {
        "name":     "Ametalin ThermalCav™ Drainage Battens R0.26",
        "sku":      "0501110",
        "mpn":      "TCDB-451200",
        "category": "Thermal Break Batten",
        "uom":      "pack",
        "description": (
            "Open-air-flow R0.26 thermal break cavity drainage battens for steel frame constructions. "
            "20mm depth creates a drained, ventilated cavity behind roof and wall cladding. "
            "Self-adhesive backing for fast installation. Termite, mould, and mildew resistant. "
            "Meets NCC 2022 R0.2 steel frame thermal break requirement."
        ),
        "width_mm":     45,
        "height_mm":    20,   # physical thickness / depth
        "length_mm":    1200,
        "pieces":       25,
    },
    {
        "name":     "Ametalin Cavity Drainage Battens™ R0.15",
        "sku":      "0441505",
        "mpn":      "CDB-451200",
        "category": "Cavity Drainage Batten",
        "uom":      "pack",
        "description": (
            "Open air-flow cavity drainage battens for roof and wall cladding applications. "
            "R0.15 thermal resistance in-situ. 10mm depth creates a natural drainage and "
            "ventilation plane. Self-adhesive backing. Termite, mould, and mildew resistant."
        ),
        "width_mm":     45,
        "height_mm":    10,
        "length_mm":    1200,
        "pieces":       25,
    },
    {
        "name":     "Ametalin ThermalBreak® Strip™ R0.25",
        "sku":      "0401288",
        "mpn":      "TBSTRIP-432750",
        "category": "Thermal Break Strip",
        "uom":      "strip",
        "description": (
            "Dual-layer high-density closed-cell XPE foam core self-adhesive strip. "
            "Creates R0.25 thermal barrier between steel framing and cladding or roofing sheets. "
            "Compression resistant, easily cut to length. Exceeds NCC R0.2 thermal break requirement."
        ),
        "width_mm":     43,
        "height_mm":    10,
        "length_mm":    2750,
    },
    {
        "name":     "Ametalin Non-combustible ThermalBreak® Strip™ R0.24",
        "sku":      "0441506",
        "mpn":      "NCTBSTRIP-RL-451200",
        "category": "Thermal Break Strip",
        "uom":      "strip",
        "description": (
            "Not deemed combustible thermal break strip for non-combustible steel frame constructions "
            "as required by NCC 2022. Delivers R0.2 in-situ thermal break between steel frames, "
            "roofing sheets, and cladding. High-tack adhesive, chemically stable, compression resistant. "
            "Non-irritant, odorless; will not support mold or bacterial growth."
        ),
        "width_mm":     45,
        "height_mm":    10,
        "length_mm":    1200,
    },
]


def build_component_payload(manufacturer_id: str, c: dict, sort_order: int) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "manufacturer_id":        manufacturer_id,
        "name":                   c["name"],
        "category":               c["category"],
        "uom":                    c["uom"],
        "description":            c.get("description"),
        "sort_order":             sort_order,
        "extraction_confidence":  1.0,
        "extracted_at":           now,
        "parser_notes":           {"manufacturer_product_code": c["mpn"]},
    }
    if c.get("sku"):
        payload["sku"] = c["sku"]
    if c.get("width_mm") is not None:
        payload["width_mm"] = c["width_mm"]
    if c.get("thickness_mm") is not None:
        payload["thickness_mm"] = c["thickness_mm"]
    if c.get("height_mm") is not None:
        payload["height_mm"] = c["height_mm"]
    if c.get("length_mm") is not None:
        payload["length_mm"] = c["length_mm"]
    if c.get("roll_m") is not None:
        payload["roll_m"] = c["roll_m"]
    if c.get("pieces") is not None:
        payload["pieces"] = c["pieces"]
    return payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manufacturer-id", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    repo_root = Path(__file__).parent.parent.parent
    env = dotenv_values(str(repo_root / ".env.local"))
    url = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("[ERROR] Supabase URL/key not found in .env.local")

    manufacturer_id = args.manufacturer_id
    mode = "DRY RUN" if args.dry_run else "LIVE"

    print(f"[patch_ametalin_accessories] {mode}")
    print(f"  manufacturer_id: {manufacturer_id}")
    print(f"  components:      {len(COMPONENTS)}")
    print(f"  install_guide:   {INSTALL_GUIDE_URL}\n")

    if args.dry_run:
        print("Components to insert:")
        for c in COMPONENTS:
            print(f"  [{c['category']}] {c['name']} — SKU: {c['sku']} / MPN: {c['mpn']}")
        print(f"\nAll systems will be patched with install_guide_urls.")
        return

    headers = {
        "apikey":        key,
        "Authorization": f"Bearer {key}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }

    with httpx.Client(timeout=30) as client:

        # 1. Fetch all Ametalin systems
        r = client.get(
            f"{url}/rest/v1/staged_systems"
            f"?manufacturer_id=eq.{manufacturer_id}&select=id,name",
            headers=headers,
        )
        r.raise_for_status()
        systems = r.json()
        sys_map = {s["name"]: s["id"] for s in systems}
        print(f"[1/3] Found {len(sys_map)} systems in DB:")
        for name in sys_map:
            print(f"  {name}")

        # 2. Clear existing components + links for this manufacturer
        if sys_map:
            sys_ids = ",".join(sys_map.values())
            client.delete(
                f"{url}/rest/v1/staged_system_components?staged_system_id=in.({sys_ids})",
                headers={**headers, "Prefer": "return=minimal"},
            )
        client.delete(
            f"{url}/rest/v1/staged_components?manufacturer_id=eq.{manufacturer_id}",
            headers={**headers, "Prefer": "return=minimal"},
        )
        print("\n[2/3] Cleared existing components and links")

        # 3. Insert components
        print(f"\n[3/3] Inserting {len(COMPONENTS)} components...")
        comp_map = {}  # name → id
        for i, c in enumerate(COMPONENTS):
            payload = build_component_payload(manufacturer_id, c, i * 10)
            r = client.post(
                f"{url}/rest/v1/staged_components",
                json=payload,
                headers=headers,
            )
            if r.status_code not in (200, 201):
                print(f"  [ERROR] {c['name']}: {r.status_code} {r.text}")
                sys.exit(1)
            row = r.json()
            row = row[0] if isinstance(row, list) else row
            comp_map[c["name"]] = row["id"]
            print(f"  [ok] {c['name']}")
            print(f"       SKU={c['sku']}  MPN={c['mpn']}  id={row['id']}")

        # 4. Link every component to every system as "recommended"
        print(f"\n[4/4] Linking {len(comp_map)} components × {len(sys_map)} systems...")
        link_count = 0
        for sys_name, sys_id in sys_map.items():
            for j, (comp_name, comp_id) in enumerate(comp_map.items()):
                payload = {
                    "staged_system_id":   sys_id,
                    "staged_component_id": comp_id,
                    "role":               "recommended",
                    "sort_order":         j * 10,
                }
                r = client.post(
                    f"{url}/rest/v1/staged_system_components",
                    json=payload,
                    headers={**headers, "Prefer": "return=minimal"},
                )
                if r.status_code not in (200, 201):
                    print(f"  [ERROR] link {sys_name}→{comp_name}: {r.status_code} {r.text}")
                    sys.exit(1)
                link_count += 1
        print(f"  {link_count} links created")

        # 5. Patch all systems with install_guide_urls (JSONB array)
        print(f"\n[5/5] Patching {len(sys_map)} systems with install_guide_urls...")
        install_guide_entry = [{"label": "Insulation Accessories Range Guide", "url": INSTALL_GUIDE_URL}]
        patch_payload = {"install_guide_urls": json.dumps(install_guide_entry)}
        r = client.patch(
            f"{url}/rest/v1/staged_systems?manufacturer_id=eq.{manufacturer_id}",
            json=patch_payload,
            headers={**headers, "Prefer": "return=minimal"},
        )
        if r.status_code not in (200, 201, 204):
            print(f"  [ERROR] patch install_guide_urls: {r.status_code} {r.text}")
            sys.exit(1)
        print(f"  [ok] install_guide_urls set on all systems")

    print(f"\n[done] {len(comp_map)} components, {link_count} links, {len(sys_map)} systems patched")


if __name__ == "__main__":
    main()
