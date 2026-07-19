#!/usr/bin/env python3
"""Attach NewTechWood Documents-tab guide URLs to the matching staged systems."""

import argparse
import os
from pathlib import Path

import httpx
from dotenv import dotenv_values

MFR_ID = "5101c414-2e34-479d-b1da-2a547a4daa5a"
DESIGN_DOC = "NewTechWood-Product-Brochure-October-2025"
GUIDES = {
    "NewTechWood Avenue Decking Range": [
        "Avenue-Decking-Installation-Guide_Final_05_2026",
        "NewTechWood-Cobra-T-Clip-Installation-Guide",
        "NewTechWood-Mini-Gap-Clip-Installation",
    ],
    "NewTechWood Terrace Decking Range": [
        "Terrace-Decking-Installation-Guide_Final_05_2026",
        "NewTechWood-Cobra-T-Clip-Installation-Guide",
        "NewTechWood-Mini-Gap-Clip-Installation",
    ],
    "NewTechWood Coastal Decking Range": [
        "Coastal-Decking-Installation-Guide_Final_05_2026",
        "NewTechWood-Cobra-T-Clip-Installation-Guide",
        "NewTechWood-Mini-Gap-Clip-Installation",
    ],
    "NewTechWood Commercial Decking Range": [
        "Marina-Decking-Installation-Guide_Final_05_2026",
        "NewTechWood-Cobra-T-Clip-Installation-Guide",
    ],
    "NewTechWood Screening & Fencing": [
        "NewTechWood-Screening-Installation-Guide",
        "Pool-Fence-Installation-Guide-2026",
        "UH122R-Quick-Panel-Installation-Guide-V1_2025",
    ],
    "NewTechWood Shadowline Wall Cladding": [
        "NewTechWood_Shadowline_2025_Codemark",
        "Trim-Kits-PDF",
    ],
    "NewTechWood Castellation Wall Cladding": [
        "NewTechWood_Castellation_Wall_Cladding_System_2025_Codemark",
        "Trim-Kits-PDF",
    ],
    "NewTechWood Nivo Pedestals": ["Structural-Install-Guide-2022-Final"],
}


def label(name):
    return name.replace("_", " ").replace("-", " ").replace("  ", " ").strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    root = Path(__file__).resolve().parents[2]
    for key, value in dotenv_values(root / ".env.local").items():
        if value is not None:
            os.environ[key] = value
    base = os.environ["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    docs = httpx.get(base + "/source_documents", params={
        "manufacturer_id": f"eq.{MFR_ID}", "select": "document_name,source_url"
    }, headers=headers, timeout=30).raise_for_status().json()
    by_name = {d["document_name"]: d["source_url"] for d in docs if d.get("source_url")}
    systems = httpx.get(base + "/staged_systems", params={
        "manufacturer_id": f"eq.{MFR_ID}",
        "select": "id,name,install_guide_urls,design_guide_url",
    }, headers=headers, timeout=30).raise_for_status().json()
    design_url = by_name[DESIGN_DOC]
    for system in systems:
        wanted = GUIDES[system["name"]]
        existing = system.get("install_guide_urls") or []
        merged = {g["url"]: g for g in existing if g.get("url")}
        for doc_name in wanted:
            url = by_name[doc_name]
            merged[url] = {"label": label(doc_name), "url": url}
        patch = {
            "install_guide_urls": list(merged.values()),
            "design_guide_url": system.get("design_guide_url") or design_url,
        }
        print(f"{system['name']}: {len(patch['install_guide_urls'])} install guides + design guide")
        if not args.dry_run:
            response = httpx.patch(base + "/staged_systems", params={"id": f"eq.{system['id']}"},
                                   json=patch, headers={**headers, "Prefer": "return=minimal"}, timeout=30)
            response.raise_for_status()
    print("Dry run only; no writes." if args.dry_run else "Guide links updated.")


if __name__ == "__main__":
    main()
