"""
Fix mojibake characters in staged_system_profiles and staged_components
for a given manufacturer. Run after any parser insert.

Usage:
  python scripts/fix_mojibake.py --manufacturer-id <uuid>
"""

import os
import sys
import argparse
import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

# Mojibake → correct character
# Each tuple: (bad_string, good_string)
# These arise from UTF-8 bytes being misread as Windows-1252, then re-encoded as UTF-8.
REPLACEMENTS = [
    ("â€”", "—"),  # â€" → — (em dash)
    ("â€™", "’"),  # â€™ → ' (right single quote)
    ("â€œ", "“"),  # â€œ → " (left double quote)
    ("â€",        "‚"),  # â€  → remaining euro sequences
    ("â„¢", "™"),  # â„¢ → ™ (trademark)
    ("Â®",        "®"),  # Â® → ® (registered)
    ("Â ",        " "),       # Â  → non-breaking space → regular space
]


def fix(text: str) -> str:
    if not text:
        return text
    for bad, good in REPLACEMENTS:
        text = text.replace(bad, good)
    return text.strip()


def get(table, params):
    r = requests.get(f"{URL}/rest/v1/{table}?{params}", headers=HEADERS)
    r.raise_for_status()
    return r.json()


def patch(table, row_id, payload):
    r = requests.patch(
        f"{URL}/rest/v1/{table}?id=eq.{row_id}",
        json=payload,
        headers={**HEADERS, "Prefer": "return=minimal"},
    )
    r.raise_for_status()


def get_system_ids(mfr_id):
    rows = get("staged_systems", f"manufacturer_id=eq.{mfr_id}&select=id")
    return [r["id"] for r in rows]


def fix_profiles(system_ids):
    fixed = 0
    for i in range(0, len(system_ids), 5):
        chunk = ",".join(system_ids[i : i + 5])
        rows = get("staged_system_profiles", f"staged_system_id=in.({chunk})&select=id,name,profile_name")
        for row in rows:
            payload = {}
            new_name = fix(row.get("name") or "")
            new_profile = fix(row.get("profile_name") or "")
            if new_name != (row.get("name") or ""):
                payload["name"] = new_name
            if new_profile != (row.get("profile_name") or ""):
                payload["profile_name"] = new_profile
            if payload:
                patch("staged_system_profiles", row["id"], payload)
                fixed += 1
    return fixed


def fix_components(mfr_id):
    rows = get("staged_components", f"manufacturer_id=eq.{mfr_id}&select=id,name")
    fixed = 0
    for row in rows:
        new_name = fix(row.get("name") or "")
        if new_name != (row.get("name") or ""):
            patch("staged_components", row["id"], {"name": new_name})
            fixed += 1
    return fixed


def fix_systems(mfr_id):
    rows = get("staged_systems", f"manufacturer_id=eq.{mfr_id}&select=id,name")
    fixed = 0
    for row in rows:
        new_name = fix(row.get("name") or "")
        if new_name != (row.get("name") or ""):
            patch("staged_systems", row["id"], {"name": new_name})
            fixed += 1
    return fixed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manufacturer-id", required=True)
    args = parser.parse_args()
    mfr_id = args.manufacturer_id

    print(f"[mojibake] Fixing manufacturer {mfr_id}...")
    system_ids = get_system_ids(mfr_id)
    print(f"[mojibake] {len(system_ids)} systems found")

    n = fix_systems(mfr_id)
    print(f"[mojibake] staged_systems:          {n} rows fixed")

    n = fix_profiles(system_ids)
    print(f"[mojibake] staged_system_profiles:  {n} rows fixed")

    n = fix_components(mfr_id)
    print(f"[mojibake] staged_components:       {n} rows fixed")

    print("[mojibake] Done.")


if __name__ == "__main__":
    main()
