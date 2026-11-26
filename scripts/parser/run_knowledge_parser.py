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
SUMMARY_PROMPT_PATH = REPO_ROOT / "prompts" / "document_summary.md"
DRY_RUN_DIR = REPO_ROOT / ".local" / "parser-dry-run"

# Facts whose claim_type/predicate genuinely has no evidence attachment
# point (rare — kept for completeness, not expected to trigger often).
CLAIM_TYPES = {
    "installation_method", "installation_requirement", "application", "limitation",
    "performance_claim", "environmental_constraint", "regulatory_relationship",
    "certification", "maintenance", "safety",
}

VALID_RELATIONS = {
    "compatible_with", "incompatible_with", "requires_system",
    "supersedes", "superseded_by", "substitute_for",
}

DEFAULT_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-sonnet-5-5"
FALLBACK_MODELS = ("claude-sonnet-5", "claude-sonnet-4-6")


def _norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _is_other_product(item: dict) -> bool:
    return _norm(item.get("product_scope")) == "other_product"


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


def sb_patch(supabase_url: str, headers: dict, table: str, params: str, data: dict) -> list:
    r = requests.patch(f"{supabase_url}/rest/v1/{table}?{params}", headers=headers, json=data)
    if r.status_code >= 400:
        raise RuntimeError(f"PATCH {table} failed ({r.status_code}): {r.text[:500]}")
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
        model_id = getattr(client, "_model", DEFAULT_MODEL)
        try:
            with client.messages.stream(
                model=model_id,
                max_tokens=8000,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            ) as stream:
                response = stream.get_final_message()
        except Exception as e:
            err = str(e)
            if "404" in err or "not_found" in err.lower():
                next_model = next((m for m in FALLBACK_MODELS if m != model_id), None)
                if next_model:
                    print(f"    [MODEL FALLBACK] {model_id} unavailable — switching to {next_model}")
                    client._model = next_model
                    continue
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

def user_prompt_for_chunk(
    chunk: dict,
    manufacturer_name: str,
    document_name: str,
    system_name: str = "",
    sibling_products: list[str] | None = None,
) -> str:
    page = chunk.get("page_number")
    heading = chunk.get("heading") or ""
    text = chunk.get("raw_text") or ""
    target_line = f"Product you are extracting: {system_name}\n" if system_name else ""
    sibling_line = (
        f"Other products in this brand to EXCLUDE (unless explicitly shared across all ranges): "
        f"{', '.join(sibling_products)}\n"
        if sibling_products
        else ""
    )
    scope_guard = (
        f"ONLY extract facts and relationships that apply to {system_name} specifically "
        f"(or explicitly to ALL products in this brand). NEVER attach facts from sibling products. "
        if system_name
        else ""
    )
    return (
        f"{target_line}"
        f"{sibling_line}"
        f"Manufacturer: {manufacturer_name}\n"
        f"Document: {document_name}\n"
        f"Page: {page}\n"
        f"Section heading: {heading}\n\n"
        f"--- CHUNK TEXT ---\n{text}\n--- END CHUNK ---\n\n"
        f"Extract every fact, negative constraint, and explicit compatibility relationship this chunk supports per the system prompt. "
        f"{scope_guard}"
        f"page_number in your output MUST be {page} for facts from this chunk. "
        f"Return JSON only."
    )


def extract_facts(
    client,
    chunks: list,
    manufacturer_name: str,
    document_name: str,
    reporter: PipelineReporter | None,
    system_name: str = "",
    sibling_products: list[str] | None = None,
) -> tuple[list[dict], list[dict], int]:
    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")
    all_facts: list[dict] = []
    all_relationships: list[dict] = []
    rejected_other = 0
    total = len(chunks)
    for i, chunk in enumerate(chunks, start=1):
        label = f"chunk {i}/{total} (p.{chunk.get('page_number')})"
        print(f"  [knowledge-parser] {label}")
        if reporter:
            reporter.progress({"stage": "extracting", "chunk": i, "totalChunks": total}, log_line=label)

        result = call_claude(
            client,
            system_prompt,
            user_prompt_for_chunk(chunk, manufacturer_name, document_name, system_name, sibling_products),
            label,
        )
        if not result:
            continue
        for fact in result.get("facts") or []:
            if _is_other_product(fact):
                rejected_other += 1
                continue
            fact["_chunk_id"] = chunk["id"]
            all_facts.append(fact)
        for rel in result.get("relationships") or []:
            if _is_other_product(rel):
                rejected_other += 1
                continue
            if rel.get("relation") in VALID_RELATIONS and (rel.get("target_name") or "").strip():
                all_relationships.append(rel)
    return all_facts, all_relationships, rejected_other


# ── Document summary — design doc addendum 3 §C6, un-deferred ──────────────
# One extra Claude call per document (not per chunk) — a short orientation
# synopsis distinct from both the discrete facts above and the existing
# claim-type-grouped bq:retrievalDocuments (buildSystemKnowledge.ts). Stored
# on system_sources.ai_summary (migration 067) rather than recomputed on
# every knowledge.jsonld request.

MAX_SUMMARY_INPUT_CHARS = 8000


def synthesize_document_summary(
    client, chunks: list, manufacturer_name: str, document_name: str, system_name: str, reporter: PipelineReporter | None,
) -> dict | None:
    if not SUMMARY_PROMPT_PATH.exists():
        return None
    system_prompt = SUMMARY_PROMPT_PATH.read_text(encoding="utf-8")

    excerpt = ""
    for chunk in chunks:
        text = chunk.get("raw_text") or ""
        if not text:
            continue
        remaining = MAX_SUMMARY_INPUT_CHARS - len(excerpt)
        if remaining <= 0:
            break
        excerpt += (("\n\n" if excerpt else "") + text[:remaining])

    if not excerpt.strip():
        return None

    user_prompt = (
        f"Manufacturer: {manufacturer_name}\n"
        f"Product: {system_name or '(unnamed)'}\n"
        f"Document: {document_name}\n\n"
        f"--- EXCERPTS ---\n{excerpt}\n--- END EXCERPTS ---\n\n"
        f"Summarise what this document covers for this product per the system prompt. Return JSON only."
    )

    print("  [knowledge-parser] Synthesizing document summary")
    if reporter:
        reporter.progress({"stage": "summarizing"}, log_line="Synthesizing document summary")

    result = call_claude(client, system_prompt, user_prompt, "document summary")
    if not result or not result.get("summary"):
        return None
    return {"summary": result["summary"], "topics": result.get("topics") or []}


# ── Plan → knowledge_assertions / assertion_evidence rows ──────────────────

def build_plan(
    facts: list[dict],
    manufacturer_id: str,
    staged_system_id: str,
    source_document_id: str,
    extraction_run_id: str | None,
    document_summary: dict | None = None,
    relationships: list[dict] | None = None,
    own_systems_by_name: dict[str, str] | None = None,
    system_name: str = "",
    origin: str = "document_extracted",
    source_kind: str = "document",
    source_url: str | None = None,
) -> dict:
    assertions = []
    seen_assertion_keys: set[tuple[str, str]] = set()
    for fact in facts:
        claim_type = fact.get("claim_type")
        if claim_type not in CLAIM_TYPES:
            claim_type = "unknown"
        predicate = fact.get("predicate") or "bq:unknown"
        val_norm = _norm(str(fact.get("value") or ""))
        if val_norm:
            key = (_norm(predicate), val_norm)
            if key in seen_assertion_keys:
                continue
            seen_assertion_keys.add(key)

        reviewer_note = fact.get("note")
        if _norm(fact.get("product_scope")) == "ambiguous":
            prefix = f"[Review product scope — confirm this applies to {system_name or 'this product'}]"
            reviewer_note = f"{prefix} {reviewer_note}".strip() if reviewer_note else prefix

        assertions.append({
            "manufacturer_id": manufacturer_id,
            "staged_system_id": staged_system_id,
            "subject_kind": fact.get("subject_kind") or "unknown",
            "subject_local_id": fact.get("subject_local_id"),
            "predicate": predicate,
            "object_kind": "literal",
            "object_value": {"value": fact.get("value"), "condition": fact.get("condition")},
            "claim_type": claim_type,
            "origin": origin,
            "epistemic_status": "unverified",
            "confidence": fact.get("confidence"),
            "extraction_run_id": extraction_run_id,
            "reviewer_notes": reviewer_note,
            # evidence, attached after insert once we have real assertion ids:
            "_evidence": {
                "source_kind": source_kind,
                "source_document_id": source_document_id,
                "document_chunk_id": fact.get("_chunk_id"),
                "page_start": fact.get("page_number"),
                "quote": fact.get("quote"),
                "source_url": source_url,
            },
        })

    own_map = own_systems_by_name or {}
    rel_rows = []
    seen_rel_keys: set[tuple[str, str]] = set()
    for i, rel in enumerate(relationships or []):
        relation = rel.get("relation")
        target_name = (rel.get("target_name") or "").strip()
        if relation not in VALID_RELATIONS or not target_name:
            continue
        rkey = (relation, _norm(target_name))
        if rkey in seen_rel_keys:
            continue
        seen_rel_keys.add(rkey)

        matched_own_id = own_map.get(_norm(target_name))
        if matched_own_id == staged_system_id:
            continue  # never link a product to itself

        target_kind_raw = _norm(rel.get("target_kind"))
        ext_kind = "generic_class" if target_kind_raw == "generic_class" else "product"
        quote = (rel.get("quote") or "").strip()
        page_num = rel.get("page_number")
        note = f"p.{page_num}: \"{quote}\"" if (page_num and quote) else (quote or None)

        rel_rows.append({
            "manufacturer_id": manufacturer_id,
            "staged_system_id": staged_system_id,
            "relation": relation,
            "target_staged_system_id": matched_own_id,
            "target_external": None if matched_own_id else {"name": target_name, "kind": ext_kind},
            "note": note,
            "reason": (rel.get("reason") or "").strip() or None,
            "epistemic_status": "unverified",
            "sort_order": i,
        })

    return {
        "kind": "knowledge_parser_plan_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "manufacturer_id": manufacturer_id,
        "staged_system_id": staged_system_id,
        "source_document_id": source_document_id,
        "assertions": assertions,
        "relationships": rel_rows,
        "document_summary": document_summary,
    }


def insert_document_summary(supabase_url: str, headers: dict, plan: dict) -> bool:
    """Writes plan['document_summary'] onto the matching system_sources row
    (migration 067). Best-effort: a pre-067 environment or a document with no
    system_sources link yet just skips this — the assertions above are the
    primary payload and must not be lost over a missing summary column."""
    summary = plan.get("document_summary")
    if not summary or not summary.get("summary"):
        return False
    try:
        rows = sb_get(
            supabase_url, headers, "system_sources",
            f"staged_system_id=eq.{plan['staged_system_id']}&source_document_id=eq.{plan['source_document_id']}&select=id",
        )
        if not rows:
            print("  [knowledge-parser] warning: no system_sources row found to attach the document summary to — skipped")
            return False
        sb_patch(
            supabase_url, headers, "system_sources", f"id=eq.{rows[0]['id']}",
            {"ai_summary": summary["summary"], "ai_summary_generated_at": datetime.now(timezone.utc).isoformat()},
        )
        return True
    except Exception as e:
        print(f"  [knowledge-parser] warning: could not save document summary (migration 067 applied?): {e}")
        return False


def insert_plan(supabase_url: str, headers: dict, plan: dict) -> dict:
    staged_system_id = plan["staged_system_id"]

    # Fetch existing assertions on this system so re-extracting is idempotent
    # and never duplicates verified or previously extracted facts.
    existing_assertions = sb_get(
        supabase_url, headers, "knowledge_assertions",
        f"staged_system_id=eq.{staged_system_id}&select=predicate,object_value",
    )
    seen_existing: set[tuple[str, str]] = set()
    for ea in existing_assertions:
        ov = ea.get("object_value")
        val = ov.get("value") if isinstance(ov, dict) else ov
        seen_existing.add((_norm(ea.get("predicate")), _norm(str(val or ""))))

    inserted = 0
    skipped_dupes = 0
    for a in plan["assertions"]:
        a_copy = dict(a)
        evidence = a_copy.pop("_evidence")
        ov = a_copy.get("object_value")
        val = ov.get("value") if isinstance(ov, dict) else ov
        key = (_norm(a_copy.get("predicate")), _norm(str(val or "")))
        if key in seen_existing:
            skipped_dupes += 1
            continue
        seen_existing.add(key)
        row = sb_post(supabase_url, headers, "knowledge_assertions", [a_copy])
        if not row:
            continue
        assertion_id = row[0]["id"]
        inserted += 1
        sb_post(supabase_url, headers, "assertion_evidence", [{
            "assertion_id": assertion_id,
            **evidence,
        }])

    # Insert candidate relationships (idempotent, fails soft if table absent)
    relationships_inserted = 0
    rel_candidates = plan.get("relationships") or []
    if rel_candidates:
        try:
            existing_rels = sb_get(
                supabase_url, headers, "system_relationships",
                f"staged_system_id=eq.{staged_system_id}&select=relation,target_staged_system_id,target_external",
            )
            seen_rels: set[tuple[str, str]] = set()
            for er in existing_rels:
                tgt = er.get("target_staged_system_id") or (
                    (er.get("target_external") or {}).get("name")
                    if isinstance(er.get("target_external"), dict)
                    else ""
                )
                seen_rels.add((_norm(er.get("relation")), _norm(str(tgt or ""))))

            for rel in rel_candidates:
                tgt = rel.get("target_staged_system_id") or (
                    (rel.get("target_external") or {}).get("name")
                    if isinstance(rel.get("target_external"), dict)
                    else ""
                )
                rkey = (_norm(rel.get("relation")), _norm(str(tgt or "")))
                if rkey in seen_rels:
                    continue
                seen_rels.add(rkey)
                sb_post(supabase_url, headers, "system_relationships", [rel])
                relationships_inserted += 1
        except Exception as e:
            print(f"  [knowledge-parser] warning: could not save candidate relationships: {e}")

    summary_saved = insert_document_summary(supabase_url, headers, plan)
    return {
        "inserted": inserted,
        "skippedDupes": skipped_dupes,
        "total": len(plan["assertions"]),
        "relationshipsInserted": relationships_inserted,
        "summarySaved": summary_saved,
    }


# ── Main ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source-document-id")
    parser.add_argument("--staged-system-id")
    parser.add_argument("--manufacturer-id")
    parser.add_argument("--manufacturer-name", default="")
    parser.add_argument("--system-name", default="", help="Product name used to isolate facts to this specific product")
    parser.add_argument("--model", default=DEFAULT_MODEL)
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
        print(f"[knowledge-parser] Inserted {result['inserted']}/{result['total']} assertions, {result['relationshipsInserted']} relationships from saved plan.")
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

        doc_rows = sb_get(
            supabase_url, headers, "source_documents",
            f"id=eq.{args.source_document_id}&select=document_name,document_type,source_url",
        ) if headers else []
        doc_meta = doc_rows[0] if doc_rows else {}
        document_name = doc_meta.get("document_name") or "(unknown document)"
        is_webpage = doc_meta.get("document_type") == "website"
        origin = "web_extracted" if is_webpage else "document_extracted"
        source_kind = "web_page" if is_webpage else "document"
        source_url = doc_meta.get("source_url")

        # Resolve target system name + sibling products under this manufacturer
        # so multi-product install guides never contaminate sibling products.
        brand_systems = sb_get(
            supabase_url, headers, "staged_systems",
            f"manufacturer_id=eq.{args.manufacturer_id}&select=id,name",
        ) if headers else []
        system_name = args.system_name
        sibling_products: list[str] = []
        own_systems_by_name: dict[str, str] = {}
        for s in brand_systems:
            sname = (s.get("name") or "").strip()
            if not sname:
                continue
            own_systems_by_name[_norm(sname)] = s["id"]
            if s["id"] == args.staged_system_id:
                if not system_name:
                    system_name = sname
            else:
                sibling_products.append(sname)

        chunks = sb_get(
            supabase_url, headers, "document_chunks",
            f"source_document_id=eq.{args.source_document_id}&select=id,page_number,heading,raw_text&order=chunk_index",
        ) if headers else []

        if not chunks:
            msg = "No document_chunks found for this source document — has docling run for it yet?"
            reporter.fail(msg)
            sys.exit(f"[ERROR] {msg}")

        print(
            f"[knowledge-parser] {document_name}: {len(chunks)} chunks for '{system_name}' "
            f"(excluding {len(sibling_products)} sibling products)"
        )
        facts, relationships, rejected_other = extract_facts(
            client, chunks, args.manufacturer_name, document_name, reporter,
            system_name=system_name, sibling_products=sibling_products,
        )
        print(
            f"[knowledge-parser] Extracted {len(facts)} candidate facts, "
            f"{len(relationships)} candidate relationships (rejected_other_product={rejected_other})."
        )

        document_summary = synthesize_document_summary(
            client, chunks, args.manufacturer_name, document_name, system_name, reporter,
        )

        plan = build_plan(
            facts, args.manufacturer_id, args.staged_system_id, args.source_document_id, None,
            document_summary=document_summary,
            relationships=relationships,
            own_systems_by_name=own_systems_by_name,
            system_name=system_name,
            origin=origin,
            source_kind=source_kind,
            source_url=source_url,
        )

        DRY_RUN_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        plan_path = DRY_RUN_DIR / f"knowledge_plan_{ts}.json"
        plan_path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
        print(f"[knowledge-parser] Plan saved to {plan_path}")

        if args.dry_run:
            print(f"\n[knowledge-parser] Dry run — no Supabase writes. Insert later with:\n  --from-plan \"{plan_path}\"")
            reporter.done({
                "factCount": len(facts),
                "relationshipCount": len(relationships),
                "rejectedOtherProduct": rejected_other,
                "dryRun": True,
                "planPath": str(plan_path),
            })
            return

        try:
            result = insert_plan(supabase_url, headers, plan)
        except Exception as e:
            msg = f"Insert failed — plan preserved at {plan_path}. Retry without re-extracting: --from-plan \"{plan_path}\". Error: {e}"
            reporter.fail(msg)
            sys.exit(f"[ERROR] {msg}")

        print(
            f"[knowledge-parser] Inserted {result['inserted']}/{result['total']} assertions "
            f"(skipped {result['skippedDupes']} dupes), {result['relationshipsInserted']} relationships. "
            f"Document summary saved: {result['summarySaved']}."
        )
        reporter.done({
            "factCount": len(facts),
            "inserted": result["inserted"],
            "skippedDupes": result["skippedDupes"],
            "relationshipsInserted": result["relationshipsInserted"],
            "rejectedOtherProduct": rejected_other,
            "summarySaved": result["summarySaved"],
            "planPath": str(plan_path),
        })

    except Exception as e:
        reporter.fail(str(e))
        raise


if __name__ == "__main__":
    main()
