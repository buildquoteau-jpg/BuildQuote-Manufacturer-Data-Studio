#!/usr/bin/env python3
"""
patch_ametalin_known_urls.py

Pre-patch script for Ametalin: sets tech_data_url and design_guide_url on
staged_systems before the web enricher runs.

Run AFTER the AI parser has created staged_systems rows.
The web enricher then only needs to find hero_image_url + source_url.

Usage:
    python scripts/parser/patch_ametalin_known_urls.py [--dry-run]
"""

import argparse
import os
import urllib.request
import urllib.parse
import json

# ─── Config ───────────────────────────────────────────────────────────────────

MANUFACTURER_ID = None  # Set after manufacturer is created in data studio

SUPABASE_URL  = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SERVICE_KEY   = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

TDS_BASE        = "https://www.ametalin.com/wp-content/uploads/PDFs/TDS/"
DESIGN_GUIDE_URL = (
    "https://www.ametalin.com/wp-content/uploads/PDFs/"
    "ProductSelectorGuide(Bunnings)/"
    "Ametalin-NCC-2022-Product-Range-Selector-Guide_Available-at-Bunnings.pdf"
)

# ─── System name → TDS filename mapping ───────────────────────────────────────
# Keys must match exactly the `name` field created by the AI parser.
# Add more entries as additional TDS PDFs are downloaded and parsed.

SYSTEMS: dict[str, str] = {
    # --- Non-Combustible Membranes ---
    "Ametalin CeaseFire®":                   "Ametalin-CeaseFire%C2%AE-Technical-Data-Sheet_APM-45762-0.pdf",
    "FireSark®":                             "FireSark-Technical-Data-Sheet_APM-45762-1.pdf",
    "FireSark® Micro-perforated":            "FireSark-Micro-perforated-Technical-Data-Sheet_APM-45762-2.pdf",
    # --- Reflective Sarking ---
    "SilverSark® HVB":                       "SilverSark-HVB-Technical-Data-Sheet_APM-45763-3.pdf",
    "SilverSark® TRE":                       "SilverSark-TRE-Technical-Data-Sheet_APM-45763-4.pdf",
    "SilverSark® HD":                        "SilverSark-HD-Technical-Data-Sheet_APM-45763-2.pdf",
    "SilverSark® XHD":                       "SilverSark-XHD-Technical-Data-Sheet_APM-45763-5.pdf",
    "SilverSark® xR HD":                     "SilverSark-xR-HD-Technical-Data-Sheet_APM-45763-6.pdf",
    "SilverSark® xR XHD":                   "SilverSark-xR-XHD-Technical-Data-Sheet_APM-45763-7.pdf",
    # --- Reflective Wall Wraps ---
    "SilverWrap® LD":                        "SilverWrap-LD-Technical-Data-Sheet_APM-45764-0.pdf",
    "SilverWrap® LD Micro-perforated":       "SilverWrap-LD-Micro-perforated-Technical-Data-Sheet_APM-45764-1.pdf",
    "SilverWrap® MD":                        "SilverWrap-MD-Technical-Data-Sheet_APM-45764-2.pdf",
    "SilverWrap® MD Micro-perforated":       "SilverWrap-MD-Micro-perforated-Technical-Data-Sheet_APM-45764-3.pdf",
    "SilverWrap® HD Micro-perforated":       "SilverWrap-Micro-perforated-HD-Technical-Data-Sheet_APM-46764-4.pdf",
    "SilverWrap® XHD Micro-perforated":      "SilverWrap-XHD-Micro-perforated-Technical-Data-Sheet_APM-45764-5.pdf",
    "SilverWrap® xR HD Micro-perforated":    "SilverWrap-xR-HD-Micro-perforated-Technical-Data-Sheet_APM-45764-6.pdf",
    # --- Vapour Permeable Membranes ---
    "VapourTech® RWC Roof Wall Commercial":  "VapourTech-RWC-Roof-Wall-Commercial-Technical-Data-Sheet_APM-45763-0.pdf",
    "VapourTech® Wall":                      "VapourTech-Wall-Technical-Data-Sheet_APM-45763-1.pdf",
    "VapourTech® Brane® VHP":               "VapourTech-Brane-VHP-Technical-Data-Sheet_APM-46072-0.pdf",
    # --- Thermal Products ---
    "ThermalBreak®":                         "ThermalBreak-Technical-Data-Sheet_APM-45758-2.pdf",
    "ThermalLiner™":                         "ThermalLiner-Technical-Data-Sheet_APM-45764-9.pdf",
    # --- Floor Products ---
    "SilverFloor®":                          "SilverFloor-Technical-Data-Sheet_APM-45762-3.pdf",
    "ThermalFloor™":                         "ThermalFloor-Technical-Data-Sheet_-APM-45764-12.pdf",
    # --- Drainage Battens ---
    "Ametalin Cavity Drainage Battens™":     "Ametalin-Cavity-Drainage-Battens%E2%84%A2-Technical-Data-Sheet_APM-45726-1.pdf",
    "Ametalin ThermalCav™ Drainage Battens": "Ametalin-ThermalCav%E2%84%A2-Drainage-Battens-Technical-Data-Sheet_APM-45726-0.pdf",
}


def _headers():
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_systems(manufacturer_id: str) -> list[dict]:
    url = (
        f"{SUPABASE_URL}/rest/v1/staged_systems"
        f"?manufacturer_id=eq.{urllib.parse.quote(manufacturer_id)}"
        f"&select=id,name,tech_data_url,design_guide_url"
        f"&limit=200"
    )
    req = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def patch_system(system_id: str, patch: dict) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/staged_systems?id=eq.{urllib.parse.quote(system_id)}"
    data = json.dumps(patch).encode()
    headers = {**_headers(), "Prefer": "return=minimal"}
    req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status in (200, 204)
    except Exception as e:
        print(f"    [error] {e}")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manufacturer-id", default=MANUFACTURER_ID)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.manufacturer_id:
        print("[error] --manufacturer-id is required (or set MANUFACTURER_ID in script)")
        return

    if not SUPABASE_URL or not SERVICE_KEY:
        print("[error] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        return

    print(f"[patch] Fetching Ametalin systems for manufacturer {args.manufacturer_id}...")
    rows = fetch_systems(args.manufacturer_id)
    print(f"[patch] Found {len(rows)} systems in staged_systems\n")

    # Build a lookup: name → row
    by_name = {r["name"]: r for r in rows}

    patched = skipped = missing = 0

    for system_name, tds_filename in SYSTEMS.items():
        row = by_name.get(system_name)
        if not row:
            print(f"  [missing] '{system_name}' — not found in staged_systems (check parser output name)")
            missing += 1
            continue

        patch = {}

        # tech_data_url — only set if currently null
        if not row.get("tech_data_url"):
            patch["tech_data_url"] = TDS_BASE + tds_filename
        else:
            print(f"  [skip]    '{system_name}' tech_data_url already set")

        # design_guide_url — only set if currently null
        if not row.get("design_guide_url"):
            patch["design_guide_url"] = DESIGN_GUIDE_URL

        if not patch:
            skipped += 1
            continue

        print(f"  [patch]   '{system_name}'")
        for k, v in patch.items():
            print(f"            {k}: {v[:80]}...")

        if not args.dry_run:
            ok = patch_system(row["id"], patch)
            if ok:
                patched += 1
            else:
                print(f"    [error] patch failed for {row['id']}")
        else:
            patched += 1

    mode = "dry-run" if args.dry_run else "live"
    print(f"\n[done] {mode} — {patched} patched, {skipped} skipped, {missing} missing")
    if missing:
        print(f"       Check system names match parser output exactly (case/symbol sensitive)")


if __name__ == "__main__":
    main()
