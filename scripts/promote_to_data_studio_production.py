"""
promote_to_data_studio_production.py
-------------------------------------
⚠️  LEGACY FLOW — read before running (2026-07-18 audit).

This script dates from the era when Data Studio staging lived in a LOCAL
Supabase and a separate "Data Studio production" cloud project existed. That
topology is gone: ovndokzwkxpfjfobewaq IS the live Data Studio (staging tables
included), and cards reach the public library through the hybrid-publishing
flow (apps/web/lib/studio-admin/publish.ts), not through this script.

It is kept only for a genuine two-Data-Studio-projects copy (e.g. seeding a
fresh environment). Because .env.local's PRODUCTION_SUPABASE_URL now points at
the RFQ/BuildQuote project, this script DELIBERATELY no longer reads that
variable — it requires its own explicit pair so "production" can never again
be conflated with RFQ:

    DATA_STUDIO_PROD_URL=https://<target-project>.supabase.co
    DATA_STUDIO_PROD_SERVICE_ROLE_KEY=...

Before writing anything it probes the target for staged_* tables and refuses
to run against a project that doesn't have them (i.e. the RFQ project).

What it copies:
  - data_studio_manufacturers row
  - staged_systems
  - staged_system_profiles
  - staged_system_colours
  - staged_components
  - staged_system_components

IDs are preserved (same UUIDs on target as source).
On conflict (same UUID already exists) the row is SKIPPED — safe to re-run,
but note this never propagates edits or deletes to rows that already exist.

Usage:
  python scripts/promote_to_data_studio_production.py --manufacturer-id <uuid> --dry-run
  python scripts/promote_to_data_studio_production.py --manufacturer-id <uuid>
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).parent.parent
# override=True: repo .env.local beats any stale shell exports (audit fix).
load_dotenv(REPO_ROOT / ".env.local", override=True)

# ── clients ──────────────────────────────────────────────────────────────────

LOCAL_URL  = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
LOCAL_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
PROD_URL   = os.environ.get("DATA_STUDIO_PROD_URL", "").rstrip("/")
PROD_KEY   = os.environ.get("DATA_STUDIO_PROD_SERVICE_ROLE_KEY", "")

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
    """Fetch ALL rows, paginated. PostgREST silently caps unpaginated
    responses at 1000 rows — a large manufacturer's profiles would have been
    silently truncated during promotion (2026-07-18 audit)."""
    rows, offset, page = [], 0, 1000
    while True:
        r = requests.get(
            f"{LOCAL_URL}/rest/v1/{table}?{params}",
            headers={**local_headers(),
                     "Range-Unit": "items",
                     "Range": f"{offset}-{offset + page - 1}"},
        )
        r.raise_for_status()
        batch = r.json()
        rows += batch
        if len(batch) < page:
            return rows
        offset += page

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

# 2026-07-18 audit: these allowlists had drifted from the live schema — the
# old entry "install_guide_url" (renamed by migration 026) matched nothing, so
# install guides silently never promoted; columns added after the list was
# written (dimensions, design_guide_url, custom_document_links, …) were
# silently dropped the same way. filter_cols() is an allowlist over the source
# row, so a stale entry produces NO error — keep these in sync with
# supabase/schema_complete.sql (regenerate via scripts/refresh_schema_reference.mjs).
SYSTEM_COLS = {
    "id", "manufacturer_id", "source_document_id", "name", "product_code", "slug",
    "category", "subcategory", "description", "dimensions", "length_m", "double_sided",
    "sheet_format", "hero_image_url", "hero_image_position_x", "hero_image_position_y",
    "website_url", "source_url", "source_label", "install_guide_urls", "design_guide_url",
    "tech_data_url", "custom_document_links", "gallery_images",
    "sort_order", "extraction_confidence", "verification_status", "notes", "parser_notes",
    "bal_rating", "australian_made", "fire_rating", "acoustic_rating", "moisture_resistant",
    "structural_grade", "extracted_at", "created_at", "updated_at",
}

PROFILE_COLS = {
    "id", "staged_system_id", "name", "profile_name", "product_code", "dimensions",
    "length_m", "length_mm", "width_mm", "height_mm", "thickness_mm", "depth_mm",
    "gauge_mm", "diameter_mm", "roll_m", "weight_kg", "weight_g", "volume_ml",
    "pieces", "pack_format", "supplier_pack_qty", "supplier_pack_uom", "supplier_pack_note",
    "uom", "bal_rating", "sheet_format", "procurement_route", "sort_order",
    "parser_notes", "image_url",
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
    "supplier_pack_note", "material", "finish", "colour", "profile", "texture",
    "procurement_route", "coverage_m2", "sort_order",
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
        print("[ERROR] DATA_STUDIO_PROD_URL / DATA_STUDIO_PROD_SERVICE_ROLE_KEY not set in .env.local.")
        print("        This script no longer reads PRODUCTION_SUPABASE_URL — that variable points at")
        print("        the RFQ/BuildQuote project, which this script must never touch. If you really")
        print("        need a Data-Studio-to-Data-Studio copy, set the DATA_STUDIO_PROD_* pair")
        print("        explicitly. For publishing cards, use the app's Publish flow instead.")
        sys.exit(1)

    rfq_url = os.environ.get("PRODUCTION_SUPABASE_URL", "").rstrip("/")
    if rfq_url and PROD_URL == rfq_url:
        print("[ERROR] DATA_STUDIO_PROD_URL equals PRODUCTION_SUPABASE_URL (the RFQ/BuildQuote project).")
        print("        Refusing to write staged_* data into the RFQ database.")
        sys.exit(1)

    # Probe the target before writing anything: a project without staged_*
    # tables is the wrong project (e.g. RFQ production).
    probe = requests.get(f"{PROD_URL}/rest/v1/staged_systems?select=id&limit=1", headers=prod_headers())
    if probe.status_code != 200:
        print(f"[ERROR] Target {PROD_URL} has no reachable staged_systems table "
              f"(HTTP {probe.status_code}) — this does not look like a Data Studio project. Aborting.")
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
