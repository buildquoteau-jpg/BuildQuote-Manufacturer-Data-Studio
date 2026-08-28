#!/usr/bin/env python3
"""
scripts/parser/run_system_identity_parser.py

The system-identity parser (design doc addendum 3 "One workflow:
System-by-system self-serve onboarding", §C3): fills in ONE already-named
system's System Card fields (description, category, profiles, colours,
components, attributes) from that system's own linked documents'
document_chunks. Sibling of run_knowledge_parser.py — same operating
conventions, same input (document_chunks, not a raw PDF or a manufacturer
hints file) — but writes System Card identity instead of knowledge_assertions.

Why this exists instead of reusing run_parser.py (the bulk catalogue
parser): run_parser.py solves a *discovery* problem ("here's an entire
catalogue, find however many products it contains") and always inserts a
fresh staged_systems row per system its own AI response names — traced the
actual insert_parser_output_plan_v1 RPC before writing this file; there is
no lookup against an existing row by id or name. It also requires a
manufacturer-specific hints file (prompts/manufacturer-hints/{slug}.md) that
most manufacturers don't have. This flow has no discovery problem — the
manufacturer already created and named the system, and confirmed which
document(s) are about it — so this script writes directly to that known
staged_system_id via UPDATE/INSERT-with-known-parent, never resolves a name
match, and needs no hints file.

Same operating conventions as run_knowledge_parser.py:
  - dry-run plan saved to .local/parser-dry-run/identity_plan_*.json BEFORE
    writing — a failed write is retried with --from-plan (no re-extraction).
  - Reports to pipeline_jobs via lib.pipeline_report.PipelineReporter,
    whether run standalone or worker-spawned (PIPELINE_JOB_ID in env).
  - --dry-run still needs Supabase read credentials — input is
    document_chunks read from the DB, not a local file; only the final
    write is skipped.

Extraction-is-default, manufacturer-edits-are-authoritative: the UPDATE to
staged_systems only fills fields that are currently null/empty. It never
overwrites a value already there, whether that value came from a prior
extraction or a manufacturer's own edit — same principle as every other
parser in this pipeline.

NOT executed or verified against real data by the session that wrote this
file — no ANTHROPIC_API_KEY, no live Supabase project, no real manufacturer
PDFs were available. Written to the same standard as run_knowledge_parser.py
and ready to run once those are available; treat a first real run as a
trial, same as any new parser stage.

Usage:
    python scripts/parser/run_system_identity_parser.py \\
        --source-document-id <uuid> \\
        --staged-system-id <uuid> \\
        --manufacturer-id <uuid> \\
        --system-name "ShieldClad 180" \\
        --dry-run

    # After reviewing the plan:
    python scripts/parser/run_system_identity_parser.py --from-plan .local/parser-dry-run/identity_plan_....json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))
from lib.pipeline_report import PipelineReporter  # noqa: E402

PROMPT_PATH = REPO_ROOT / "prompts" / "system_identity_extraction.md"
DRY_RUN_DIR = REPO_ROOT / ".local" / "parser-dry-run"


# ── Env / Supabase REST (same shape as run_knowledge_parser.py's helpers) ──

def load_env() -> tuple[str | None, str | None, str | None]:
    try:
        from dotenv import dotenv_values
        env_file = REPO_ROOT / ".env.local"
        if env_file.exists():
            for k, v in dotenv_values(str(env_file)).items():
                if v is not None:
                    os.environ[k] = v
    except ImportError:
        pass
    return (
        os.environ.get("ANTHROPIC_API_KEY"),
        os.environ.get("NEXT_PUBLIC_SUPABASE_URL"),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
    )


def sb_headers(service_key: str) -> dict:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def sb_get(supabase_url: str, headers: dict, table: str, params: str) -> list:
    r = requests.get(f"{supabase_url}/rest/v1/{table}?{params}", headers=headers)
    r.raise_for_status()
    return r.json()


def sb_post(supabase_url: str, headers: dict, table: str, rows: list) -> list:
    if not rows:
        return []
    r = requests.post(f"{supabase_url}/rest/v1/{table}", headers=headers, json=rows)
    if r.status_code >= 400:
        raise RuntimeError(f"POST {table} failed ({r.status_code}): {r.text[:500]}")
    return r.json()


def sb_patch(supabase_url: str, headers: dict, table: str, match: str, fields: dict) -> list:
    if not fields:
        return []
    r = requests.patch(f"{supabase_url}/rest/v1/{table}?{match}", headers=headers, json=fields)
    if r.status_code >= 400:
        raise RuntimeError(f"PATCH {table} failed ({r.status_code}): {r.text[:500]}")
    return r.json()


# ── Claude call (identical shape to run_knowledge_parser.py's call_claude) ─

def call_claude(client, system_prompt: str, user_prompt: str, label: str, max_retries: int = 3):
    delay = 30
    for attempt in range(1, max_retries + 1):
        try:
            with client.messages.stream(
                model=getattr(client, "_model", "claude-sonnet-5"),
                max_tokens=8000,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            ) as stream:
                response = stream.get_final_message()
        except Exception as e:
            err = str(e)
            if "429" in err or "rate limit" in err.lower():
                if attempt < max_retries:
                    print(f"    [RATE LIMIT] {label} attempt {attempt} — waiting {delay}s")
                    time.sleep(delay)
                    continue
            print(f"    [ERROR] API error ({label}): {e}")
            return None

        if response.stop_reason == "refusal":
            print(f"    [ERROR] {label}: model refused")
            return None

        raw = next((b.text for b in response.content if b.type == "text"), "").strip()
        raw = re.sub(r'^```(?:json)?\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            print(f"    [WARN] Invalid JSON ({label}) attempt {attempt}/{max_retries}: {e}")
            if attempt < max_retries:
                time.sleep(5)
                continue
            return None
    return None


# ── Extraction ───────────────────────────────────────────────────────────

def user_prompt_for_chunk(chunk: dict, system_name: str, manufacturer_name: str, document_name: str) -> str:
    page = chunk.get("page_number")
    heading = chunk.get("heading") or ""
    text = chunk.get("raw_text") or ""
    return (
        f"Product you are extracting: {system_name}\n"
        f"Manufacturer: {manufacturer_name}\n"
        f"Document: {document_name}\n"
        f"Page: {page}\n"
        f"Section heading: {heading}\n\n"
        f"--- CHUNK TEXT ---\n{text}\n--- END CHUNK ---\n\n"
        f"Extract every System Card identity fact this chunk states about "
        f"{system_name} specifically, per the system prompt. "
        f"page_number in your output MUST be {page} for facts from this chunk. "
        f"Return JSON only."
    )


def extract_identity(client, chunks: list, system_name: str, manufacturer_name: str, document_name: str, reporter: PipelineReporter | None) -> list[dict]:
    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")
    results: list[dict] = []
    total = len(chunks)
    for i, chunk in enumerate(chunks, start=1):
        label = f"chunk {i}/{total} (p.{chunk.get('page_number')})"
        print(f"  [identity-parser] {label}")
        if reporter:
            reporter.progress({"stage": "extracting", "chunk": i, "totalChunks": total}, log_line=label)

        result = call_claude(client, system_prompt, user_prompt_for_chunk(chunk, system_name, manufacturer_name, document_name), label)
        if result:
            results.append(result)
    return results


# ── Merge across chunks ─────────────────────────────────────────────────
# A document usually states description/category once, but lists
# profiles/colours/components repeatedly across a table and surrounding
# prose — dedupe by normalized name, first occurrence wins for scalar
# fields.

def _norm(s: str | None) -> str:
    return re.sub(r'\s+', ' ', (s or '').strip().lower())


def merge_chunk_results(chunk_results: list[dict]) -> dict:
    description = None
    category = None
    subcategory = None
    profiles: dict[str, dict] = {}
    colours: dict[str, dict] = {}
    components: dict[str, dict] = {}
    attributes: dict[str, dict] = {}

    for r in chunk_results:
        if not description and r.get("description"):
            description = r["description"]
        if not category and r.get("category"):
            category = r["category"]
        if not subcategory and r.get("subcategory"):
            subcategory = r["subcategory"]
        for p in r.get("profiles") or []:
            key = _norm(p.get("product_code")) or _norm(p.get("profile_name"))
            if key and key not in profiles:
                profiles[key] = p
        for c in r.get("colours") or []:
            key = _norm(c.get("colour_name"))
            if key and key not in colours:
                colours[key] = c
        for comp in r.get("components") or []:
            key = _norm(comp.get("sku")) or _norm(comp.get("name"))
            if key and key not in components:
                components[key] = comp
        for a in r.get("attributes") or []:
            key = _norm(a.get("label"))
            if key and key not in attributes:
                attributes[key] = a

    return {
        "description": description,
        "category": category,
        "subcategory": subcategory,
        "profiles": list(profiles.values()),
        "colours": list(colours.values()),
        "components": list(components.values()),
        "attributes": list(attributes.values()),
    }


# ── Plan → staged_systems UPDATE + staged_system_profiles/colours/components ─

def build_plan(merged: dict, manufacturer_id: str, staged_system_id: str, source_document_id: str, existing_system: dict) -> dict:
    # Only fill fields the system doesn't already have a value for — never
    # clobber a prior extraction or a manufacturer's own edit.
    system_update = {}
    if not existing_system.get("description") and merged["description"]:
        system_update["description"] = merged["description"]
    if not existing_system.get("category") and merged["category"]:
        system_update["category"] = merged["category"]
    if not existing_system.get("subcategory") and merged["subcategory"]:
        system_update["subcategory"] = merged["subcategory"]

    existing_attrs = existing_system.get("custom_technical_attributes") or []
    existing_attr_labels = {_norm(a.get("label")) for a in existing_attrs}
    new_attrs = [
        {"label": a["label"], "value": a["value"]}
        for a in merged["attributes"]
        if a.get("label") and a.get("value") and _norm(a["label"]) not in existing_attr_labels
    ]
    if new_attrs:
        system_update["custom_technical_attributes"] = existing_attrs + new_attrs

    profiles = [
        {
            "staged_system_id": staged_system_id,
            "profile_name": p.get("profile_name") or "Profile",
            "product_code": p.get("product_code"),
            "length_mm": p.get("length_mm"),
            "width_mm": p.get("width_mm"),
            "height_mm": p.get("height_mm"),
            "thickness_mm": p.get("thickness_mm"),
            "uom": p.get("uom"),
            "sort_order": i,
            "extraction_confidence": 0.8,
            "parser_notes": json.dumps({"page_number": p.get("page_number"), "quote": p.get("quote")}),
        }
        for i, p in enumerate(merged["profiles"])
    ]
    colours = [
        {
            "staged_system_id": staged_system_id,
            "colour_name": c["colour_name"],
            "sku_suffix": c.get("sku_suffix"),
            "is_stocked": c.get("is_stocked"),
            "sort_order": i,
            "extraction_confidence": 0.8,
        }
        for i, c in enumerate(merged["colours"]) if c.get("colour_name")
    ]
    components = [
        {
            "manufacturer_id": manufacturer_id,
            "source_document_id": source_document_id,
            "sku": c.get("sku"),
            "name": c.get("name") or "Component",
            "description": c.get("description"),
            "sort_order": i,
            "extraction_confidence": 0.8,
            # role/notes attach to the staged_system_components link row,
            # created after this row's real id is known — see insert_plan.
            "_role": c.get("role") or "accessory",
        }
        for i, c in enumerate(merged["components"])
    ]

    return {
        "kind": "system_identity_parser_plan_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "manufacturer_id": manufacturer_id,
        "staged_system_id": staged_system_id,
        "source_document_id": source_document_id,
        "system_update": system_update,
        "profiles": profiles,
        "colours": colours,
        "components": components,
    }


def insert_plan(supabase_url: str, headers: dict, plan: dict) -> dict:
    staged_system_id = plan["staged_system_id"]
    match = f"id=eq.{staged_system_id}"

    if plan["system_update"]:
        sb_patch(supabase_url, headers, "staged_systems", match, plan["system_update"])

    if plan["profiles"]:
        sb_post(supabase_url, headers, "staged_system_profiles", plan["profiles"])
    if plan["colours"]:
        sb_post(supabase_url, headers, "staged_system_colours", plan["colours"])

    components_inserted = 0
    for comp in plan["components"]:
        role = comp.pop("_role")
        rows = sb_post(supabase_url, headers, "staged_components", [comp])
        if not rows:
            continue
        component_id = rows[0]["id"]
        components_inserted += 1
        sb_post(supabase_url, headers, "staged_system_components", [{
            "staged_system_id": staged_system_id,
            "staged_component_id": component_id,
            "role": role,
            "sort_order": comp["sort_order"],
            "extraction_confidence": comp["extraction_confidence"],
        }])

    return {
        "systemUpdated": bool(plan["system_update"]),
        "profilesInserted": len(plan["profiles"]),
        "coloursInserted": len(plan["colours"]),
        "componentsInserted": components_inserted,
    }


# ── Main ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source-document-id")
    parser.add_argument("--staged-system-id")
    parser.add_argument("--manufacturer-id")
    parser.add_argument("--manufacturer-name", default="")
    parser.add_argument("--system-name", default="")
    parser.add_argument("--model", default="claude-sonnet-5")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--from-plan", default=None, help="Skip extraction: write a previously saved plan JSON")
    args = parser.parse_args()

    anthropic_key, supabase_url, service_key = load_env()

    if args.from_plan:
        plan_file = Path(args.from_plan)
        if not plan_file.exists():
            sys.exit(f"[ERROR] Plan file not found: {plan_file}")
        plan = json.loads(plan_file.read_text(encoding="utf-8"))
        if not supabase_url or not service_key:
            sys.exit("[ERROR] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required to write")
        headers = sb_headers(service_key)
        try:
            result = insert_plan(supabase_url, headers, plan)
        except Exception as e:
            sys.exit(f"[ERROR] Write failed — plan preserved at {plan_file}: {e}")
        print(f"[identity-parser] Wrote from saved plan: {result}")
        return

    if not args.source_document_id or not args.staged_system_id or not args.manufacturer_id or not args.system_name:
        sys.exit("[ERROR] --source-document-id, --staged-system-id, --manufacturer-id and --system-name are required (unless --from-plan)")

    if not anthropic_key:
        sys.exit("[ERROR] ANTHROPIC_API_KEY required")
    # Same as run_knowledge_parser.py: --dry-run still needs Supabase read
    # credentials — input is document_chunks and the current staged_systems
    # row (to avoid clobbering existing values), both read live. Only the
    # final write is skipped.
    if not supabase_url or not service_key:
        sys.exit("[ERROR] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required — this script reads document_chunks and staged_systems from Supabase even in --dry-run")

    reporter = PipelineReporter.start(
        "system_identity_parser",
        payload={"source_document_id": args.source_document_id, "staged_system_id": args.staged_system_id},
        manufacturer_id=args.manufacturer_id,
    )

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=anthropic_key)
        client._model = args.model

        headers = sb_headers(service_key)

        doc_rows = sb_get(supabase_url, headers, "source_documents", f"id=eq.{args.source_document_id}&select=document_name")
        document_name = doc_rows[0]["document_name"] if doc_rows else "(unknown document)"

        system_rows = sb_get(
            supabase_url, headers, "staged_systems",
            f"id=eq.{args.staged_system_id}&select=description,category,subcategory,custom_technical_attributes",
        )
        if not system_rows:
            msg = f"staged_systems row {args.staged_system_id} not found"
            reporter.fail(msg)
            sys.exit(f"[ERROR] {msg}")
        existing_system = system_rows[0]

        chunks = sb_get(
            supabase_url, headers, "document_chunks",
            f"source_document_id=eq.{args.source_document_id}&select=id,page_number,heading,raw_text&order=chunk_index",
        )
        if not chunks:
            msg = "No document_chunks found for this source document — has docling run for it yet?"
            reporter.fail(msg)
            sys.exit(f"[ERROR] {msg}")

        print(f"[identity-parser] {document_name}: {len(chunks)} chunks for '{args.system_name}'")
        chunk_results = extract_identity(client, chunks, args.system_name, args.manufacturer_name, document_name, reporter)
        merged = merge_chunk_results(chunk_results)
        print(
            f"[identity-parser] Merged: description={'yes' if merged['description'] else 'no'}, "
            f"{len(merged['profiles'])} profiles, {len(merged['colours'])} colours, "
            f"{len(merged['components'])} components, {len(merged['attributes'])} attributes"
        )

        plan = build_plan(merged, args.manufacturer_id, args.staged_system_id, args.source_document_id, existing_system)

        DRY_RUN_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        plan_path = DRY_RUN_DIR / f"identity_plan_{ts}.json"
        plan_path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
        print(f"[identity-parser] Plan saved to {plan_path}")

        if args.dry_run:
            print(f"\n[identity-parser] Dry run — no Supabase writes. Write later with:\n  --from-plan \"{plan_path}\"")
            reporter.done({"dryRun": True, "planPath": str(plan_path)})
            return

        try:
            result = insert_plan(supabase_url, headers, plan)
        except Exception as e:
            msg = f"Write failed — plan preserved at {plan_path}. Retry without re-extracting: --from-plan \"{plan_path}\". Error: {e}"
            reporter.fail(msg)
            sys.exit(f"[ERROR] {msg}")

        print(f"[identity-parser] {result}")
        reporter.done({**result, "planPath": str(plan_path)})

    except Exception as e:
        reporter.fail(str(e))
        raise


if __name__ == "__main__":
    main()
