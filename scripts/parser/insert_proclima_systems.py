#!/usr/bin/env python3
"""
insert_proclima_systems.py
==========================
Clears existing staged data for Proclima and inserts the canonical 42 systems
directly from the hints file — no AI needed for this part.

Leaves hero_image_url, website_url, install_guide_url, tech_data_url as NULL
so the web enricher and secondary parse stages can fill them in.

Run from repo root:
    python scripts/parser/insert_proclima_systems.py [--dry-run]

After this, run Stage 2 only to extract component links:
    python scripts/parser/run_parser.py \
        --input ".local/docling-output/<run>/output.md" \
        --manufacturer-id "c51fc77f-df29-42ae-8179-8a7ee77ae0b5" \
        --manufacturer-name "Proclima" \
        --hints "prompts/manufacturer-hints/proclima.md" \
        --stage 2 --production
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import dotenv_values

MANUFACTURER_ID = "c51fc77f-df29-42ae-8179-8a7ee77ae0b5"
MANUFACTURER_NAME = "Proclima"

# ---------------------------------------------------------------------------
# Canonical system list — 42 products, grouped as per hints file
# Fields: name, subcategory, description, moisture_resistant, uom, sort_order
# category is always "Building Wrap & Membranes" for all pro clima products
# ---------------------------------------------------------------------------
SYSTEMS = [
    # ── Weather Resistive Barriers ──────────────────────────────────────────
    {
        "name": "SOLITEX EXTASANA®",
        "subcategory": "Wall WRB",
        "description": "Non-porous TEEE film wall weather resistive barrier. 180-day UV resistance, Class 4 vapour permeable. For walls and commercial applications requiring long-term UV exposure tolerance.",
        "moisture_resistant": True,
        "notes": "Australian-made: false — manufactured in Germany.",
        "sort_order": 10,
    },
    {
        "name": "SOLITEX EXTASANA ADHERO®",
        "subcategory": "Self-Adhesive Wall/Roof WRB",
        "description": "Full self-adhesion wall and roof WRB with 180-day UV resistance. Solid adhesive backing — no mechanical fixing required. Class 4 vapour permeable.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 20,
    },
    {
        "name": "SOLITEX ADHERO® FC",
        "subcategory": "Self-Adhesive Wall/Roof WRB",
        "description": "Full-surface self-adhesive wall and roof WRB. Wind and rain protection, Class 4 vapour permeable. Suitable for timber frame and mass timber construction.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 30,
    },
    {
        "name": "SOLITEX ADHERO® VISTO",
        "subcategory": "Self-Adhesive Floor/Intermediate WRB",
        "description": "Transparent self-adhesive WRB for floors and intermediate layers. 6-week UV resistance, anti-slip surface. Designed for CLT and mass timber construction.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 40,
    },
    {
        "name": "SOLITEX ADHERO® VISTO strips",
        "subcategory": "Connection Strip / Façade Control Joint",
        "description": "Transparent connection strips and TPU façade control joint material for use with SOLITEX ADHERO® VISTO system.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 50,
    },
    {
        "name": "TFLEX®",
        "subcategory": "Wall WRB",
        "description": "Wall weather resistive barrier. Listed in catalogue — extract detail from body pages if present.",
        "moisture_resistant": True,
        "notes": "Detail pages may be image-only — may need secondary parse.",
        "sort_order": 60,
    },
    {
        "name": "SOLITEX MENTO® PLUS",
        "subcategory": "Roof WRB",
        "description": "Scrim-reinforced roof WRB with 180-day UV resistance. Medium duty, suitable for standard pitched roof applications.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 70,
    },
    {
        "name": "SOLITEX MENTO® 5000",
        "subcategory": "Roof WRB",
        "description": "Lightweight roof WRB rated to 120°C. 180-day UV resistance. Designed for metal roofing and light duty applications.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 80,
    },
    {
        "name": "SOLITEX MENTO® ULTRA",
        "subcategory": "Roof WRB",
        "description": "Extra heavy duty scrim-reinforced roof WRB. 180-day UV resistance. For demanding roof applications.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 90,
    },
    {
        "name": "DA",
        "subcategory": "Wall WRB (vapour barrier)",
        "description": "Tropical climate wall WRB and vapour barrier. Class 2 vapour barrier with airtight performance. For high-humidity and tropical Australian climates.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 100,
    },
    {
        "name": "8mm 3D Separation Mesh",
        "subcategory": "Roof/Façade separation layer",
        "description": "Polypropylene 3D separation mesh providing acoustic damping and ventilation behind cladding and roofing. 90-day UV resistance.",
        "moisture_resistant": False,
        "notes": None,
        "sort_order": 110,
    },

    # ── Intelligent Air Barriers ────────────────────────────────────────────
    {
        "name": "INTELLO® PLUS",
        "subcategory": "Intelligent Air Barrier",
        "description": "Humidity-variable intelligent air barrier membrane with Hydrosafe® technology. Class 2–3 vapour resistance that adapts to seasonal humidity changes. For timber frame and mass timber construction.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 120,
    },
    {
        "name": "INTELLO® conneX",
        "subcategory": "IAB Connection Strip",
        "description": "Connection strip for INTELLO® PLUS system junctions — wall/ceiling, wall/floor, and penetration details. 90-day UV resistance.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 130,
    },
    {
        "name": "AEROSANA® VISCONN",
        "subcategory": "Sprayable Airtightness Sealant",
        "description": "Brush or spray-applied humidity-variable airtightness membrane. Acrylate-based, adheres to standard construction materials. For connections, junctions and detailed sealing.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 140,
    },
    {
        "name": "AEROSANA® VISCONN WHITE",
        "subcategory": "Sprayable Airtightness Sealant",
        "description": "White-coloured variant of AEROSANA® VISCONN. Same humidity-variable airtightness performance, white finish.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 150,
    },
    {
        "name": "AEROSANA® VISCONN FIBRE",
        "subcategory": "Fibre-Reinforced Sprayable Sealant",
        "description": "Fibre-reinforced version of AEROSANA® VISCONN for sealing larger gaps up to 20mm. For complex junctions in mass timber and concrete construction.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 160,
    },
    {
        "name": "AEROSANA® VISCONN FLEECE",
        "subcategory": "Supplementary Fleece",
        "description": "PET fleece for embedding over cracks and joints in conjunction with AEROSANA® VISCONN products. Bridges surface defects before sealant application.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 170,
    },
    {
        "name": "AEROFIXX",
        "subcategory": "Application Tool",
        "description": "Specialist spray gun for applying AEROSANA® VISCONN sausage cartridges. Required for efficient spray application.",
        "moisture_resistant": False,
        "notes": None,
        "sort_order": 180,
    },
    {
        "name": "AEROBOXX",
        "subcategory": "Transport Case",
        "description": "Storage and transport case for AEROFIXX spray gun and AEROSANA® VISCONN accessories.",
        "moisture_resistant": False,
        "notes": None,
        "sort_order": 190,
    },

    # ── Adhesives, Tapes & Accessories ──────────────────────────────────────
    {
        "name": "TESCON EXTORA®",
        "subcategory": "Weathertight Sealing Tape",
        "description": "Polypropylene/acrylate weathertight sealing tape with 180-day UV resistance. Available in a range of widths for laps, junctions and penetrations on WRB membranes.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 200,
    },
    {
        "name": "TESCON EXTORA® PROFIL",
        "subcategory": "Weathertight Sealing Tape",
        "description": "Split-backing variant of TESCON EXTORA® for precise edge and profile applications. Available in 12mm, 23mm and 25mm widths.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 210,
    },
    {
        "name": "TESCON EXTOSEAL®",
        "subcategory": "Sill Tape (flashing tape)",
        "description": "Butyl rubber/acrylate self-sealing sill and flashing tape with 180-day UV resistance. For window and door sill connections and flashing details.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 220,
    },
    {
        "name": "TESCON® NAIDECK patch",
        "subcategory": "Self-Sealing Patch",
        "description": "Double-sided butyl self-sealing patch for sealing façade clip and brick tie penetrations through WRB membranes.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 230,
    },
    {
        "name": "TESCON® NAIDECK",
        "subcategory": "Self-Sealing Strip",
        "description": "Double-sided butyl self-sealing strip for sealing purlin and batten attachments through WRB and IAB membranes.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 240,
    },
    {
        "name": "CONTEGA® EXO",
        "subcategory": "Joinery Connection Tape (exterior)",
        "description": "Vapour permeable joinery connection tape for exterior window and door connections. 90-day UV resistance.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 250,
    },
    {
        "name": "CONTEGA® IQ",
        "subcategory": "Joinery Connection Tape",
        "description": "Interior joinery connection tape for window and door connections. Listed in catalogue — extract detail from body pages if present.",
        "moisture_resistant": True,
        "notes": "Detail pages may be image-only — may need secondary parse.",
        "sort_order": 260,
    },
    {
        "name": "CONTEGA® PV",
        "subcategory": "Joinery Connection Tape",
        "description": "Joinery connection tape. Listed in catalogue — extract detail from body pages if present.",
        "moisture_resistant": True,
        "notes": "Detail pages may be image-only — may need secondary parse.",
        "sort_order": 270,
    },
    {
        "name": "TESCON® VANA",
        "subcategory": "Multi-Purpose Adhesive Tape",
        "description": "Polypropylene/acrylate multi-purpose adhesive tape for interior use. For membrane overlaps and airtight connections in IAB systems.",
        "moisture_resistant": False,
        "notes": None,
        "sort_order": 280,
    },
    {
        "name": "TESCON® PROFIL",
        "subcategory": "Corner Sealing Tape",
        "description": "Three-strip release paper corner and junction sealing tape. For internal and external corners and complex junction details.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 290,
    },
    {
        "name": "PRESSFIX",
        "subcategory": "Tape Pressing Tool",
        "description": "Roller pressing tool for activating and firmly bonding pro clima adhesive tapes to substrates.",
        "moisture_resistant": False,
        "notes": None,
        "sort_order": 300,
    },
    {
        "name": "PRESSFIX XL",
        "subcategory": "Tape Pressing Tool (large)",
        "description": "Large-format roller pressing tool, specialist for activating SOLITEX EXTASANA ADHERO® self-adhesive membrane.",
        "moisture_resistant": False,
        "notes": None,
        "sort_order": 310,
    },
    {
        "name": "DUPLEX",
        "subcategory": "Double-Sided Fixing Tape",
        "description": "Double-sided fixing tape for connecting overlaps, end laps and membrane-to-membrane connections in WRB and IAB systems.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 320,
    },
    {
        "name": "ORCON® MULTIBOND",
        "subcategory": "Joint Adhesive (roll-applied)",
        "description": "Solvent-free permanent elastic frost-resistant airtight adhesive applied from a roll. For bonding INTELLO® and SOLITEX® membranes to mineral and rough adjacent components — masonry, plasterwork, concrete, rough-sawn timber.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 330,
    },
    {
        "name": "ORCON® CLASSIC",
        "subcategory": "Multi-Purpose Liquid Adhesive",
        "description": "Multi-purpose copolymer liquid sealant for airtight sealing of overlaps between pliable membranes and building materials. High elasticity once dry.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 340,
    },
    {
        "name": "TESCON® PRIMER RP",
        "subcategory": "Solvent-Free Primer",
        "description": "Solvent-free acrylic copolymer primer. Penetrates and impregnates porous substrates to provide a suitable bonding surface for pro clima tapes and sealants.",
        "moisture_resistant": False,
        "notes": None,
        "sort_order": 350,
    },
    {
        "name": "KAFLEX mono/duo",
        "subcategory": "Cable Sealing Grommets",
        "description": "EPDM cable sealing grommets for airtight sealing of 1 or 2 cable penetrations through WRB and IAB membranes.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 360,
    },
    {
        "name": "KAFLEX multi",
        "subcategory": "Cable Sealing Grommets",
        "description": "EPDM cable sealing grommet for airtight sealing of up to 16 cable penetrations through WRB and IAB membranes.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 370,
    },
    {
        "name": "KAFLEX post",
        "subcategory": "Cable Sealing Patch",
        "description": "EPDM/PP fleece cable sealing patch for sealing already-installed cables through membranes — no need to disconnect cables.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 380,
    },
    {
        "name": "ADHERO® VISTO Floor Drain",
        "subcategory": "Drainage Accessory",
        "description": "PVC floor drain accessory for use with SOLITEX ADHERO® VISTO membrane system. Provides airtight and watertight pipe penetration for floor drainage.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 390,
    },
    {
        "name": "ROFLEX 20",
        "subcategory": "Pipe Sealing Grommet",
        "description": "EPDM pipe sealing grommet with factory-bonded flange for pipes 15–30mm diameter. Provides airtight seal where pipes penetrate membranes or smooth non-mineral surfaces.",
        "moisture_resistant": True,
        "notes": None,
        "sort_order": 400,
    },
    {
        "name": "ROFLEX 30/50/100/150/200/250/300",
        "subcategory": "Pipe Sealing Grommets",
        "description": "EPDM pipe sealing grommet range for pipes 30–320mm diameter. Strong flexible EPDM for airtight sealing of pipe penetrations through airtightness layers and roof/wall underlays. Available in individual packs and big packs.",
        "moisture_resistant": True,
        "notes": "Size range covers: ROFLEX 30 (30–50mm), 50 (50–90mm), 100 (100–120mm), 150 (120–170mm), 200 (170–220mm), 250 (220–270mm), 300 (270–320mm).",
        "sort_order": 410,
    },
    {
        "name": "INSTAABOX",
        "subcategory": "Penetration Accessory",
        "description": "Polyethylene airtight sealing box for penetrations through air barrier membranes including INTELLO® PLUS. Flexible and malleable for quick installation around a range of penetration types.",
        "moisture_resistant": True,
        "notes": "Detail pages may be image-only — may need secondary parse.",
        "sort_order": 420,
    },
]


def main():
    parser = argparse.ArgumentParser(description="Direct insert canonical Proclima systems")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without inserting")
    parser.add_argument("--production", action="store_true", help="Target production Supabase")
    args = parser.parse_args()

    repo_root = Path(__file__).parent.parent.parent
    env = dotenv_values(str(repo_root / ".env.local"))

    if args.production:
        url = env.get("PRODUCTION_SUPABASE_URL", "").rstrip("/")
        key = env.get("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY", "")
    else:
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
    print(f"[insert] Manufacturer: {MANUFACTURER_NAME} ({MANUFACTURER_ID})")
    print(f"[insert] Systems to insert: {len(SYSTEMS)}")
    print(f"[insert] Dry run: {args.dry_run}\n")

    if args.dry_run:
        for s in SYSTEMS:
            print(f"  [{s['sort_order']:3d}] {s['name']} — {s['subcategory']}")
        print(f"\n[insert] Dry run complete — {len(SYSTEMS)} systems would be inserted")
        return

    # ── Step 1: clear existing staged data for this manufacturer ──────────
    print("[insert] Clearing existing staged data...")

    with httpx.Client(timeout=30) as client:
        # Get system IDs first (need them to delete child records)
        r = client.get(
            f"{url}/rest/v1/staged_systems?manufacturer_id=eq.{MANUFACTURER_ID}&select=id",
            headers=headers,
        )
        r.raise_for_status()
        existing_ids = [s["id"] for s in r.json()]

        if existing_ids:
            ids_str = ",".join(existing_ids)
            # Delete system_components links
            r = client.delete(
                f"{url}/rest/v1/staged_system_components?staged_system_id=in.({ids_str})",
                headers=headers,
            )
            print(f"  Deleted system_component links")

            # Delete system_profiles
            r = client.delete(
                f"{url}/rest/v1/staged_system_profiles?staged_system_id=in.({ids_str})",
                headers=headers,
            )
            print(f"  Deleted system profiles")

            # Delete system_colours
            r = client.delete(
                f"{url}/rest/v1/staged_system_colours?staged_system_id=in.({ids_str})",
                headers=headers,
            )
            print(f"  Deleted system colours")

        # Delete systems
        r = client.delete(
            f"{url}/rest/v1/staged_systems?manufacturer_id=eq.{MANUFACTURER_ID}",
            headers=headers,
        )
        print(f"  Deleted {len(existing_ids)} existing systems")

        # Delete components
        r = client.delete(
            f"{url}/rest/v1/staged_components?manufacturer_id=eq.{MANUFACTURER_ID}",
            headers=headers,
        )
        print(f"  Deleted existing components\n")

        # ── Step 2: insert canonical systems ──────────────────────────────
        print("[insert] Inserting systems...")
        now = datetime.now(timezone.utc).isoformat()
        inserted = []

        for s in SYSTEMS:
            payload = {
                "manufacturer_id": MANUFACTURER_ID,
                "name": s["name"],
                "category": "Building Wrap & Membranes",
                "subcategory": s["subcategory"],
                "description": s["description"],
                "moisture_resistant": s["moisture_resistant"],
                "australian_made": False,
                "double_sided": False,
                "notes": s.get("notes"),
                "sort_order": s["sort_order"],
                "extraction_confidence": 1.0,
                "verification_status": "pending_review",
                "extracted_at": now,
                # These are intentionally NULL — filled by web enricher / secondary parse:
                # hero_image_url, website_url, source_url, install_guide_url, tech_data_url
            }

            r = client.post(
                f"{url}/rest/v1/staged_systems",
                json=payload,
                headers=headers,
            )
            if r.status_code not in (200, 201):
                print(f"  [ERROR] Failed to insert '{s['name']}': {r.status_code} {r.text}")
                sys.exit(1)

            row = r.json()
            row = row[0] if isinstance(row, list) else row
            inserted.append(row)
            print(f"  [{s['sort_order']:3d}] {s['name']} -> {row['id']}")

    print(f"\n[insert] Done — {len(inserted)} systems inserted")
    print(f"\n[insert] Next step — run Stage 2 to extract component links:")
    print(f"""
    python scripts/parser/run_parser.py \\
        --input ".local/docling-output/58aa9da5-5003-4666-8484-d071a328c5a7_chunked_20260614T065234Z/output.md" \\
        --manufacturer-id "{MANUFACTURER_ID}" \\
        --manufacturer-name "{MANUFACTURER_NAME}" \\
        --hints "prompts/manufacturer-hints/proclima.md" \\
        --stage 2 \\
        --production
    """)


if __name__ == "__main__":
    main()
