"""
clone_from_production_to_data_studio.py
-----------------------------------------
Reverse-clones a manufacturer's ALREADY-LIVE catalogue data from the
RFQ/MFP PRODUCTION Supabase project INTO this Data Studio Supabase project
as staged_* rows — for manufacturers (e.g. the BQ demo brands) that were
seeded straight into production and never went through the normal Data
Studio pipeline (upload -> docling -> parser -> verify -> publish).

This is the REVERSE of promote_to_data_studio_production.py.

Source: PRODUCTION_SUPABASE_URL / PRODUCTION_SUPABASE_SERVICE_ROLE_KEY
  (manufacturers, systems, system_profiles, system_components -> components,
   system_colours) — READ ONLY, nothing in production is modified.
Target: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (this repo's
  .env.local — the same project every other script/worker in this repo
  writes to)
  (data_studio_manufacturers, staged_systems, staged_system_profiles,
   staged_system_colours, staged_components, staged_system_components)

Cloned systems are marked verification_status='manufacturer_verified' and
linked back to the source row via production_system_id /
production_manufacturer_id (matching the readiness gate in
lib/packages/readiness.ts, which requires exactly that status AND a non-null
production_system_id before a card can be packaged). Since the source data
is already live and approved in production, re-review isn't meaningful —
and the link means a normal `publish` later updates the existing production
row instead of creating a duplicate.

IDEMPOTENT: safe to re-run — skips a system if a staged_systems row already
exists with that production_system_id; skips the manufacturer if one already
exists with that production_manufacturer_id (or matching slug).

Usage:
  python scripts/clone_from_production_to_data_studio.py --manufacturer-slug bq-inform --dry-run
  python scripts/clone_from_production_to_data_studio.py --manufacturer-slug bq-inform
"""

import argparse
import os
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

PROD_URL = os.environ.get("PRODUCTION_SUPABASE_URL", "").rstrip("/")
PROD_KEY = os.environ.get("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY", "")
DS_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
DS_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def prod_headers():
    return {"apikey": PROD_KEY, "Authorization": f"Bearer {PROD_KEY}"}


def ds_headers():
    return {
        "apikey": DS_KEY,
        "Authorization": f"Bearer {DS_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def prod_get(table: str, params: str):
    r = requests.get(f"{PROD_URL}/rest/v1/{table}?{params}", headers=prod_headers())
    r.raise_for_status()
    return r.json()


def ds_get(table: str, params: str):
    r = requests.get(f"{DS_URL}/rest/v1/{table}?{params}", headers=ds_headers())
    r.raise_for_status()
    return r.json()


def ds_insert(table: str, row: dict, dry_run: bool) -> dict | None:
    if dry_run:
        print(f"  [dry-run] would insert into {table}: {row.get('name') or row.get('colour_name') or row.get('id') or '<row>'}")
        return None
    r = requests.post(f"{DS_URL}/rest/v1/{table}", headers=ds_headers(), json=row)
    r.raise_for_status()
    data = r.json()
    return data[0] if isinstance(data, list) and data else None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manufacturer-slug", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    dry_run = args.dry_run

    if not PROD_URL or not PROD_KEY:
        raise SystemExit("Missing PRODUCTION_SUPABASE_URL / PRODUCTION_SUPABASE_SERVICE_ROLE_KEY in .env.local")
    if not DS_URL or not DS_KEY:
        raise SystemExit("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local")

    slug = args.manufacturer_slug
    print(f"[clone] Reading '{slug}' from production ({PROD_URL})")
    print(f"[clone] Writing into Data Studio ({DS_URL}){'  [DRY RUN]' if dry_run else ''}\n")

    # ── 1. Manufacturer ──────────────────────────────────────────────────────
    prod_mfrs = prod_get("manufacturers", f"slug=eq.{slug}&select=*")
    if not prod_mfrs:
        raise SystemExit(f"No manufacturer with slug='{slug}' found in production.")
    prod_mfr = prod_mfrs[0]
    print(f"[clone] Found production manufacturer: {prod_mfr.get('name')} ({prod_mfr['id']})")

    existing = ds_get(
        "data_studio_manufacturers",
        f"or=(production_manufacturer_id.eq.{prod_mfr['id']},slug.eq.{slug})&select=id,name,slug,production_manufacturer_id",
    )
    if existing:
        ds_mfr_id = existing[0]["id"]
        print(f"[clone] Data Studio manufacturer already exists ({ds_mfr_id}) — reusing.")
    else:
        mfr_row = {
            "production_manufacturer_id": prod_mfr["id"],
            "name": prod_mfr.get("name"),
            "slug": prod_mfr.get("slug"),
            "website_url": prod_mfr.get("website_url"),
            "logo_url": prod_mfr.get("logo_url"),
            "hero_image_url": prod_mfr.get("hero_image_url"),
            "hero_image_position_y": prod_mfr.get("hero_image_position_y") or 50,
            "description": prod_mfr.get("description"),
            "status": "active",
        }
        if not mfr_row["website_url"]:
            print("  WARNING: production manufacturer has no website_url — packaging will be BLOCKED "
                  "(readiness.ts requires it). Set one in Brand Profile before generating a package.")
        created = ds_insert("data_studio_manufacturers", mfr_row, dry_run)
        ds_mfr_id = created["id"] if created else "<dry-run-id>"
        print(f"[clone] Created Data Studio manufacturer: {ds_mfr_id}")

    # ── 2. Systems ────────────────────────────────────────────────────────────
    prod_systems = prod_get("systems", f"manufacturer_id=eq.{prod_mfr['id']}&select=*")
    print(f"\n[clone] Found {len(prod_systems)} system(s) in production.")

    for sys_row in prod_systems:
        name = sys_row.get("name")
        prod_system_id = sys_row["id"]

        already = [] if dry_run else ds_get(
            "staged_systems", f"production_system_id=eq.{prod_system_id}&select=id"
        )
        if already:
            print(f"  [skip] '{name}' — already cloned (staged_systems.id={already[0]['id']})")
            continue

        install_guides = sys_row.get("install_guide_urls")
        design_guide = sys_row.get("design_guide_url")
        tech_data = sys_row.get("tech_data_url")
        draft_hosts = ("supabase.co", "r2.cloudflarestorage.com", "r2.dev", "localhost", "127.0.0.1", "vercel.app")
        guide_urls = [g.get("url", "") for g in (install_guides or [])] + [u for u in (design_guide, tech_data) if u]
        bad_guides = [u for u in guide_urls if any(h in u for h in draft_hosts)]
        if bad_guides:
            print(f"  WARNING: '{name}' has a draft/internal guide URL — will BLOCK packaging: {bad_guides}")

        staged_row = {
            "manufacturer_id": ds_mfr_id,
            "production_system_id": prod_system_id,
            "name": name,
            "product_code": sys_row.get("product_code"),
            "slug": sys_row.get("slug"),
            "category": sys_row.get("category"),
            "subcategory": sys_row.get("subcategory"),
            "description": sys_row.get("description"),
            "dimensions": sys_row.get("dimensions"),
            "length_m": sys_row.get("length_m"),
            "double_sided": sys_row.get("double_sided") or False,
            "hero_image_url": sys_row.get("hero_image_url"),
            "hero_image_position_x": sys_row.get("hero_image_position_x") or 50,
            "hero_image_position_y": sys_row.get("hero_image_position_y") or 50,
            "website_url": sys_row.get("website_url"),
            "install_guide_urls": install_guides,
            "design_guide_url": design_guide,
            "tech_data_url": tech_data,
            "fire_rating": sys_row.get("fire_rating"),
            "acoustic_rating": sys_row.get("acoustic_rating"),
            "moisture_resistant": sys_row.get("moisture_resistant") or False,
            "structural_grade": sys_row.get("structural_grade"),
            "bal_rating": sys_row.get("bal_rating"),
            "australian_made": sys_row.get("australian_made"),
            "notes": sys_row.get("notes"),
            "sort_order": sys_row.get("sort_order") or 0,
            "source_label": "Production catalogue (reverse-cloned)",
            "verification_status": "manufacturer_verified",
            "verified_at": now_iso(),
            "reviewer_notes": "Reverse-cloned from production (already-live demo data) for Data Studio pipeline testing.",
        }
        created_sys = ds_insert("staged_systems", staged_row, dry_run)
        ds_system_id = created_sys["id"] if created_sys else "<dry-run-id>"
        print(f"  [+] '{name}' -> staged_systems {ds_system_id}")

        # ── Profiles ──
        profiles = prod_get("system_profiles", f"system_id=eq.{prod_system_id}&select=*")
        for p in profiles:
            profile_row = {
                "staged_system_id": ds_system_id,
                "profile_name": p.get("profile_name") or p.get("name"),
                "name": p.get("name"),
                "product_code": p.get("product_code"),
                "dimensions": p.get("dimensions"),
                "length_mm": p.get("length_mm"),
                "width_mm": p.get("width_mm"),
                "height_mm": p.get("height_mm"),
                "thickness_mm": p.get("thickness_mm"),
                "uom": p.get("uom"),
                "supplier_pack_qty": p.get("supplier_pack_qty"),
                "supplier_pack_uom": p.get("supplier_pack_uom"),
                "sort_order": p.get("sort_order") or 0,
                "verification_status": "manufacturer_verified",
            }
            ds_insert("staged_system_profiles", profile_row, dry_run)
        print(f"      + {len(profiles)} profile(s)")

        # ── Colours ──
        colours = prod_get("system_colours", f"system_id=eq.{prod_system_id}&select=*")
        for c in colours:
            colour_row = {
                "staged_system_id": ds_system_id,
                "colour_name": c.get("colour_name"),
                "image_url": c.get("image_url"),
                "is_stocked": c.get("is_stocked") if c.get("is_stocked") is not None else True,
                "sort_order": c.get("sort_order") or 0,
                "verification_status": "manufacturer_verified",
            }
            ds_insert("staged_system_colours", colour_row, dry_run)
        print(f"      + {len(colours)} colour(s)")

        # ── Components (via system_components join, nested components row) ──
        links = prod_get(
            "system_components",
            f"system_id=eq.{prod_system_id}&select=id,role,notes,sort_order,components(*)",
        )
        for link in links:
            comp = link.get("components")
            if not comp:
                continue
            comp_row = {
                "manufacturer_id": ds_mfr_id,
                "sku": comp.get("sku"),
                "name": comp.get("name"),
                "description": comp.get("description"),
                "category": comp.get("category"),
                "uom": comp.get("uom"),
                "procurement_route": comp.get("procurement_route"),
                "sort_order": comp.get("sort_order") or 0,
                "verification_status": "manufacturer_verified",
            }
            created_comp = ds_insert("staged_components", comp_row, dry_run)
            ds_component_id = created_comp["id"] if created_comp else "<dry-run-id>"

            link_row = {
                "staged_system_id": ds_system_id,
                "staged_component_id": ds_component_id,
                "role": link.get("role") or "component",
                "notes": link.get("notes"),
                "sort_order": link.get("sort_order") or 0,
                "verification_status": "manufacturer_verified",
            }
            ds_insert("staged_system_components", link_row, dry_run)
        print(f"      + {len(links)} component(s)")

    print("\n[clone] Done." + ("  (dry run — nothing was written)" if dry_run else ""))


if __name__ == "__main__":
    main()
