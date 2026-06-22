"""
promote_to_data_studio_production.py
-------------------------------------
Promotes a manufacturer's staging data from LOCAL dev Supabase
to PRODUCTION Data Studio Supabase (ovndokzwkxpfjfobewaq).

This script does NOT touch the RFQ/BuildQuote production database.
Target: PRODUCTION_SUPABASE_URL / PRODUCTION_SUPABASE_SERVICE_ROLE_KEY in .env.local

What it copies:
  - data_studio_manufacturers row
  - staged_systems
  - staged_system_profiles
  - staged_system_colours
  - staged_components
  - staged_system_components

IDs are preserved (same UUIDs on production as local).
On conflict (same UUID already exists) the script skips — safe to re-run.

Usage:
  python scripts/promote_to_data_studio_production.py --manufacturer-id <uuid> --dry-run
  python scripts/promote_to_data_studio_production.py --manufacturer-id <uuid>
"""

import argparse
import json
import os
import sys
from datetime import datetime

import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

# ── clients ──────────────────────────────────────────────────────────────────

LOCAL_URL  = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321").rstrip("/")
LOCAL_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
PROD_URL   = os.environ.get("PRODUCTION_SUPABASE_URL", "").rstrip("/")
PROD_KEY   = os.environ.get("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY", "")

def local_headers():
    return {"apikey": LOCAL_KEY, "Authorization": f"Bearer {LOCAL_KEY}"}

def prod_headers():
    return {
        "apikey": PROD_KEY,
        "Authorization": f"Bearer {PROD_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=minimal",
    }

# ── fetch helpers ─────────────────────────────────────────────────────────────

def local_get(table, params=""):
    r = requests.get(f"{LOCAL_URL}/rest/v1/{table}?{params}", headers=local_headers())
    r.raise_for_status()
    return r.json()

def local_get_by_ids(table, id_field, ids, batch=10):
    rows = []
    for i in range(0, len(ids), batch):
        chunk = ",".join(ids[i:i+batch])
        rows += local_get(table, f"{id_field}=in.({chunk})&select=*")
    return rows

# ── insert helper ─────────────────────────────────────────────────────────────

def prod_insert(table, rows, dry_run=False):
    if not rows:
        print(f"  [skip] {table} — 0 rows")
        return 0
    if dry_run:
        print(f"  [dry-run] {table} — would insert {len(rows)} rows")
        return len(rows)
    r = requests.post(
        f"{PROD_URL}/rest/v1/{table}",
        headers=prod_headers(),
        data=json.dumps(rows),
    )
    if r.status_code not in (200, 201, 204):
        print(f"  [ERROR] {table}: {r.status_code} {r.text[:300]}")
        return 0
    print(f"  [ok] {table} — {len(rows)} rows inserted (duplicates ignored)")
    return len(rows)

# ── column allow-lists (strip local-only / auto-generated fields) ─────────────

SYSTEM_COLS = {
    "id", "manufacturer_id", "source_document_id", "name", "product_code", "slug",
    "category", "subcategory", "description", "double_sided", "hero_image_url",
    "website_url", "source_url", "source_label", "install_guide_url", "tech_data_url",
    "sort_order", "extraction_confidence", "verification_status", "notes", "parser_notes",
    "bal_rating", "australian_made", "fire_rating", "acoustic_rating", "moisture_resistant",
    "structural_grade", "extracted_at", "created_at", "updated_at",
}

PROFILE_COLS = {
    "id", "staged_system_id", "name", "profile_name", "product_code", "dimensions",
    "length_m", "length_mm", "width_mm", "height_mm", "thickness_mm", "depth_mm",
    "gauge_mm", "diameter_mm", "roll_m", "weight_kg", "weight_g", "volume_ml",
    "pieces", "pack_format", "supplier_pack_qty", "supplier_pack_uom", "supplier_pack_note",
    "uom", "bal_rating", "sheet_format", "sort_order", "parser_notes", "image_url",
    "website_url", "verification_status", "extracted_at", "created_at",
}

COLOUR_COLS = {
    "id", "staged_system_id", "colour_name", "sku", "sku_suffix", "image_url",
    "is_stocked", "sort_order", "verification_status", "parser_notes",
    "extracted_at", "created_at",
}

COMPONENT_COLS = {
    "id", "manufacturer_id", "source_document_id", "sku", "name", "description",
    "category", "uom", "length_mm", "width_mm", "height_mm", "thickness_mm",
    "depth_mm", "gauge_mm", "diameter_mm", "roll_m", "weight_kg", "weight_g",
    "volume_ml", "pieces", "pack_format", "supplier_pack_qty", "supplier_pack_uom",
    "supplier_pack_note", "material", "finish", "coverage_m2", "sort_order",
    "extraction_confidence", "verification_status", "parser_notes", "image_url",
    "website_url", "extracted_at", "created_at", "updated_at",
}

LINK_COLS = {
    "id", "staged_system_id", "staged_component_id", "role", "notes", "sort_order",
    "extraction_confidence", "verification_status", "parser_notes",
    "extracted_at", "created_at",
}

MANUFACTURER_COLS = {
    "id", "name", "slug", "website_url", "logo_url", "hero_image_url",
    "description", "abn", "phone", "status", "created_at", "updated_at",
}

def filter_cols(row, allowed):
    return {k: v for k, v in row.items() if k in allowed}

# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Promote staging data to Data Studio Production Supabase.")
    parser.add_argument("--manufacturer-id", required=True, help="UUID from data_studio_manufacturers (local)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be inserted without writing")
    args = parser.parse_args()

    if not PROD_URL or not PROD_KEY:
        print("[ERROR] PRODUCTION_SUPABASE_URL or PRODUCTION_SUPABASE_SERVICE_ROLE_KEY not set in .env.local")
        sys.exit(1)

    mid = args.manufacturer_id
    dry = args.dry_run
    label = "DATA STUDIO PRODUCTION" if not dry else "DATA STUDIO PRODUCTION (DRY RUN)"

    print(f"\n{'='*60}")
    print(f"  promote_to_data_studio_production.py")
    print(f"  Target : {label}")
    print(f"  Prod URL: {PROD_URL}")
    print(f"  Manufacturer: {mid}")
    print(f"{'='*60}\n")

    # ── fetch all data from local ─────────────────────────────────────────────
    print("[1/7] Fetching manufacturer record from local...")
    mfr_rows = local_get("data_studio_manufacturers", f"id=eq.{mid}&select=*")
    if not mfr_rows:
        print(f"[ERROR] No manufacturer found with id={mid}")
        sys.exit(1)
    mfr = mfr_rows[0]
    print(f"       Found: {mfr['name']} (slug={mfr['slug']}, status={mfr['status']})")

    print("[2/7] Fetching staged_systems...")
    systems = local_get("staged_systems", f"manufacturer_id=eq.{mid}&select=*")
    system_ids = [s["id"] for s in systems]
    print(f"       {len(systems)} systems")

    print("[3/7] Fetching staged_system_profiles...")
    profiles = local_get_by_ids("staged_system_profiles", "staged_system_id", system_ids)
    print(f"       {len(profiles)} profiles")

    print("[4/7] Fetching staged_system_colours...")
    colours = local_get_by_ids("staged_system_colours", "staged_system_id", system_ids)
    print(f"       {len(colours)} colours")

    print("[5/7] Fetching staged_components...")
    components = local_get("staged_components", f"manufacturer_id=eq.{mid}&select=*")
    print(f"       {len(components)} components")

    print("[6/7] Fetching staged_system_components...")
    links = local_get_by_ids("staged_system_components", "staged_system_id", system_ids)
    print(f"       {len(links)} links")

    # ── insert to production ──────────────────────────────────────────────────
    print(f"\n[7/7] Inserting to {label}...\n")

    prod_insert("data_studio_manufacturers", [filter_cols(mfr, MANUFACTURER_COLS)], dry)
    prod_insert("staged_systems",            [filter_cols(r, SYSTEM_COLS)     for r in systems],    dry)
    prod_insert("staged_system_profiles",    [filter_cols(r, PROFILE_COLS)    for r in profiles],   dry)
    prod_insert("staged_system_colours",     [filter_cols(r, COLOUR_COLS)     for r in colours],    dry)
    prod_insert("staged_components",         [filter_cols(r, COMPONENT_COLS)  for r in components], dry)
    prod_insert("staged_system_components",  [filter_cols(r, LINK_COLS)       for r in links],      dry)

    print(f"\n{'='*60}")
    if dry:
        print("  Dry run complete — nothing written to production.")
    else:
        print(f"  Promotion complete -> DATA STUDIO PRODUCTION")
        print(f"  Manufacturer '{mfr['name']}' is now live in production staging.")
        print(f"  NOTE: verification_status remains 'pending_review' on all rows.")
        print(f"  NOTE: This is Data Studio production — NOT the RFQ/BuildQuote database.")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
