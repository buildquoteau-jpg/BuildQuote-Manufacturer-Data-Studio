#!/usr/bin/env python3
"""
patch_hoodee_hero_images.py
===========================
Patches hero_image_url on Hoodee staged_systems.

Scraped from hoodee.com.au (2026-06-15):
  - og:image is the site's main hero photo (used as shared brand hero).
  - Per-hood images are not individually addressable on the current Wix site
    (all 5 hoods live on one homepage with dynamically loaded images).
  - HERO_IMAGES below maps product_code -> image URL so individual
    hood images can be updated here as the manufacturer supplies them.

Targets PRODUCTION Supabase by default.
Pass --local to run against the local data-studio instance instead.

Usage:
    # Production (set PROD_SUPABASE_URL + PROD_SERVICE_ROLE_KEY in env):
    python scripts/web-enricher/patch_hoodee_hero_images.py

    # Local dev:
    python scripts/web-enricher/patch_hoodee_hero_images.py --local

    # Dry run (no writes):
    python scripts/web-enricher/patch_hoodee_hero_images.py --dry-run
"""

import argparse
import json
import sys
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import datetime, timezone

from dotenv import dotenv_values

# ---------------------------------------------------------------------------
# Image map — product_code -> hero_image_url
# Site hero (og:image) is used as the shared fallback for all hoods until
# the manufacturer supplies individual product photographs.
# To add a per-hood image: replace the URL for that product_code below.
# ---------------------------------------------------------------------------

SITE_HERO = (
    "https://static.wixstatic.com/media/"
    "99be48_65b1a3fb41c246bb994b2e1781722a0b~mv2.jpg"
)

HERO_IMAGES = {
    "U-HOOD": SITE_HERO,   # TODO: replace with U Hood-specific photo
    "L-HOOD": SITE_HERO,   # TODO: replace with L Hood-specific photo
    "J-HOOD": SITE_HERO,   # TODO: replace with J Hood-specific photo
    "B-HOOD": SITE_HERO,   # TODO: replace with B Hood-specific photo
    "R-HOOD": SITE_HERO,   # TODO: replace with R Hood-specific photo
}

MANUFACTURER_SLUG = "hoodee"

PROD_URL = "https://oxvhmulxuvlfjyjzleki.supabase.co"


# ---------------------------------------------------------------------------

def _headers(key: str) -> dict:
    return {
        "apikey":        key,
        "Authorization": f"Bearer {key}",
        "Content-Type":  "application/json",
    }


def get(url: str, key: str, path: str) -> list:
    req = urllib.request.Request(f"{url}/rest/v1/{path}", headers=_headers(key))
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def patch(url: str, key: str, path: str, payload: dict) -> bool:
    data = json.dumps(payload).encode()
    headers = {**_headers(key), "Prefer": "return=minimal"}
    req = urllib.request.Request(
        f"{url}/rest/v1/{path}", data=data, headers=headers, method="PATCH"
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status in (200, 204)
    except urllib.error.HTTPError as e:
        print(f"  [ERROR] {e.code}: {e.read().decode()}")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local",   action="store_true", help="Target local data-studio Supabase")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    repo_root = Path(__file__).parent.parent.parent
    env = dotenv_values(str(repo_root / ".env.local"))

    if args.local:
        supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
        service_key  = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
        target = "LOCAL"
    else:
        supabase_url = env.get("PROD_SUPABASE_URL", PROD_URL).rstrip("/")
        service_key  = env.get("PROD_SERVICE_ROLE_KEY", "")
        target = "PRODUCTION"

    if not supabase_url or not service_key:
        print(f"[ERROR] Missing Supabase credentials for {target}.")
        if not args.local:
            print("  Set PROD_SUPABASE_URL and PROD_SERVICE_ROLE_KEY in .env.local")
        sys.exit(1)

    mode = "DRY RUN" if args.dry_run else "LIVE"
    print(f"\n[patch_hoodee_hero_images] {mode} -> {target} ({supabase_url})\n")

    # Look up manufacturer
    rows = get(supabase_url, service_key,
               f"data_studio_manufacturers?slug=eq.{MANUFACTURER_SLUG}&select=id,name")
    if not rows:
        sys.exit(f"[ERROR] Manufacturer slug='{MANUFACTURER_SLUG}' not found in {target}.")
    mfr = rows[0]
    print(f"  Manufacturer: {mfr['name']} ({mfr['id']})")

    # Fetch all systems for this manufacturer
    systems = get(supabase_url, service_key,
                  f"staged_systems?manufacturer_id=eq.{mfr['id']}&select=id,name,product_code,hero_image_url")
    print(f"  Systems found: {len(systems)}\n")

    patched = skipped = failed = 0

    for s in systems:
        code  = s.get("product_code", "")
        name  = s["name"]
        img   = HERO_IMAGES.get(code)

        if not img:
            print(f"  [SKIP] {name} ({code}) — no image mapping defined")
            skipped += 1
            continue

        if s.get("hero_image_url") == img:
            print(f"  [=]    {name} — already set, skipping")
            skipped += 1
            continue

        if args.dry_run:
            print(f"  [dry]  {name} ({code})")
            print(f"         -> {img}")
            patched += 1
            continue

        ok = patch(supabase_url, service_key,
                   f"staged_systems?id=eq.{s['id']}",
                   {"hero_image_url": img})
        if ok:
            print(f"  [ok]   {name} ({code})")
            print(f"         -> {img}")
            patched += 1
        else:
            print(f"  [FAIL] {name} ({code})")
            failed += 1

    print(f"\n[done] {mode} -> {target}")
    print(f"  patched: {patched}")
    print(f"  skipped: {skipped}")
    if failed:
        print(f"  failed:  {failed}")
    print()
    if not args.dry_run and patched:
        print("  NOTE: All hoods currently share the site og:image as hero.")
        print("  Update HERO_IMAGES dict with per-hood URLs when available.")


if __name__ == "__main__":
    main()
