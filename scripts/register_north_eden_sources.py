#!/usr/bin/env python3
"""Register every official North Eden Timber resource PDF and enqueue fetch+Docling."""

import os
from pathlib import Path

import httpx
from dotenv import dotenv_values

MFR_ID = "13a6f72c-d3de-4ed2-95ce-95c9a02cf2b1"
ROOT = "https://www.northedentimber.com.au/_files/ugd/"
SOURCES = [
    ("North Eden Timber Cladding Product and Installation Guide 2025", "brochure", ROOT + "9e2a1a_3b78d605f52c4521bc689fc41130542d.pdf"),
    ("North Eden Timber Watershield Decking Profile", "technical_data_sheet", ROOT + "9e2a1a_677f4f1b80bd48daa6d6eb56188d0e46.pdf"),
    ("Australian Hardwood Species Reference Guide - Ironbark", "technical_data_sheet", ROOT + "9e2a1a_04464461c0e14987a27e15a8a3e2baea.pdf"),
    ("Australian Hardwood Species Reference Guide - Spotted Gum", "technical_data_sheet", ROOT + "9e2a1a_21c905a3c9124fca870215ce416cc7d0.pdf"),
    ("Australian Hardwood Species Reference Guide - Forest Red Gum", "technical_data_sheet", ROOT + "9e2a1a_221cb63ac74c4c4aa157736dd2a84781.pdf"),
    ("Australian Hardwood Species Reference Guide - Blackbutt", "technical_data_sheet", ROOT + "9e2a1a_3d00ddb8a83841a4aea08b958305deb5.pdf"),
    ("Australian Hardwood Species Reference Guide - Silvertop Ash", "technical_data_sheet", ROOT + "9e2a1a_6f3cdaf409a448e682ac5b440bac4a2d.pdf"),
    ("Australian Hardwood Species Reference Guide - Brown Barrel", "technical_data_sheet", ROOT + "9e2a1a_43eb81015c724f2a9f203fb13fbb5abe.pdf"),
    ("Australian Hardwood Species Reference Guide - White Mahogany", "technical_data_sheet", ROOT + "9e2a1a_57de41521907452b8c294646ebc8778f.pdf"),
    ("Australian Hardwood Species Reference Guide - White Cypress", "technical_data_sheet", ROOT + "9e2a1a_2ed537cd7eb44805acb01cda50e03da1.pdf"),
]


def main():
    repo = Path(__file__).resolve().parents[1]
    for key, value in dotenv_values(repo / ".env.local").items():
        if value is not None:
            os.environ[key] = value
    base = os.environ["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    existing = httpx.get(base + "/source_documents", params={
        "manufacturer_id": f"eq.{MFR_ID}", "select": "id,source_url"
    }, headers=headers, timeout=30).raise_for_status().json()
    by_url = {row["source_url"]: row["id"] for row in existing}
    created = queued = 0
    for name, doc_type, url in SOURCES:
        document_id = by_url.get(url)
        if not document_id:
            response = httpx.post(base + "/source_documents", json={
                "manufacturer_id": MFR_ID,
                "original_filename": url.rsplit("/", 1)[-1],
                "document_name": name,
                "document_type": doc_type,
                "storage_provider": "cloudflare_r2",
                "source_url": url,
                "ingest_kind": "url_fetch",
                "status": "pending_fetch",
            }, headers={**headers, "Prefer": "return=representation"}, timeout=30)
            response.raise_for_status()
            document_id = response.json()[0]["id"]
            created += 1
        pending = httpx.get(base + "/pipeline_jobs", params={
            "document_id": f"eq.{document_id}", "job_type": "eq.fetch_url",
            "status": "in.(pending,running)", "select": "id",
        }, headers=headers, timeout=30).raise_for_status().json()
        if not pending:
            response = httpx.post(base + "/pipeline_jobs", json={
                "manufacturer_id": MFR_ID,
                "document_id": document_id,
                "job_type": "fetch_url",
                "status": "pending",
                "payload": {"document_id": document_id, "manufacturer_id": MFR_ID,
                            "source_url": url, "system_source_id": None,
                            "then_docling": True, "chunk_size": 7},
            }, headers={**headers, "Prefer": "return=minimal"}, timeout=30)
            response.raise_for_status()
            queued += 1
        print(f"{name}: registered and queued")
    print(f"Created {created} documents; queued {queued} fetch+Docling jobs.")


if __name__ == "__main__":
    main()
