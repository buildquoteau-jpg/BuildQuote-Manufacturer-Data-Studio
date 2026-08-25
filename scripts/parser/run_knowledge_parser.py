#!/usr/bin/env python3
"""
scripts/parser/run_knowledge_parser.py

The second parser pass (design doc "AI Knowledge Layer + Data Studio
Workspace Redesign", §7 / §14 step 7): extracts installation methods,
fixing requirements, applications, limitations, performance claims (with
test method + condition), standards and certifications from a document's
already-ingested document_chunks, and writes them as knowledge_assertions +
assertion_evidence rows.

Runs AFTER the catalogue parser (run_parser.py) and after document_chunks
exist for the source document (worker's handle_docling — see
docs/sourced-system-card-architecture.md §3.2). Reads chunk text, never a
raw PDF — chunking, page provenance and docling are already done.

Same operating conventions as run_parser.py:
  - dry-run plan saved to .local/parser-dry-run/knowledge_plan_*.json
    BEFORE inserting — a failed insert is retried with --from-plan
    (no re-extraction).
  - Reports to pipeline_jobs via lib.pipeline_report.PipelineReporter,
    whether run standalone or worker-spawned (PIPELINE_JOB_ID in env).
  - Requires migration 065 applied — a 404/42P01 on knowledge_assertions
    fails the run with a clear message, not a stack trace.

NOT executed or verified against real data by the session that wrote this
file — no ANTHROPIC_API_KEY, no live Supabase project, no real manufacturer
PDFs were available. Written to the same standard as run_parser.py and
ready to run once those are available; treat a first real run as a trial,
same as any new parser stage.

Usage:
    python scripts/parser/run_knowledge_parser.py \\
        --source-document-id <uuid> \\
        --staged-system-id <uuid> \\
        --manufacturer-id <uuid> \\
        --dry-run

    # After reviewing the plan:
    python scripts/parser/run_knowledge_parser.py --from-plan .local/parser-dry-run/knowledge_plan_....json
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

PROMPT_PATH = REPO_ROOT / "prompts" / "knowledge_extraction.md"
DRY_RUN_DIR = REPO_ROOT / ".local" / "parser-dry-run"

# Facts whose claim_type/predicate genuinely has no evidence attachment
# point (rare — kept for completeness, not expected to trigger often).
CLAIM_TYPES = {
    "installation_method", "installation_requirement", "application", "limitation",
    "performance_claim", "environmental_constraint", "regulatory_relationship",
    "certification", "maintenance", "safety",
}


# ── Env / Supabase REST (same shape as pipeline_worker.py's sb_* helpers) ──

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
    r = requests.post(f"{supabase_url}/rest/v1/{table}", headers=headers, json=rows)
    if r.status_code >= 400:
        raise RuntimeError(f"POST {table} failed ({r.status_code}): {r.text[:500]}")
    return r.json()


# ── Claude call — single provider, streaming, JSON-in-prompt ───────────────
# (Same approach as run_parser.py's call_claude_interactive, and for the
# same reason: structured-output schemas here also exceed Anthropic's
# union/nullable parameter cap. Single-provider, non-batch: a document's
# knowledge extraction is a handful of chunk calls, not the catalogue
# parser's cross-manufacturer batch volume — the added complexity of the
# batch/OpenAI dual-provider path isn't earned here.)

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

def user_prompt_for_chunk(chunk: dict, manufacturer_name: str, document_name: str) -> str:
    page = chunk.get("page_number")
    heading = chunk.get("heading") or ""
    text = chunk.get("raw_text") or ""
    return (
        f"Manufacturer: {manufacturer_name}\n"
        f"Document: {document_name}\n"
        f"Page: {page}\n"
        f"Section heading: {heading}\n\n"
        f"--- CHUNK TEXT ---\n{text}\n--- END CHUNK ---\n\n"
        f"Extract every fact this chunk supports per the system prompt. "
        f"page_number in your output MUST be {page} for facts from this chunk. "
        f"Return JSON only."
    )


def extract_facts(client, chunks: list, manufacturer_name: str, document_name: str, reporter: PipelineReporter | None) -> list[dict]:
    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")
    all_facts: list[dict] = []
    total = len(chunks)
    for i, chunk in enumerate(chunks, start=1):
        label = f"chunk {i}/{total} (p.{chunk.get('page_number')})"
        print(f"  [knowledge-parser] {label}")
        if reporter:
            reporter.progress({"stage": "extracting", "chunk": i, "totalChunks": total}, log_line=label)

        result = call_claude(client, system_prompt, user_prompt_for_chunk(chunk, manufacturer_name, document_name), label)
        if not result or "facts" not in result:
            continue
        for fact in result["facts"]:
            fact["_chunk_id"] = chunk["id"]
            all_facts.append(fact)
    return all_facts


# ── Plan → knowledge_assertions / assertion_evidence rows ──────────────────

def build_plan(
    facts: list[dict],
    manufacturer_id: str,
    staged_system_id: str,
    source_document_id: str,
    extraction_run_id: str | None,
) -> dict:
    assertions = []
    for fact in facts:
        claim_type = fact.get("claim_type")
        if claim_type not in CLAIM_TYPES:
            claim_type = "unknown"
        assertions.append({
            "manufacturer_id": manufacturer_id,
            "staged_system_id": staged_system_id,
            "subject_kind": fact.get("subject_kind") or "unknown",
            "subject_local_id": fact.get("subject_local_id"),
            "predicate": fact.get("predicate") or "bq:unknown",
            "object_kind": "literal",
            "object_value": {"value": fact.get("value"), "condition": fact.get("condition")},
            "claim_type": claim_type,
            "origin": "document_extracted",
            "epistemic_status": "unverified" if not fact.get("uncertain") else "unverified",
            "confidence": fact.get("confidence"),
            "extraction_run_id": extraction_run_id,
            "reviewer_notes": fact.get("note"),
            # evidence, attached after insert once we have real assertion ids:
            "_evidence": {
                "source_kind": "document",
                "source_document_id": source_document_id,
                "document_chunk_id": fact.get("_chunk_id"),
                "page_start": fact.get("page_number"),
                "quote": fact.get("quote"),
            },
        })
    return {
        "kind": "knowledge_parser_plan_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "manufacturer_id": manufacturer_id,
        "staged_system_id": staged_system_id,
        "source_document_id": source_document_id,
        "assertions": assertions,
    }


def insert_plan(supabase_url: str, headers: dict, plan: dict) -> dict:
    inserted = 0
    for a in plan["assertions"]:
        evidence = a.pop("_evidence")
        row = sb_post(supabase_url, headers, "knowledge_assertions", [a])
        if not row:
            continue
        assertion_id = row[0]["id"]
        inserted += 1
        sb_post(supabase_url, headers, "assertion_evidence", [{
            "assertion_id": assertion_id,
            **evidence,
        }])
    return {"inserted": inserted, "total": len(plan["assertions"])}


# ── Main ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source-document-id")
    parser.add_argument("--staged-system-id")
    parser.add_argument("--manufacturer-id")
    parser.add_argument("--manufacturer-name", default="")
    parser.add_argument("--model", default="claude-sonnet-5")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--from-plan", default=None, help="Skip extraction: insert a previously saved plan JSON")
    args = parser.parse_args()

    anthropic_key, supabase_url, service_key = load_env()

    if args.from_plan:
        plan_file = Path(args.from_plan)
        if not plan_file.exists():
            sys.exit(f"[ERROR] Plan file not found: {plan_file}")
        plan = json.loads(plan_file.read_text(encoding="utf-8"))
        if not supabase_url or not service_key:
            sys.exit("[ERROR] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required to insert")
        headers = sb_headers(service_key)
        try:
            result = insert_plan(supabase_url, headers, plan)
        except Exception as e:
            sys.exit(f"[ERROR] Insert failed — plan preserved at {plan_file}: {e}")
        print(f"[knowledge-parser] Inserted {result['inserted']}/{result['total']} assertions from saved plan.")
        return

    if not args.source_document_id or not args.staged_system_id or not args.manufacturer_id:
        sys.exit("[ERROR] --source-document-id, --staged-system-id and --manufacturer-id are required (unless --from-plan)")

    if not anthropic_key:
        sys.exit("[ERROR] ANTHROPIC_API_KEY required")
    # Unlike run_parser.py, --dry-run here does NOT mean "no Supabase" — this
    # script's input is document_chunks, already ingested by the worker, not
    # a local output.md file. Dry-run only skips the final insert; reading
    # chunks always needs live credentials.
    if not supabase_url or not service_key:
        sys.exit("[ERROR] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required — this script reads document_chunks from Supabase even in --dry-run")

    reporter = PipelineReporter.start(
        "knowledge_parser",
        payload={"source_document_id": args.source_document_id, "staged_system_id": args.staged_system_id},
        manufacturer_id=args.manufacturer_id,
    )

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=anthropic_key)
        client._model = args.model

        headers = sb_headers(service_key) if supabase_url and service_key else None

        doc_rows = sb_get(supabase_url, headers, "source_documents", f"id=eq.{args.source_document_id}&select=document_name") if headers else []
        document_name = doc_rows[0]["document_name"] if doc_rows else "(unknown document)"

        chunks = sb_get(
            supabase_url, headers, "document_chunks",
            f"source_document_id=eq.{args.source_document_id}&select=id,page_number,heading,raw_text&order=chunk_index",
        ) if headers else []

        if not chunks:
            msg = "No document_chunks found for this source document — has docling run for it yet?"
            reporter.fail(msg)
            sys.exit(f"[ERROR] {msg}")

        print(f"[knowledge-parser] {document_name}: {len(chunks)} chunks")
        facts = extract_facts(client, chunks, args.manufacturer_name, document_name, reporter)
        print(f"[knowledge-parser] Extracted {len(facts)} candidate facts.")

        plan = build_plan(facts, args.manufacturer_id, args.staged_system_id, args.source_document_id, None)

        DRY_RUN_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        plan_path = DRY_RUN_DIR / f"knowledge_plan_{ts}.json"
        plan_path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
        print(f"[knowledge-parser] Plan saved to {plan_path}")

        if args.dry_run:
            print(f"\n[knowledge-parser] Dry run — no Supabase writes. Insert later with:\n  --from-plan \"{plan_path}\"")
            reporter.done({"factCount": len(facts), "dryRun": True, "planPath": str(plan_path)})
            return

        try:
            result = insert_plan(supabase_url, headers, plan)
        except Exception as e:
            msg = f"Insert failed — plan preserved at {plan_path}. Retry without re-extracting: --from-plan \"{plan_path}\". Error: {e}"
            reporter.fail(msg)
            sys.exit(f"[ERROR] {msg}")

        print(f"[knowledge-parser] Inserted {result['inserted']}/{result['total']} assertions.")
        reporter.done({"factCount": len(facts), "inserted": result["inserted"], "planPath": str(plan_path)})

    except Exception as e:
        reporter.fail(str(e))
        raise


if __name__ == "__main__":
    main()
