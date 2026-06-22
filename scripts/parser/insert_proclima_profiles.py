#!/usr/bin/env python3
"""
insert_proclima_profiles.py
----------------------------
Direct insert of staged_system_profiles for pro clima (manufacturer c51fc77f).

Data sourced from Docling output of WC_proclima_Product_Catalogue_2025_Final_Email.
The original parser hints said "None" for profiles — this script adds them retroactively.

Usage:
    python scripts/parser/insert_proclima_profiles.py           # live insert
    python scripts/parser/insert_proclima_profiles.py --dry-run # print only

Run from repo root.
"""

import argparse
import os
import sys
from pathlib import Path

# ── staged_system UUIDs ────────────────────────────────────────────────────────
SYS = {
    "8mm 3D Separation Mesh":           "7ca083a8-8892-4700-b33b-56d2e1f70a3c",
    "ADHERO® VISTO Floor Drain":        "18a76258-d264-46a6-b09b-393e272b266f",
    "AEROBOXX":                          "3fa11f6f-8b79-4136-81d8-931db8702e6c",
    "AEROFIXX":                          "dfd24a34-1f36-47da-b8ec-5c9704133de2",
    "AEROSANA® VISCONN":                 "9cdae6bb-a76c-4309-8b6b-f658e8dd258a",
    "AEROSANA® VISCONN FIBRE":           "ef258aa5-dac4-4123-a7dc-4476ec77e7be",
    "AEROSANA® VISCONN FLEECE":          "fa02d21b-2e37-4edf-9005-f970f42e202b",
    "AEROSANA® VISCONN WHITE":           "923343fa-dba7-4be3-a84f-6536aa8cbe54",
    "CONTEGA® EXO":                      "09378918-701d-4c4b-921d-fce1d1730c37",
    "CONTEGA® IQ":                       "bce796f5-1e43-4a06-809d-2356bca34291",
    "CONTEGA® PV":                       "5a890250-a7a4-4541-8c63-4d18d5b89959",
    "DA":                                "fea295a9-589b-4f67-9798-77d5ac86069d",
    "DUPLEX":                            "c8e4f313-5788-43e7-a64b-44f15f95784a",
    "INSTAABOX":                         "1a8c6807-851c-40bb-84f4-7e4659b8e5f6",
    "INTELLO® conneX":                   "453e8ca1-81c3-4d11-acef-8d4d2da26626",
    "INTELLO® PLUS":                     "e883fa6c-4d1c-45ae-8a75-b0ea78be376f",
    "KAFLEX mono/duo":                   "6e546617-9ead-4eaf-87fe-51a891b4b1cb",
    "KAFLEX multi":                      "503a5f95-274e-48b0-a303-c04c84b2aae7",
    "KAFLEX post":                       "e703b1db-f7f9-41fc-807d-c83a20f9538d",
    "ORCON® CLASSIC":                    "e0dd4fd4-93d9-4844-b5fb-f5bb917ce6ff",
    "ORCON® MULTIBOND":                  "69f91d93-9cfa-4482-95aa-038d8cae2e52",
    "ROFLEX 20":                         "eaeff095-304c-4b3d-b3a1-7dbf482cba70",
    "ROFLEX 30/50/100/150/200/250/300":  "2afb7559-630e-4f75-a721-a0e8c9e983fd",
    "SOLITEX ADHERO® FC":                "61a58a04-54e2-4d57-82d7-05c62df212ea",
    "SOLITEX ADHERO® VISTO":             "0f32b064-bc9c-45aa-a2e9-94178c7a6dad",
    "SOLITEX ADHERO® VISTO strips":      "4b8a1278-8536-469e-9174-68d7874e3fb6",
    "SOLITEX EXTASANA ADHERO®":          "07edb5fc-ccf8-43ce-a61b-6951d49c6efb",
    "SOLITEX EXTASANA®":                 "f0947706-1e12-4503-a3d7-8e779f6941a9",
    "SOLITEX MENTO® 5000":               "98cbd4ee-8a1c-4c12-8089-1aef5bd37efc",
    "SOLITEX MENTO® PLUS":               "edea5c3c-94b8-4d9f-a001-034a60e840d1",
    "SOLITEX MENTO® ULTRA":              "db37a8a1-8793-4e91-9887-c006dee8f3b5",
    "TESCON EXTORA®":                    "1b9c9c90-bf69-4143-aa4d-1845c382bed5",
    "TESCON EXTORA® PROFIL":             "83754787-8e8a-4896-af15-9ad66d8bcbd4",
    "TESCON EXTOSEAL®":                  "c8df2b0c-8611-416a-acf5-7534ef9643cd",
    "TESCON® NAIDECK":                   "00c82e1d-9dec-42cd-8bdc-3ff5d90b12a5",
    "TESCON® NAIDECK patch":             "11e2d8a8-430a-4c5d-80a9-741e0cc33faf",
    "TESCON® PROFIL":                    "2a8f3984-df09-4ecd-9080-6e46df1eae96",
    "TESCON® VANA":                      "0a8f40cd-fcfb-4e20-8bb6-a6c3fa311c6f",
    "TFLEX®":                            "dd71ef1c-a52d-461c-b864-b6c70525ea87",
}

# ── profile data ───────────────────────────────────────────────────────────────
# Each entry: (product_code, profile_name, dimensions, length_mm, width_mm, uom,
#              supplier_pack_qty, supplier_pack_uom, sort_order)
# Fields not relevant to a product type are None.

PROFILES = {
    # ── Membrane rolls ──────────────────────────────────────────────────────────
    "SOLITEX EXTASANA®": [
        ("1AR04701", "50m × 1500mm",  "50m × 1500mm (75m²)",  50000, 1500, "m2", 1, "roll", 1),
        ("13323",    "36.5m × 2740mm","36.5m × 2740mm (100m²)",36500, 2740, "m2", 1, "roll", 2),
    ],
    "SOLITEX EXTASANA ADHERO®": [
        ("1AR01968", "30m × 1500mm", "30m × 1500mm (45m²)", 30000, 1500, "m2", 1, "roll", 1),
    ],
    "SOLITEX ADHERO® FC": [
        ("1AR04797", "30m × 1500mm", "30m × 1500mm (45m²)", 30000, 1500, "m2", 1, "roll", 1),
    ],
    "SOLITEX ADHERO® VISTO": [
        ("1AR04026", "30m × 1500mm", "30m × 1500mm (45m²)", 30000, 1500, "m2", 1, "roll", 1),
    ],
    # VISTO strips = connection strips + TPU façade control joint material
    "SOLITEX ADHERO® VISTO strips": [
        ("1AR04965", "30m × 125mm",  "Connection strip 30m × 125mm",  30000,  125, "m2", 1, "roll", 1),
        ("1AR04966", "30m × 250mm",  "Connection strip 30m × 250mm",  30000,  250, "m2", 1, "roll", 2),
        ("1AR04302", "30m × 300mm",  "Façade control joint 30m × 300mm (9m²)", 30000, 300, "m2", 1, "roll", 3),
    ],
    "SOLITEX MENTO® PLUS": [
        ("1AR02396", "50m × 1500mm",       "50m × 1500mm (75m²)",  50000, 1500, "m2", 1, "roll", 1),
        ("1AR02494", "50m × 3000mm",       "50m × 3000mm (150m²)", 50000, 3000, "m2", 1, "roll", 2),
        ("1AR02493", "50m × 1500mm (connect)", "50m × 1500mm (75m²) — connect edition", 50000, 1500, "m2", 1, "roll", 3),
    ],
    "SOLITEX MENTO® 5000": [
        ("1AR01868", "50m × 1500mm",       "50m × 1500mm (75m²)",  50000, 1500, "m2", 1, "roll", 1),
        ("1AR01870", "50m × 3000mm",       "50m × 3000mm (150m²)", 50000, 3000, "m2", 1, "roll", 2),
        ("1AR02283", "50m × 1500mm (connect)", "50m × 1500mm (75m²) — connect edition", 50000, 1500, "m2", 1, "roll", 3),
    ],
    "SOLITEX MENTO® ULTRA": [
        ("1AR00629", "50m × 1500mm", "50m × 1500mm (75m²)", 50000, 1500, "m2", 1, "roll", 1),
    ],
    "DA": [
        ("10098", "50m × 1500mm", "50m × 1500mm (75m²)", 50000, 1500, "m2", 1, "roll", 1),
    ],
    "8mm 3D Separation Mesh": [
        ("1AR01832", "30m × 1400mm", "30m × 1400mm (42m²)", 30000, 1400, "m2", 1, "roll", 1),
    ],
    "INTELLO® PLUS": [
        ("15468", "20m × 1500mm",  "20m × 1500mm (30m²)",  20000, 1500, "m2", 1, "roll", 1),
        ("11367", "50m × 1500mm",  "50m × 1500mm (75m²)",  50000, 1500, "m2", 1, "roll", 2),
        ("13590", "50m × 3000mm",  "50m × 3000mm (150m²)", 50000, 3000, "m2", 1, "roll", 3),
    ],
    "INTELLO® conneX": [
        ("1AR02326", "50m × 300mm", "50m × 300mm (15m²)", 50000, 300, "m2", 1, "roll", 1),
        ("1AR03352", "50m × 900mm", "50m × 900mm (45m²)", 50000, 900, "m2", 1, "roll", 2),
    ],

    # ── Sprayable sealants ──────────────────────────────────────────────────────
    "AEROSANA® VISCONN": [
        ("1AR02612", "Sausage 600ml",  "Sausage 600ml", None, None, "unit", 1, "unit", 1),
        ("1AR01106", "Bucket 10L",     "Bucket 10 Litre", None, None, "unit", 1, "unit", 2),
    ],
    "AEROSANA® VISCONN WHITE": [
        ("1AR02749", "Sausage 600ml",  "Sausage 600ml", None, None, "unit", 1, "unit", 1),
        ("1AR01740", "Bucket 10L",     "Bucket 10 Litre", None, None, "unit", 1, "unit", 2),
    ],
    "AEROSANA® VISCONN FIBRE": [
        ("1AR02633", "Sausage 600ml",  "Sausage 600ml", None, None, "unit", 1, "unit", 1),
        ("1AR01677", "Bucket 5L",      "Bucket 5 Litre", None, None, "unit", 1, "unit", 2),
    ],
    "AEROSANA® VISCONN FLEECE": [
        ("1AR01715", "25m × 150mm (2 rolls)", "25m × 150mm fleece — 2 rolls per pack", 25000, 150, "m2", 2, "roll", 1),
    ],

    # ── Tools ───────────────────────────────────────────────────────────────────
    "AEROFIXX": [
        ("1AR02714", "Spray gun 1.6kg", "Application gun — 1.6kg", None, None, "unit", 1, "unit", 1),
    ],
    "AEROBOXX": [
        ("1AR04691", "Transport case 3.86kg", "Transport case — 3.86kg", None, None, "unit", 1, "unit", 1),
    ],

    # ── Tapes (uom: m) ──────────────────────────────────────────────────────────
    "TESCON EXTORA®": [
        ("13206", "30m × 60mm",       "30m × 60mm — no split",        30000,  60, "m", 1,  "roll", 1),
        ("13486", "30m × 60mm (×20)", "30m × 60mm — no split (big pack)", 30000, 60, "m", 20, "roll", 2),
        ("13280", "30m × 100mm",      "30m × 100mm — 50/50 split",    30000, 100, "m", 1,  "roll", 3),
        ("14891", "30m × 150mm",      "30m × 150mm — 50/100 split",   30000, 150, "m", 1,  "roll", 4),
        ("14892", "30m × 200mm",      "30m × 200mm — 50/150 split",   30000, 200, "m", 1,  "roll", 5),
    ],
    "TESCON EXTORA® PROFIL": [
        ("15050", "30m × 60mm", "30m × 60mm — 12/23/25 split", 30000, 60, "m", 1, "roll", 1),
    ],
    "TESCON EXTOSEAL®": [
        ("14152", "20m × 150mm", "20m × 150mm — 90/60 split", 20000, 150, "m", 1, "roll", 1),
        ("14156", "20m × 200mm", "20m × 200mm — 140/60 split", 20000, 200, "m", 1, "roll", 2),
    ],
    "TESCON® NAIDECK patch": [
        ("1AR04073", "50m × 50mm (340 patches)",  "50m × 50mm — 340 patches per roll",  50000, 50, "m", 1, "roll", 1),
        ("1AR04253", "100m × 50mm (185 patches)", "100m × 50mm — 185 patches per roll", 100000, 50, "m", 1, "roll", 2),
    ],
    "TESCON® NAIDECK": [
        ("13599",    "20m × 50mm",       "20m × 50mm",              20000,  50, "m", 1,  "roll", 1),
        ("1AR02150", "20m × 50mm (×24)", "20m × 50mm (big pack)",   20000,  50, "m", 24, "roll", 2),
        ("15844",    "30m × 85mm",       "30m × 85mm",              30000,  85, "m", 1,  "roll", 3),
        ("1AR01266", "30m × 120mm",      "30m × 120mm",             30000, 120, "m", 1,  "roll", 4),
    ],
    "CONTEGA® EXO": [
        ("12185", "30m × 60mm",       "30m × 60mm — no split",    30000, 60, "m", 1,  "roll", 1),
        ("11365", "30m × 60mm (×20)", "30m × 60mm (big pack)",    30000, 60, "m", 20, "roll", 2),
    ],
    "CONTEGA® IQ": [
        ("1AR02137", "30m × 60mm", "30m × 60mm — 12/23/25 split", 30000, 60, "m", 1, "roll", 1),
    ],
    "CONTEGA® PV": [
        ("15844",    "30m × 85mm",  "30m × 85mm",  30000,  85, "m", 1, "roll", 1),
        ("1AR01266", "30m × 120mm", "30m × 120mm", 30000, 120, "m", 1, "roll", 2),
    ],
    "TESCON® VANA": [
        ("1AR03913", "80m × 25mm", "80m × 25mm", 80000, 25, "m", 1, "roll", 1),
    ],
    "TESCON® PROFIL": [
        ("16134",    "105mm × 80mm corner piece",  "105mm × 80mm corner piece",  105, 80, "unit", 1, "unit", 1),
        ("1AR01658", "285mm × 130mm corner piece", "285mm × 130mm corner piece", 285, 130, "unit", 1, "unit", 2),
    ],
    "DUPLEX": [
        ("1AR02195", "20m × 11mm (2×10m rolls)", "20m × 11mm — sold as 2 rolls of 10m", 20000, 11, "m", 1, "pack", 1),
    ],

    # ── Adhesives / sealants ────────────────────────────────────────────────────
    "ORCON® MULTIBOND": [
        ("12769", "Cartridge 310ml", "Cartridge 310ml", None, None, "unit", 1, "unit", 1),
        ("12770", "Sausage 600ml",   "Sausage 600ml",   None, None, "unit", 1, "unit", 2),
    ],
    "ORCON® CLASSIC": [
        ("11449", "1000ml",  "1000ml — apply at 60mm / 75mm / 150mm width", None, None, "unit", 1, "unit", 1),
    ],

    # ── Grommets & sealing patches ──────────────────────────────────────────────
    "KAFLEX mono/duo": [
        ("13628", "KAFLEX mono — pack of 5",  "145mm × 145mm — KAFLEX mono, pack of 5",  None, None, "unit", 5,  "unit", 1),
        ("13633", "KAFLEX duo — pack of 5",   "145mm × 145mm — KAFLEX duo, pack of 5",   None, None, "unit", 5,  "unit", 2),
        ("13631", "KAFLEX duo — pack of 30",  "145mm × 145mm — KAFLEX duo, big pack ×30", None, None, "unit", 30, "unit", 3),
    ],
    "KAFLEX multi": [
        ("1AR05056", "140mm × 140mm — pack of 2",  "140mm × 140mm — pack of 2",  None, None, "unit", 2,  "unit", 1),
        ("13635",    "140mm × 140mm — pack of 5",  "140mm × 140mm — pack of 5",  None, None, "unit", 5,  "unit", 2),
        ("1AR02181", "140mm × 140mm — pack of 10", "140mm × 140mm — pack of 10", None, None, "unit", 10, "unit", 3),
        ("1AR02187", "140mm × 140mm — pack of 10 (big pack)", "140mm × 140mm — big pack ×10", None, None, "unit", 10, "unit", 4),
    ],
    "KAFLEX post": [
        ("1AR03200", "Single unit", "Sealing patch — single unit", None, None, "unit", 1, "unit", 1),
    ],
    "ROFLEX 20": [
        ("13605", "145mm × 145mm — pack of 5",  "For pipes 15–30mm Ø — pack of 5",  None, None, "unit", 5,  "unit", 1),
        ("13606", "145mm × 145mm — pack of 30", "For pipes 15–30mm Ø — pack of 30", None, None, "unit", 30, "unit", 2),
    ],
    "ROFLEX 30/50/100/150/200/250/300": [
        ("16704",    "ROFLEX 30 — pack of 2",   "140mm × 140mm — pipes 30–50mm Ø, pack of 2",   None, None, "unit", 2,  "unit",  1),
        ("16695",    "ROFLEX 30 — pack of 20",  "140mm × 140mm — pipes 30–50mm Ø, pack of 20",  None, None, "unit", 20, "unit",  2),
        ("13608",    "ROFLEX 50 — pack of 2",   "140mm × 140mm — pipes 50–90mm Ø, pack of 2",   None, None, "unit", 2,  "unit",  3),
        ("13609",    "ROFLEX 50 — pack of 20",  "140mm × 140mm — pipes 50–90mm Ø, pack of 20",  None, None, "unit", 20, "unit",  4),
        ("13610",    "ROFLEX 100 — pack of 2",  "200mm × 200mm — pipes 100–120mm Ø, pack of 2", None, None, "unit", 2,  "unit",  5),
        ("1AR02184", "ROFLEX 100 — pack of 10", "200mm × 200mm — pipes 100–120mm Ø, pack of 10",None, None, "unit", 10, "unit",  6),
        ("13613",    "ROFLEX 100 — pack of 20", "200mm × 200mm — pipes 100–120mm Ø, pack of 20",None, None, "unit", 20, "unit",  7),
        ("13614",    "ROFLEX 150 — pack of 2",  "250mm × 250mm — pipes 120–170mm Ø, pack of 2", None, None, "unit", 2,  "unit",  8),
        ("1AR02201", "ROFLEX 150 — pack of 10", "250mm × 250mm — pipes 120–170mm Ø, pack of 10",None, None, "unit", 10, "unit",  9),
        ("13615",    "ROFLEX 200 — pack of 2",  "300mm × 300mm — pipes 170–220mm Ø, pack of 2", None, None, "unit", 2,  "unit", 10),
        ("1AR02202", "ROFLEX 200 — pack of 10", "300mm × 300mm — pipes 170–220mm Ø, pack of 10",None, None, "unit", 10, "unit", 11),
        ("13617",    "ROFLEX 250 — pack of 2",  "450mm × 450mm — pipes 220–270mm Ø, pack of 2", None, None, "unit", 2,  "unit", 12),
        ("13618",    "ROFLEX 300 — pack of 2",  "500mm × 500mm — pipes 270–320mm Ø, pack of 2", None, None, "unit", 2,  "unit", 13),
    ],
}

# Products with no profile data from catalogue (single-unit tools, fixed-size accessories):
# PRESSFIX, PRESSFIX XL, INSTAABOX, TESCON® PRIMER RP, ADHERO® VISTO Floor Drain, TFLEX®


def load_env():
    try:
        from dotenv import dotenv_values
        repo_root = Path(__file__).parent.parent.parent
        env_file = repo_root / ".env.local"
        if not env_file.exists():
            env_file = Path(".env.local")
        for k, v in dotenv_values(str(env_file)).items():
            if v is not None:
                os.environ[k] = v
    except ImportError:
        pass
    return (
        os.environ.get("NEXT_PUBLIC_SUPABASE_URL"),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
    )


def insert_profile(supabase_url, service_key, row, dry_run):
    import httpx
    if dry_run:
        return True
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    resp = httpx.post(
        f"{supabase_url}/rest/v1/staged_system_profiles",
        headers=headers,
        json=row,
        timeout=15,
    )
    return resp.status_code in (200, 201)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    supabase_url, service_key = load_env()
    if not supabase_url or not service_key:
        sys.exit("[ERROR] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")

    total, inserted, failed = 0, 0, 0

    for system_name, profiles in PROFILES.items():
        system_id = SYS.get(system_name)
        if not system_id:
            print(f"[WARN] No system ID for '{system_name}' — skipping")
            continue

        for (product_code, profile_name, dimensions,
             length_mm, width_mm, uom,
             supplier_pack_qty, supplier_pack_uom, sort_order) in profiles:

            row = {
                "staged_system_id":  system_id,
                "product_code":      product_code,
                "profile_name":      profile_name,
                "dimensions":        dimensions,
                "length_mm":         length_mm,
                "width_mm":          width_mm,
                "uom":               uom,
                "supplier_pack_qty": supplier_pack_qty,
                "supplier_pack_uom": supplier_pack_uom,
                "sort_order":        sort_order,
            }

            total += 1
            if args.dry_run:
                print(f"  [dry-run] {system_name} — {profile_name} ({product_code})")
            else:
                ok = insert_profile(supabase_url, service_key, row, dry_run=False)
                if ok:
                    inserted += 1
                    print(f"  [ok] {system_name} — {profile_name}")
                else:
                    failed += 1
                    print(f"  [FAIL] {system_name} — {profile_name}")

    if args.dry_run:
        print(f"\n[dry-run] {total} profiles would be inserted for {len(PROFILES)} systems.")
    else:
        print(f"\n[done] {inserted} inserted, {failed} failed (of {total} total).")


if __name__ == "__main__":
    main()
