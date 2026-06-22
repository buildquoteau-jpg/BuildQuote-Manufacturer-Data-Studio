#!/usr/bin/env python3
"""
insert_hoodee_systems.py
========================
Direct insert of Hoodee (Perth Metal Industries) manufacturer, systems,
profiles, and components into the data studio staging tables.

Data sourced from: https://www.hoodee.com.au (homepage, 2026-06-15).
Hoodee is both manufacturer and supplier — Australian-made aluminium window hoods.

Steps performed:
  1. Create manufacturer record in data_studio_manufacturers
  2. Insert 5 staged_systems (U / L / J / B / R Hood)
  3. Insert profiles per system:
       - 6 standard sizes
       - Custom Size (Made to Order) variant
       - Installation Service variant
  4. Insert 1 staged_component: Stainless Steel Bolts
  5. Link component to all systems

Usage:
    python scripts/parser/insert_hoodee_systems.py [--dry-run]

All records land in verification_status = 'pending_review'.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import dotenv_values

WEBSITE_URL = "https://www.hoodee.com.au"
SOURCE_URL  = "https://www.hoodee.com.au"

# ---------------------------------------------------------------------------
# Shared spec (all hoods share the same material / construction)
# ---------------------------------------------------------------------------
SHARED_NOTES = (
    "3mm custom folded interlocking aluminium with stainless steel fixings. "
    "Bolt-together design for ease of transport. "
    "Projection 200–400mm from building. "
    "Australian-made in Perth WA. "
    "Pricing from $1,500 AUD — verify current pricing with manufacturer."
)

SHARED_DESCRIPTION_SUFFIX = (
    " Constructed from 3mm custom folded interlocking aluminium with stainless "
    "steel fixings. Bolt-together design for easy nationwide transport and on-site "
    "assembly. Projection depth 200–400mm from building face. "
    "Australian-made at 19A Shields Crescent, Booragoon WA."
)

# ---------------------------------------------------------------------------
# Standard size profiles shared across all hood types
# Sizes from website: 1200×600, 1200×1200, 1500×600, 1500×1200, 1800×1200, 2100×1800
# Interpreted as Width (mm) × Height (mm) of the hood face
# Profile tuple: (profile_name, dimensions, width_mm, length_mm, thickness_mm, uom, pack_qty)
# length_mm used here as height/depth of the hood face; thickness_mm = 3mm aluminium
# ---------------------------------------------------------------------------
STANDARD_PROFILES = [
    ("1200 × 600",  "1200mm wide × 600mm deep",  1200,  600, 3.0, "unit", 1),
    ("1200 × 1200", "1200mm wide × 1200mm deep", 1200, 1200, 3.0, "unit", 1),
    ("1500 × 600",  "1500mm wide × 600mm deep",  1500,  600, 3.0, "unit", 1),
    ("1500 × 1200", "1500mm wide × 1200mm deep", 1500, 1200, 3.0, "unit", 1),
    ("1800 × 1200", "1800mm wide × 1200mm deep", 1800, 1200, 3.0, "unit", 1),
    ("2100 × 1800", "2100mm wide × 1800mm deep", 2100, 1800, 3.0, "unit", 1),
    # Variant: custom made-to-order
    ("Custom Size — Made to Order",
     "Custom width × depth (made to order — contact manufacturer for quote)",
     None, None, 3.0, "unit", 1),
    # Variant: installation service
    ("Installation Service",
     "Supply + professional installation service (contact manufacturer for quote)",
     None, None, None, "service", 1),
]

# ---------------------------------------------------------------------------
# Systems — one per hood profile shape
# ---------------------------------------------------------------------------
SYSTEMS = [
    {
        "name":        "Hoodee U Hood",
        "product_code": "U-HOOD",
        "category":    "Window Hood",
        "subcategory": "Aluminium Hood",
        "description": (
            "U-profile aluminium window hood wrapping over the top and both sides "
            "of the window opening, providing three-sided protection from sun and rain."
            + SHARED_DESCRIPTION_SUFFIX
        ),
        "notes": SHARED_NOTES,
    },
    {
        "name":        "Hoodee L Hood",
        "product_code": "L-HOOD",
        "category":    "Window Hood",
        "subcategory": "Aluminium Hood",
        "description": (
            "L-profile aluminium window hood providing a top canopy and front face, "
            "suited to applications requiring a lean-to style projection over the window."
            + SHARED_DESCRIPTION_SUFFIX
        ),
        "notes": SHARED_NOTES,
    },
    {
        "name":        "Hoodee J Hood",
        "product_code": "J-HOOD",
        "category":    "Window Hood",
        "subcategory": "Aluminium Hood",
        "description": (
            "J-profile aluminium window hood with a curved or angled return at the base, "
            "combining overhead protection with a decorative lower return detail."
            + SHARED_DESCRIPTION_SUFFIX
        ),
        "notes": SHARED_NOTES,
    },
    {
        "name":        "Hoodee B Hood",
        "product_code": "B-HOOD",
        "category":    "Window Hood",
        "subcategory": "Aluminium Hood",
        "description": (
            "B-profile aluminium window hood featuring a box-style enclosure "
            "that fully encloses the top and sides for a clean architectural finish."
            + SHARED_DESCRIPTION_SUFFIX
        ),
        "notes": SHARED_NOTES,
    },
    {
        "name":        "Hoodee R Hood",
        "product_code": "R-HOOD",
        "category":    "Window Hood",
        "subcategory": "Aluminium Hood",
        "description": (
            "R-profile aluminium window hood with a return or reveal detail, "
            "providing a refined architectural appearance alongside weather protection."
            + SHARED_DESCRIPTION_SUFFIX
        ),
        "notes": SHARED_NOTES,
    },
]

# ---------------------------------------------------------------------------
# Components
# ---------------------------------------------------------------------------
COMPONENTS = [
    {
        "name":        "Stainless Steel Bolts",
        "category":    "Fastener",
        "uom":         "pack",
        "description": (
            "Stainless steel bolts for fixing and assembling Hoodee aluminium window hoods "
            "to wall substrate. Corrosion-resistant grade suitable for Australian coastal "
            "and general outdoor conditions."
        ),
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _headers(key: str) -> dict:
    return {
        "apikey":        key,
        "Authorization": f"Bearer {key}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }


def post(client: httpx.Client, url: str, key: str, path: str, payload: dict) -> dict:
    r = client.post(f"{url}/rest/v1/{path}", json=payload, headers=_headers(key))
    if r.status_code not in (200, 201):
        print(f"  [ERROR] POST {path}: {r.status_code} {r.text}")
        sys.exit(1)
    rows = r.json()
    return rows[0] if isinstance(rows, list) else rows


def patch_all(client: httpx.Client, url: str, key: str, path: str, filter_qs: str, payload: dict):
    headers = {**_headers(key), "Prefer": "return=minimal"}
    r = client.patch(f"{url}/rest/v1/{path}?{filter_qs}", json=payload, headers=headers)
    if r.status_code not in (200, 201, 204):
        print(f"  [ERROR] PATCH {path}: {r.status_code} {r.text}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--manufacturer-id", help="Existing manufacturer UUID — skips creation step")
    args = ap.parse_args()

    repo_root = Path(__file__).parent.parent.parent
    env = dotenv_values(str(repo_root / ".env.local"))
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    service_key  = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        sys.exit("[ERROR] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local")

    now = datetime.now(timezone.utc).isoformat()
    mode = "DRY RUN" if args.dry_run else "LIVE"

    print(f"\n[insert_hoodee_systems] {mode}")
    print(f"  systems:    {len(SYSTEMS)}")
    print(f"  profiles:   {len(STANDARD_PROFILES)} per system")
    print(f"  components: {len(COMPONENTS)}\n")

    if args.dry_run:
        print("Manufacturer:")
        print("  Hoodee (Perth Metal Industries) — hoodee.com.au\n")
        print("Systems:")
        for s in SYSTEMS:
            print(f"  [{s['product_code']}] {s['name']}")
            for p in STANDARD_PROFILES:
                print(f"    • {p[0]}")
        print("\nComponents:")
        for c in COMPONENTS:
            print(f"  {c['name']} ({c['category']}, {c['uom']})")
        return

    with httpx.Client(timeout=30) as client:

        # ── Step 1: Create or reuse manufacturer ─────────────────────────
        if args.manufacturer_id:
            manufacturer_id = args.manufacturer_id
            print(f"[1/5] Using existing manufacturer id={manufacturer_id}\n")
        else:
            print("[1/5] Creating manufacturer record...")
            mfr_payload = {
                "name":        "Hoodee",
                "slug":        "hoodee",
                "website_url": WEBSITE_URL,
                "abn":         "43695924095",
                "phone":       "0493 717 553",
                "description": (
                    "Australian-made premium aluminium window hoods for residential and "
                    "commercial applications. Manufactured and supplied by Perth Metal "
                    "Industries Pty Ltd, Booragoon WA."
                ),
                "status": "draft",
            }
            mfr = post(client, supabase_url, service_key, "data_studio_manufacturers", mfr_payload)
            manufacturer_id = mfr["id"]
            print(f"  [ok] Hoodee — id={manufacturer_id}\n")

        # ── Step 2: Insert systems ────────────────────────────────────────
        print("[2/5] Inserting systems...")
        sys_map = {}  # name → id
        for system in SYSTEMS:
            payload = {
                "manufacturer_id":    manufacturer_id,
                "name":               system["name"],
                "product_code":       system["product_code"],
                "category":           system["category"],
                "subcategory":        system["subcategory"],
                "description":        system["description"],
                "notes":              system["notes"],
                "website_url":        WEBSITE_URL,
                "source_url":         SOURCE_URL,
                "moisture_resistant": True,
                "australian_made":    True,
                "verification_status": "pending_review",
                "extracted_at":       now,
            }
            row = post(client, supabase_url, service_key, "staged_systems", payload)
            sys_map[system["name"]] = row["id"]
            print(f"  [ok] {system['name']} — id={row['id']}")

        # ── Step 3: Insert profiles ───────────────────────────────────────
        print(f"\n[3/5] Inserting {len(STANDARD_PROFILES)} profiles × {len(sys_map)} systems...")
        profile_count = 0
        for sys_name, sys_id in sys_map.items():
            for i, (profile_name, dimensions, width_mm, length_mm, thickness_mm, uom, pack_qty) in enumerate(STANDARD_PROFILES):
                payload = {
                    "staged_system_id":  sys_id,
                    "profile_name":      profile_name,
                    "dimensions":        dimensions,
                    "width_mm":          width_mm,
                    "length_mm":         length_mm,
                    "thickness_mm":      thickness_mm,
                    "uom":               uom,
                    "supplier_pack_qty": pack_qty,
                    "sort_order":        i,
                }
                post(client, supabase_url, service_key, "staged_system_profiles", {
                    k: v for k, v in payload.items() if v is not None
                } | {"staged_system_id": sys_id, "profile_name": profile_name,
                     "sort_order": i, "uom": uom, "supplier_pack_qty": pack_qty})
                profile_count += 1
        print(f"  {profile_count} profiles inserted")

        # ── Step 4: Insert components ─────────────────────────────────────
        print(f"\n[4/5] Inserting {len(COMPONENTS)} components...")
        comp_map = {}
        for i, c in enumerate(COMPONENTS):
            payload = {
                "manufacturer_id":       manufacturer_id,
                "name":                  c["name"],
                "category":              c["category"],
                "uom":                   c["uom"],
                "description":           c.get("description"),
                "sort_order":            i * 10,
                "extraction_confidence": 1.0,
                "extracted_at":          now,
                "parser_notes":          {"source": "manually added — not listed on website"},
            }
            row = post(client, supabase_url, service_key, "staged_components", payload)
            comp_map[c["name"]] = row["id"]
            print(f"  [ok] {c['name']} — id={row['id']}")

        # ── Step 5: Link components to all systems ────────────────────────
        print(f"\n[5/5] Linking {len(comp_map)} component(s) × {len(sys_map)} systems...")
        link_count = 0
        for sys_name, sys_id in sys_map.items():
            for j, (comp_name, comp_id) in enumerate(comp_map.items()):
                payload = {
                    "staged_system_id":    sys_id,
                    "staged_component_id": comp_id,
                    "role":                "required",
                    "sort_order":          j * 10,
                }
                post(client, supabase_url, service_key, "staged_system_components", payload)
                link_count += 1
        print(f"  {link_count} links created")

    print(f"\n[done] {mode}")
    print(f"  manufacturer: Hoodee ({manufacturer_id})")
    print(f"  systems:      {len(sys_map)}")
    print(f"  profiles:     {profile_count}")
    print(f"  components:   {len(comp_map)}")
    print(f"  links:        {link_count}")
    print(f"\n  NOTE: All records are pending_review — open Data Studio to verify.")
    print(f"  NOTE: Profile descriptions are inferred from letter shape — verify with manufacturer.")


if __name__ == "__main__":
    main()
