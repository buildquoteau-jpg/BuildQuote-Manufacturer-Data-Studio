#!/usr/bin/env python3
"""
run_parser.py — AI parser: Docling markdown -> Supabase staging tables.

Two-pass approach:
  Stage 1: Extract systems + profiles + colours per catalogue section.
  Stage 2: Extract components + system-component links per section.

Default mode submits every chunk in a stage as one Message Batches API call
(50% cheaper than interactive, no per-chunk rate-limit pacing) and uses
structured outputs (output_config.format) so a chunk either produces
schema-valid JSON or a clean batch-result failure — no more invalid-JSON
retry loop. Pass --interactive to fall back to the old one-call-per-chunk
loop (used automatically for --openai-model, which has no Batches API here).

Writes to Supabase via insert_parser_output_plan_v1 RPC (service role).

Usage:
    python scripts/parser/run_parser.py \
        --input ".local/docling-output/<run>/output.md" \
        --manufacturer-id "6092e3a5-a542-4869-a2b2-6fc34cc82c83" \
        --manufacturer-name "James Hardie" \
        --hints "prompts/manufacturer-hints/james_hardie.md" \
        [--dry-run] [--interactive]

Environment (.env.local):
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    ANTHROPIC_API_KEY

Dependencies:
    pip install anthropic httpx python-dotenv

Run from repo root. Any Python venv with the above packages.
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# scripts/lib is importable regardless of cwd
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.pipeline_report import PipelineReporter  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
from table_stitcher import stitch_split_tables  # noqa: E402

# Force unbuffered stdout so output appears immediately when piped. Also force
# UTF-8 — Windows' default console codepage (cp1252) can't encode characters
# like → that show up in extracted catalogue text or model warnings, and a
# redirected/piped run crashes with UnicodeEncodeError deep into a multi-hour
# parse instead of failing fast.
sys.stdout.reconfigure(line_buffering=True, encoding="utf-8")


# ============================================================
# Prompts
# ============================================================

STAGE1_SYSTEM_PROMPT = """You are a structured data extraction assistant for BuildQuote, a construction product catalogue platform for Australia.

Your task: extract ALL systems, profile variants, and colour options from a section of a manufacturer product catalogue.

DEFINITIONS:
- SYSTEM: a named product line (e.g. "Axon™ Cladding", "Stria™ Cladding Fine Texture", "Hardie™ Wrap Weather Barrier")
- PROFILE: a specific dimensional/SKU variant of a system — the primary sellable board, panel, sheet, or roll in a given size. These are the things builders quantify and order.
- COLOUR: a stocked colour or finish option. Many products are pre-primed/site-painted — these have NO colour rows.

CLASSIFICATION RULES:
- Profiles = the main sellable dimensional variants. Board lengths, sheet sizes, roll widths.
- Do NOT put accessories, trims, clips, fasteners, tapes, tools, or installation products in profiles. Those are components and will be extracted separately.
- If a product is pre-primed or site-painted with no stocked colours, leave system_colours empty and note it in the system's notes field.

RULES:
1. Do not invent products. Extract only what is explicitly in the source.
2. Set any unknown field to null.
3. All dimension values must be numeric (no units inside the value).
4. Extract every profile row — even if there are 8+ variants of the same system.
5. source_page_number should be the catalogue page number if visible in the content.
6. Every system_match / staged_system_match "system_name" you emit must be copied VERBATIM (same casing, same trademark symbols) from a "name" you emitted in this response's own "systems" array — do not paraphrase or abbreviate it. This is the join key used to link profiles/colours back to their system."""

STAGE1_USER_TEMPLATE = """Manufacturer: {manufacturer_name}
Catalogue section (pages {page_start}–{page_end}):

{chunk_text}

---

Extract all systems, profiles, and colours from this section.

Return this exact JSON shape:

{{
  "systems": [
    {{
      "name": "string — exact product name as printed",
      "product_code": "string or null — system-level code if any",
      "category": "string — e.g. Cladding, Weatherboard, Lining, Flooring, Eaves, Barrier, Decking, Wall System",
      "subcategory": "string or null — e.g. Fine Texture, Smooth, Grooved, AAC",
      "description": "string or null — factual product description only, no marketing language",
      "bal_rating": "string or null",
      "acoustic_rating": "string or null",
      "moisture_resistant": "boolean or null",
      "structural_grade": "string or null",
      "double_sided": "boolean or null",
      "install_guide_urls": null,
      "tech_data_url": null,
      "notes": "string or null — e.g. pre-primed/site-painted note",
      "australian_made": "boolean or null — true if explicitly stated as made in Australia, null if unknown",
      "source_page_number": "integer or null",
      "extraction_confidence": 0.0,
      "parser_notes": []
    }}
  ],
  "system_profiles": [
    {{
      "system_match": {{"system_name": "string", "product_code": "string or null"}},
      "name": "string — full descriptive profile name e.g. 'Axon™ Cladding 133mm Smooth 3000mm'",
      "profile_name": "string — short label e.g. '133mm Smooth 3000mm'",
      "product_code": "string or null — SKU for this specific profile",
      "dimensions": "string — raw dimension text as printed e.g. '3000 x 1200 x 9mm'",
      "length_mm": null,
      "width_mm": null,
      "height_mm": null,
      "thickness_mm": null,
      "depth_mm": null,
      "gauge_mm": null,
      "diameter_mm": null,
      "roll_m": null,
      "length_m": null,
      "weight_kg": null,
      "weight_g": null,
      "volume_ml": null,
      "pieces": null,
      "uom": "string — e.g. sheet, board, length, roll, lm, m2",
      "pack_format": "string or null",
      "supplier_pack_qty": null,
      "supplier_pack_uom": "string or null",
      "supplier_pack_note": "string or null",
      "bal_rating": "string or null",
      "sheet_format": "string or null",
      "sort_order": null,
      "source_page_number": "integer or null",
      "extraction_confidence": 0.0,
      "parser_notes": []
    }}
  ],
  "system_colours": [
    {{
      "system_match": {{"system_name": "string", "product_code": "string or null"}},
      "colour_name": "string — exact colour name as printed",
      "sku": "string or null — colour-specific SKU if listed",
      "sku_suffix": "string or null — suffix appended to base SKU e.g. '-AG'",
      "is_stocked": "boolean or null",
      "sort_order": null
    }}
  ],
  "warnings": [],
  "ignored_content_notes": []
}}"""

STAGE1_HINTS_SECTION = "Manufacturer hints:\n{hints_text}"

STAGE2_SYSTEM_PROMPT = """You are a structured data extraction assistant for BuildQuote, a construction product catalogue platform for Australia.

Your task: extract ALL components, accessories, fixings, tools, and installation products from a section of a manufacturer product catalogue.

DEFINITIONS:
- COMPONENT: any supporting product that accompanies a system — trims, corners, clips, fasteners, sealants, tapes, wraps, blades, nails, brackets, connectors, flashing, underlays used as accessories.
- NOT a component: the primary panels/boards/sheets/rolls that are the main product. Those are profiles and have already been extracted.

CLASSIFICATION RULES:
- If it's an accessory, fixing, trim, tool, or installation product → it's a component.
- If it's the primary board/panel/sheet that builders quantify → skip it (already extracted as a profile).
- Link each component to the system(s) it belongs to using staged_system_match.
- A component can be shared across multiple systems — create one component row and multiple link rows.

RULES:
1. Do not invent products.
2. Set unknown fields to null.
3. All dimension values must be numeric.
4. Use "uom" not "unit".
5. supplier_pack_qty is the manufacturer pack size, not the customer order quantity.
6. Every staged_system_match "system_name" you emit must be copied VERBATIM (same casing, same trademark symbols) from the "Known systems" list provided below — do not paraphrase or abbreviate it. This is the join key used to link the component to its system."""

STAGE2_USER_TEMPLATE = """Manufacturer: {manufacturer_name}
Catalogue section (pages {page_start}–{page_end}):

{chunk_text}

---

Extract all components, accessories, fixings, and tools from this section.

Return this exact JSON shape:

{{
  "components": [
    {{
      "sku": "string or null",
      "name": "string — exact product name as printed",
      "description": "string or null",
      "category": "string — e.g. Trims, Fixings, Sealants, Tools, Barriers, Connectors",
      "uom": "string — e.g. each, pack, roll, length, box, tube",
      "length_mm": null,
      "width_mm": null,
      "height_mm": null,
      "thickness_mm": null,
      "depth_mm": null,
      "gauge_mm": null,
      "diameter_mm": null,
      "roll_m": null,
      "weight_kg": null,
      "weight_g": null,
      "volume_ml": null,
      "pieces": null,
      "pack_format": "string or null",
      "supplier_pack_qty": null,
      "supplier_pack_uom": "string or null",
      "supplier_pack_note": "string or null",
      "material": "string or null",
      "finish": "string or null",
      "coverage_m2": null,
      "sort_order": null,
      "source_page_number": "integer or null",
      "extraction_confidence": 0.0,
      "parser_notes": []
    }}
  ],
  "system_components": [
    {{
      "staged_system_match": {{"system_name": "string", "product_code": "string or null"}},
      "component_match": {{"sku": "string or null", "name": "string"}},
      "role": "string — e.g. required, optional, component, or a specific role like external_corner",
      "notes": "string or null",
      "sort_order": null,
      "extraction_confidence": 0.0
    }}
  ],
  "warnings": [],
  "ignored_content_notes": []
}}"""

STAGE2_HINTS_SECTION = "Manufacturer hints:\n{hints_text}"
STAGE2_SYSTEM_CONTEXT_SECTION = "Known systems already extracted (for linking components):\n{system_context}"


# ============================================================
# Structured-output JSON schemas (Claude models that support
# output_config.format — see claude-api skill § Structured Outputs)
# ============================================================

def _obj(properties):
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties.keys()),
        "additionalProperties": False,
    }


_STR = {"type": "string"}
_STR_N = {"type": ["string", "null"]}
_BOOL_N = {"type": ["boolean", "null"]}
_NUM_N = {"type": ["number", "null"]}
_INT_N = {"type": ["integer", "null"]}
_NULL = {"type": "null"}
_NOTES = {"type": "array", "items": {"type": "string"}}
_STR_ARR = {"type": "array", "items": {"type": "string"}}

_SYSTEM_MATCH = _obj({"system_name": _STR, "product_code": _STR_N})
_COMPONENT_MATCH = _obj({"sku": _STR_N, "name": _STR})

_SYSTEM_ITEM = _obj({
    "name": _STR,
    "product_code": _STR_N,
    "category": _STR,
    "subcategory": _STR_N,
    "description": _STR_N,
    "bal_rating": _STR_N,
    "acoustic_rating": _STR_N,
    "moisture_resistant": _BOOL_N,
    "structural_grade": _STR_N,
    "double_sided": _BOOL_N,
    "install_guide_urls": _NULL,
    "tech_data_url": _NULL,
    "notes": _STR_N,
    "australian_made": _BOOL_N,
    "source_page_number": _INT_N,
    "extraction_confidence": {"type": "number"},
    "parser_notes": _NOTES,
})

_PROFILE_ITEM = _obj({
    "system_match": _SYSTEM_MATCH,
    "name": _STR,
    "profile_name": _STR,
    "product_code": _STR_N,
    "dimensions": _STR,
    "length_mm": _NUM_N, "width_mm": _NUM_N, "height_mm": _NUM_N,
    "thickness_mm": _NUM_N, "depth_mm": _NUM_N, "gauge_mm": _NUM_N,
    "diameter_mm": _NUM_N, "roll_m": _NUM_N, "length_m": _NUM_N,
    "weight_kg": _NUM_N, "weight_g": _NUM_N, "volume_ml": _NUM_N, "pieces": _NUM_N,
    "uom": _STR,
    "pack_format": _STR_N,
    "supplier_pack_qty": _NUM_N,
    "supplier_pack_uom": _STR_N,
    "supplier_pack_note": _STR_N,
    "bal_rating": _STR_N,
    "sheet_format": _STR_N,
    "sort_order": _NUM_N,
    "source_page_number": _INT_N,
    "extraction_confidence": {"type": "number"},
    "parser_notes": _NOTES,
})

_COLOUR_ITEM = _obj({
    "system_match": _SYSTEM_MATCH,
    "colour_name": _STR,
    "sku": _STR_N,
    "sku_suffix": _STR_N,
    "is_stocked": _BOOL_N,
    "sort_order": _NUM_N,
})

STAGE1_JSON_SCHEMA = _obj({
    "systems": {"type": "array", "items": _SYSTEM_ITEM},
    "system_profiles": {"type": "array", "items": _PROFILE_ITEM},
    "system_colours": {"type": "array", "items": _COLOUR_ITEM},
    "warnings": _STR_ARR,
    "ignored_content_notes": _STR_ARR,
})

_COMPONENT_ITEM = _obj({
    "sku": _STR_N,
    "name": _STR,
    "description": _STR_N,
    "category": _STR,
    "uom": _STR,
    "length_mm": _NUM_N, "width_mm": _NUM_N, "height_mm": _NUM_N,
    "thickness_mm": _NUM_N, "depth_mm": _NUM_N, "gauge_mm": _NUM_N,
    "diameter_mm": _NUM_N, "roll_m": _NUM_N,
    "weight_kg": _NUM_N, "weight_g": _NUM_N, "volume_ml": _NUM_N, "pieces": _NUM_N,
    "pack_format": _STR_N,
    "supplier_pack_qty": _NUM_N,
    "supplier_pack_uom": _STR_N,
    "supplier_pack_note": _STR_N,
    "material": _STR_N,
    "finish": _STR_N,
    "coverage_m2": _NUM_N,
    "sort_order": _NUM_N,
    "source_page_number": _INT_N,
    "extraction_confidence": {"type": "number"},
    "parser_notes": _NOTES,
})

_LINK_ITEM = _obj({
    "staged_system_match": _SYSTEM_MATCH,
    "component_match": _COMPONENT_MATCH,
    "role": _STR,
    "notes": _STR_N,
    "sort_order": _NUM_N,
    "extraction_confidence": {"type": "number"},
})

STAGE2_JSON_SCHEMA = _obj({
    "components": {"type": "array", "items": _COMPONENT_ITEM},
    "system_components": {"type": "array", "items": _LINK_ITEM},
    "warnings": _STR_ARR,
    "ignored_content_notes": _STR_ARR,
})


# ============================================================
# Field allowlists (strip unknown fields before RPC)
# ============================================================

SYSTEM_FIELDS = {
    "manufacturer_id", "source_document_id", "source_chunk_id",
    "name", "product_code", "slug", "category", "subcategory", "description",
    "bal_rating", "acoustic_rating", "moisture_resistant", "structural_grade",
    "double_sided", "sheet_format", "install_guide_urls", "tech_data_url",
    "australian_made", "notes", "sort_order", "extraction_confidence", "parser_notes",
}
PROFILE_FIELDS = {
    "name", "profile_name", "product_code", "dimensions",
    "length_m", "length_mm", "width_mm", "height_mm", "thickness_mm",
    "depth_mm", "gauge_mm", "diameter_mm", "roll_m",
    "weight_kg", "weight_g", "volume_ml", "pieces",
    "pack_format", "supplier_pack_qty", "supplier_pack_uom", "supplier_pack_note",
    "bal_rating", "uom", "sheet_format", "sort_order", "parser_notes",
}
COLOUR_FIELDS = {
    "colour_name", "sku", "sku_suffix", "is_stocked", "sort_order",
}
COMPONENT_FIELDS = {
    "manufacturer_id", "source_document_id", "source_chunk_id",
    "sku", "name", "description", "category", "uom",
    "length_mm", "width_mm", "height_mm", "thickness_mm", "depth_mm",
    "gauge_mm", "diameter_mm", "roll_m", "weight_kg", "weight_g",
    "volume_ml", "pieces", "pack_format", "supplier_pack_qty",
    "supplier_pack_uom", "supplier_pack_note",
    "material", "finish", "colour", "profile", "texture", "coverage_m2",
    "sort_order", "extraction_confidence", "parser_notes",
}
LINK_FIELDS = {
    "role", "notes", "sort_order", "extraction_confidence",
}


# ============================================================
# Helpers
# ============================================================

def load_env(production=False):
    try:
        from dotenv import dotenv_values
        repo_root = Path(__file__).parent.parent.parent
        env_file = repo_root / ".env.local"
        if not env_file.exists():
            env_file = Path(".env.local")
        for k, v in dotenv_values(str(env_file)).items():
            if v is not None:
                os.environ[k] = v  # always override so empty env vars don't block
    except ImportError:
        pass
    if production:
        supabase_url = os.environ.get("PRODUCTION_SUPABASE_URL")
        service_key = os.environ.get("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY")
    else:
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    return (
        os.environ.get("ANTHROPIC_API_KEY"),
        os.environ.get("OPENAI_API_KEY"),
        supabase_url,
        service_key,
    )


def split_into_chunks(md_text):
    """Split output.md into sections by <!-- chunk N: pages X-Y --> markers."""
    pattern = r'<!--\s*chunk\s+(\d+):\s*pages\s+(\d+)-(\d+)\s*-->'
    parts = re.split(pattern, md_text)
    chunks = []
    i = 1
    while i + 3 < len(parts):
        chunks.append({
            "chunk_no": int(parts[i]),
            "page_start": int(parts[i + 1]),
            "page_end": int(parts[i + 2]),
            "text": parts[i + 3].strip(),
        })
        i += 4
    return chunks


def build_system_blocks(base_prompt, hints_text=None, extra_text=None):
    """System-prompt content blocks for the Anthropic path, with prompt
    caching on the last (largest, most stable) block. Hints and any extra
    static context (e.g. stage 2's known-systems list) are appended as
    additional blocks so the whole prefix — not just the base prompt —
    gets cached and reused across every chunk in the run."""
    blocks = [{"type": "text", "text": base_prompt}]
    if hints_text:
        blocks.append({"type": "text", "text": STAGE1_HINTS_SECTION.format(hints_text=hints_text)})
    if extra_text:
        blocks.append({"type": "text", "text": extra_text})
    blocks[-1] = {**blocks[-1], "cache_control": {"type": "ephemeral"}}
    return blocks


# ============================================================
# Legacy (OpenAI-only) prompt assembly — inlines hints/context since
# OpenAI has neither prompt caching nor structured outputs here.
# ============================================================

_LEGACY_JSON_ONLY_NOTE = "\n\nReturn JSON only. No markdown. No prose. No text before or after the JSON."


def legacy_stage1_user_prompt(chunk, manufacturer_name, hints_text):
    base = STAGE1_USER_TEMPLATE.format(
        manufacturer_name=manufacturer_name,
        page_start=chunk["page_start"],
        page_end=chunk["page_end"],
        chunk_text=chunk["text"],
    )
    if hints_text:
        hints_section = STAGE1_HINTS_SECTION.format(hints_text=hints_text)
        base = base.replace("---\n\nExtract", f"---\n{hints_section}\n\nExtract")
    return base + _LEGACY_JSON_ONLY_NOTE


def legacy_stage2_user_prompt(chunk, manufacturer_name, hints_text, system_context):
    base = STAGE2_USER_TEMPLATE.format(
        manufacturer_name=manufacturer_name,
        page_start=chunk["page_start"],
        page_end=chunk["page_end"],
        chunk_text=chunk["text"],
    )
    prefix_parts = [STAGE2_SYSTEM_CONTEXT_SECTION.format(system_context=json.dumps(system_context, indent=2))]
    if hints_text:
        prefix_parts.append(STAGE2_HINTS_SECTION.format(hints_text=hints_text))
    prefix = "\n\n".join(prefix_parts)
    return base.replace("---\n\nExtract", f"---\n{prefix}\n\nExtract") + _LEGACY_JSON_ONLY_NOTE


# ============================================================
# Anthropic prompt assembly (interactive + batch) — chunk text only;
# hints and system context live in the cached system blocks.
# ============================================================

def stage1_user_prompt(chunk, manufacturer_name):
    return STAGE1_USER_TEMPLATE.format(
        manufacturer_name=manufacturer_name,
        page_start=chunk["page_start"],
        page_end=chunk["page_end"],
        chunk_text=chunk["text"],
    )


def stage2_user_prompt(chunk, manufacturer_name):
    return STAGE2_USER_TEMPLATE.format(
        manufacturer_name=manufacturer_name,
        page_start=chunk["page_start"],
        page_end=chunk["page_end"],
        chunk_text=chunk["text"],
    )


# ============================================================
# Interactive (non-batch) API calls
# ============================================================

def call_claude_interactive(client, system, user_prompt, schema, label="", max_retries=3, inter_call_delay=0):
    """Anthropic path: structured outputs guarantee schema-valid JSON, so
    there's no markdown-fence stripping or invalid-JSON retry loop — a
    non-refusal, non-max_tokens response is valid JSON by construction."""
    delay = 30

    for attempt in range(1, max_retries + 1):
        try:
            response = client.messages.create(
                model=getattr(client, "_model", "claude-sonnet-5"),
                max_tokens=16000,
                system=system,
                messages=[{"role": "user", "content": user_prompt}],
                output_config={"format": {"type": "json_schema", "schema": schema}},
            )
        except Exception as e:
            err_str = str(e)
            is_rate_limit = "429" in err_str or "rate_limit" in err_str.lower() or "rate limit" in err_str.lower()
            is_credit_error = "credit" in err_str.lower() or "billing" in err_str.lower() or "balance" in err_str.lower()
            if is_credit_error:
                print(f"    [FATAL] API credit/billing error — aborting parser run: {e}")
                sys.exit("[FATAL] Insufficient API credits. Top up your Anthropic account or use --openai-model to switch provider.")
            if is_rate_limit and attempt < max_retries:
                print(f"    [RATE LIMIT] {label} attempt {attempt} — waiting {delay}s before retry...")
                time.sleep(delay)
                continue
            print(f"    [ERROR] API error ({label}): {e}")
            return None

        cache_read = getattr(response.usage, "cache_read_input_tokens", 0) or 0
        cache_write = getattr(response.usage, "cache_creation_input_tokens", 0) or 0
        print(f"    [tokens] stop_reason={response.stop_reason} output_tokens={response.usage.output_tokens} "
              f"cache_read={cache_read} cache_write={cache_write}")

        if response.stop_reason == "refusal":
            print(f"    [ERROR] {label}: model refused (stop_details={getattr(response, 'stop_details', None)})")
            return None
        if response.stop_reason == "max_tokens":
            print(f"    [WARN] {label}: hit max_tokens — output may be truncated")

        raw = next((b.text for b in response.content if b.type == "text"), "")
        try:
            result = json.loads(raw)
            if inter_call_delay > 0:
                time.sleep(inter_call_delay)
            return result
        except json.JSONDecodeError as e:
            # Should not happen under output_config.format, but structured
            # outputs can still be truncated at max_tokens — treat as retryable.
            print(f"    [WARN] Unexpected invalid JSON ({label}) attempt {attempt}/{max_retries}: {e}")
            if attempt < max_retries:
                time.sleep(5)
                continue
            return None

    return None


def call_openai_legacy(client, system_prompt, user_prompt, label="", max_retries=3, inter_call_delay=0):
    """OpenAI fallback path — no structured outputs / no caching here, so
    keep the original markdown-fence-stripping + invalid-JSON retry loop."""
    for attempt in range(1, max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=client._model,
                max_completion_tokens=16000,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            raw = response.choices[0].message.content or ""
            stop_reason = response.choices[0].finish_reason
            output_tokens = response.usage.completion_tokens if response.usage else "?"
        except Exception as e:
            err_str = str(e)
            is_rate_limit = "429" in err_str or "rate_limit" in err_str.lower() or "rate limit" in err_str.lower()
            is_credit_error = "credit" in err_str.lower() or "billing" in err_str.lower() or "balance" in err_str.lower()
            if is_credit_error:
                print(f"    [FATAL] API credit/billing error — aborting parser run: {e}")
                sys.exit("[FATAL] Insufficient API credits.")
            if is_rate_limit and attempt < max_retries:
                print(f"    [RATE LIMIT] {label} attempt {attempt} — waiting 30s before retry...")
                time.sleep(30)
                continue
            print(f"    [ERROR] API error ({label}): {e}")
            return None

        raw = raw.strip()
        raw = re.sub(r'^```(?:json)?\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)
        print(f"    [tokens] stop_reason={stop_reason} output_tokens={output_tokens}")

        try:
            result = json.loads(raw)
            if inter_call_delay > 0:
                time.sleep(inter_call_delay)
            return result
        except json.JSONDecodeError as e:
            print(f"    [WARN] Invalid JSON ({label}) attempt {attempt}/{max_retries}: {e}")
            print(f"    Raw (last 500): ...{raw[-500:]}")
            if attempt < max_retries:
                time.sleep(5)
                continue
            return None

    return None


# ============================================================
# Message Batches API (default Anthropic path)
# ============================================================

def submit_batch(client, requests):
    batch = client.messages.batches.create(requests=requests)
    print(f"  [batch] submitted {batch.id} ({len(requests)} requests)")
    return batch


def poll_batch(client, batch_id, reporter, stage_label, poll_interval=20):
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        counts = batch.request_counts
        log_line = (f"{stage_label} batch {batch_id}: {batch.processing_status} "
                    f"(processing={counts.processing} succeeded={counts.succeeded} "
                    f"errored={counts.errored} canceled={counts.canceled} expired={counts.expired})")
        print(f"  [batch] {log_line}")
        reporter.progress(
            {
                "currentStage": stage_label,
                "batchId": batch_id,
                "batchStatus": batch.processing_status,
                "processing": counts.processing,
                "succeeded": counts.succeeded,
                "errored": counts.errored,
            },
            log_line=log_line,
        )
        if batch.processing_status == "ended":
            return batch
        time.sleep(poll_interval)


def collect_batch_results(client, batch_id, chunks, manifest, stage_label):
    """Returns {chunk_no: parsed_json_or_None}. Results arrive in any order —
    always key by custom_id, never by position."""
    by_custom_id = {}
    for result in client.messages.batches.results(batch_id):
        by_custom_id[result.custom_id] = result

    parsed = {}
    for chunk in chunks:
        custom_id = f"chunk_{chunk['chunk_no']}"
        result = by_custom_id.get(custom_id)
        status = "failed"
        data = None
        if result is None:
            print(f"    [ERROR] {stage_label} chunk {chunk['chunk_no']}: missing from batch results")
        elif result.result.type == "succeeded":
            msg = result.result.message
            if msg.stop_reason == "refusal":
                print(f"    [ERROR] {stage_label} chunk {chunk['chunk_no']}: model refused")
            else:
                text = next((b.text for b in msg.content if b.type == "text"), "")
                try:
                    data = json.loads(text)
                    status = "ok"
                except json.JSONDecodeError as e:
                    print(f"    [ERROR] {stage_label} chunk {chunk['chunk_no']}: invalid JSON despite structured output: {e}")
        else:
            print(f"    [ERROR] {stage_label} chunk {chunk['chunk_no']}: batch result '{result.result.type}'")

        manifest.append({
            "stage": stage_label, "chunk_no": chunk["chunk_no"],
            "pages": f"{chunk['page_start']}-{chunk['page_end']}",
            "status": status,
        })
        parsed[chunk["chunk_no"]] = data

    return parsed


def run_stage1_batch(client, chunks, manufacturer_name, system, reporter, manifest):
    requests = [
        {
            "custom_id": f"chunk_{chunk['chunk_no']}",
            "params": {
                "model": getattr(client, "_model", "claude-sonnet-5"),
                "max_tokens": 16000,
                "system": system,
                "messages": [{"role": "user", "content": stage1_user_prompt(chunk, manufacturer_name)}],
                "output_config": {"format": {"type": "json_schema", "schema": STAGE1_JSON_SCHEMA}},
            },
        }
        for chunk in chunks
    ]
    batch = submit_batch(client, requests)
    poll_batch(client, batch.id, reporter, "stage1")
    return collect_batch_results(client, batch.id, chunks, manifest, "stage1")


def run_stage2_batch(client, chunks, manufacturer_name, system, reporter, manifest):
    requests = [
        {
            "custom_id": f"chunk_{chunk['chunk_no']}",
            "params": {
                "model": getattr(client, "_model", "claude-sonnet-5"),
                "max_tokens": 16000,
                "system": system,
                "messages": [{"role": "user", "content": stage2_user_prompt(chunk, manufacturer_name)}],
                "output_config": {"format": {"type": "json_schema", "schema": STAGE2_JSON_SCHEMA}},
            },
        }
        for chunk in chunks
    ]
    batch = submit_batch(client, requests)
    poll_batch(client, batch.id, reporter, "stage2")
    return collect_batch_results(client, batch.id, chunks, manifest, "stage2")


# ============================================================
# Result assembly (shared by interactive + batch paths)
# ============================================================

def assemble_stage1(chunk, result):
    if not result:
        print(f"    [ERROR] stage1 chunk {chunk['chunk_no']} produced no usable output — recorded in run manifest")
        return [], [], []

    systems = result.get("systems") or []
    profiles = result.get("system_profiles") or []
    colours = result.get("system_colours") or []

    for item in systems:
        item["_chunk_no"] = chunk["chunk_no"]
        item["_page_start"] = chunk["page_start"]
    for item in profiles:
        item["_chunk_no"] = chunk["chunk_no"]

    print(f"    -> chunk {chunk['chunk_no']}: {len(systems)} systems, {len(profiles)} profiles, {len(colours)} colours")
    if result.get("warnings"):
        for w in result["warnings"]:
            print(f"    [WARN] {w}")
    return systems, profiles, colours


def assemble_stage2(chunk, result):
    if not result:
        print(f"    [ERROR] stage2 chunk {chunk['chunk_no']} produced no usable output — recorded in run manifest")
        return [], []

    components = result.get("components") or []
    links = result.get("system_components") or []

    for item in components:
        item["_chunk_no"] = chunk["chunk_no"]

    print(f"    -> chunk {chunk['chunk_no']}: {len(components)} components, {len(links)} links")
    if result.get("warnings"):
        for w in result["warnings"]:
            print(f"    [WARN] {w}")
    return components, links


# ============================================================
# System-name resolution
# ============================================================

def normalize_system_name(name):
    """Normalize name for deduplication AND for match resolution — the
    single normalizer used everywhere a system name needs comparing so the
    two paths can't silently drift apart (2026-07-18 audit finding: dedup
    used NFKC+™-collapse, temp-key resolution used bare lower().strip())."""
    import unicodedata
    name = unicodedata.normalize("NFKC", name or "")
    name = re.sub(r'\s+', ' ', name).strip().lower()
    # Normalize trademark symbols and spacing around them
    name = re.sub(r'\s*[™®]\s*', '™', name)
    return name


def resolve_system_key(match_obj, name_map, code_map):
    """Exact match only — product_code first, then normalized name. No
    fuzzy/substring fallback: a system called "Stria Cladding" and one
    called "Stria Cladding Fine Texture" must never be conflated just
    because one name contains the other. Callers that get None back should
    treat the row as unresolved, not guess."""
    if not match_obj:
        return None
    code = (match_obj.get("product_code") or "").strip()
    if code and code in code_map:
        return code_map[code]
    name = normalize_system_name(match_obj.get("system_name") or match_obj.get("name") or "")
    if name and name in name_map:
        return name_map[name]
    return None


def find_near_miss_candidates(match_obj, norm_to_display):
    """For diagnostics only (never used to auto-link): system names whose
    normalized form is a substring match against the unresolved match name.
    Surfaced as a qa_flag in the QA report instead of silently guessing."""
    name = normalize_system_name(match_obj.get("system_name") or match_obj.get("name") or "")
    if not name:
        return []
    return sorted({
        display for norm, display in norm_to_display.items()
        if norm != name and (norm in name or name in norm)
    })


def assign_temp_keys(all_systems, all_profiles, all_colours, all_components, all_links):
    # Systems
    name_map, code_map, norm_to_display = {}, {}, {}
    for i, s in enumerate(all_systems):
        key = f"system_{i}"
        s["_temp_key"] = key
        n = normalize_system_name(s.get("name") or "")
        c = (s.get("product_code") or "").strip()
        if n:
            name_map[n] = key
            norm_to_display[n] = s.get("name")
        if c:
            code_map[c] = key

    unresolved_diagnostics = []

    def note_unresolved(kind, match_obj, label):
        if not match_obj:
            return
        near = find_near_miss_candidates(match_obj, norm_to_display)
        unmatched_name = (match_obj.get("system_name") or match_obj.get("name") or "").strip()
        if not unmatched_name:
            return
        if near:
            unresolved_diagnostics.append({
                "severity": "medium",
                "type": f"{kind}_system_match_ambiguous",
                "label": label,
                "unmatched_system_name": unmatched_name,
                "near_miss_candidates": near,
                "detail": (f"{kind} '{label}' referenced system '{unmatched_name}', which did not exactly "
                           f"match any extracted system. Possible candidates (not auto-linked — needs human "
                           f"review): {near}"),
            })

    # Profiles
    skipped_profiles = 0
    for i, p in enumerate(all_profiles):
        p["_temp_key"] = f"profile_{i}"
        match = p.pop("system_match", None) or p.pop("staged_system_match", None) or {}
        key = resolve_system_key(match, name_map, code_map)
        if key:
            p["_staged_system_temp_key"] = key
        else:
            skipped_profiles += 1
            note_unresolved("profile", match, p.get("profile_name") or p.get("name") or f"profile_{i}")

    # Colours
    skipped_colours = 0
    for i, c in enumerate(all_colours):
        c["_temp_key"] = f"colour_{i}"
        match = c.pop("system_match", None) or c.pop("staged_system_match", None) or {}
        key = resolve_system_key(match, name_map, code_map)
        if key:
            c["_staged_system_temp_key"] = key
        else:
            skipped_colours += 1
            note_unresolved("colour", match, c.get("colour_name") or f"colour_{i}")

    # Components
    comp_name_map, comp_sku_map = {}, {}
    for i, c in enumerate(all_components):
        key = f"component_{i}"
        c["_temp_key"] = key
        n = (c.get("name") or "").lower().strip()
        s = (c.get("sku") or "").strip()
        if n:
            comp_name_map[n] = key
        if s:
            comp_sku_map[s] = key

    # Links
    skipped_links = 0
    for i, lnk in enumerate(all_links):
        lnk["_temp_key"] = f"link_{i}"
        sys_match = lnk.pop("staged_system_match", None) or lnk.pop("system_match", None) or {}
        comp_match = lnk.pop("component_match", None) or {}
        sys_key = resolve_system_key(sys_match, name_map, code_map)
        comp_sku = (comp_match.get("sku") or "").strip()
        comp_name = (comp_match.get("name") or "").lower().strip()
        comp_key = comp_sku_map.get(comp_sku) or comp_name_map.get(comp_name)
        if sys_key and comp_key:
            lnk["_staged_system_temp_key"] = sys_key
            lnk["_staged_component_temp_key"] = comp_key
        else:
            skipped_links += 1
            if not sys_key:
                note_unresolved("link", sys_match, comp_match.get("name") or f"link_{i}")

    if skipped_profiles:
        print(f"  [WARN] {skipped_profiles} profiles dropped — could not match to a system")
    if skipped_colours:
        print(f"  [WARN] {skipped_colours} colours dropped — could not match to a system")
    if skipped_links:
        print(f"  [WARN] {skipped_links} component links dropped — unresolved FK")
    if unresolved_diagnostics:
        print(f"  [WARN] {len(unresolved_diagnostics)} unresolved match(es) had near-miss candidates — see QA report")

    valid_profiles = [p for p in all_profiles if "_staged_system_temp_key" in p]
    valid_colours = [c for c in all_colours if "_staged_system_temp_key" in c]
    valid_links = [lnk for lnk in all_links if "_staged_system_temp_key" in lnk and "_staged_component_temp_key" in lnk]

    return all_systems, valid_profiles, valid_colours, all_components, valid_links, unresolved_diagnostics


def deduplicate_systems(all_systems, all_profiles):
    """
    Merge duplicate systems (same normalised name) by keeping the one with
    the most profiles — typically the one extracted from the actual spec pages,
    not from the TOC.  Profile _staged_system_temp_key refs are NOT assigned
    yet, so we track by list position / _chunk_no instead.
    """
    seen = {}  # norm_name -> index in all_systems
    kept = []
    dropped_keys = set()

    for s in all_systems:
        norm = normalize_system_name(s.get("name", ""))
        if norm not in seen:
            seen[norm] = len(kept)
            kept.append(s)
        else:
            existing = kept[seen[norm]]
            existing_conf = existing.get("extraction_confidence") or 0
            new_conf = s.get("extraction_confidence") or 0
            existing_chunk = existing.get("_chunk_no", 0)
            new_chunk = s.get("_chunk_no", 0)
            if new_conf > existing_conf or (new_conf == existing_conf and new_chunk > existing_chunk):
                dropped_keys.add(id(existing))
                kept[seen[norm]] = s
            else:
                dropped_keys.add(id(s))

    final = [s for s in kept if id(s) not in dropped_keys]
    dropped_count = len(all_systems) - len(final)
    if dropped_count:
        print(f"  [dedup] Removed {dropped_count} duplicate system(s) (TOC stubs or lower-confidence repeats)")
    return final


def run_qa_checks(all_systems, all_profiles):
    """Deterministic cross-check run once over the FULL assembled plan, after
    every chunk has been extracted and system links resolved, but before the
    Supabase write.

    Each chunk is extracted by its own isolated Claude call with no visibility
    into any other chunk — so a single-call hallucination (e.g. misreading a
    dimension table and inventing a different product code) can't be caught by
    the model itself, no matter how good the prompt is. This catches that class
    of error structurally instead of trusting another LLM call to police it —
    an LLM reviewing LLM output has the same blind spot.
    """
    system_by_key = {s["_temp_key"]: s for s in all_systems}
    issues = []

    code_to_profiles = {}
    for p in all_profiles:
        code = (p.get("product_code") or "").strip()
        if code:
            code_to_profiles.setdefault(code, []).append(p)

    for code, profs in code_to_profiles.items():
        sys_names = sorted({
            system_by_key.get(p.get("_staged_system_temp_key"), {}).get("name")
            for p in profs
        } - {None})
        if len(sys_names) > 1:
            issues.append({
                "severity": "high",
                "type": "product_code_multi_system",
                "product_code": code,
                "systems": sys_names,
                "detail": f"product_code '{code}' extracted under {len(sys_names)} different systems: {sys_names}",
            })

    name_to_profiles = {}
    for p in all_profiles:
        name = (p.get("profile_name") or p.get("name") or "").strip().lower()
        if name:
            name_to_profiles.setdefault(name, []).append(p)

    for name, profs in name_to_profiles.items():
        if len(profs) < 2:
            continue
        dims = sorted({(p.get("dimensions") or "").strip() for p in profs} - {""})
        if len(dims) > 1:
            sys_names = sorted({
                system_by_key.get(p.get("_staged_system_temp_key"), {}).get("name")
                for p in profs
            } - {None})
            issues.append({
                "severity": "medium",
                "type": "profile_name_conflicting_dimensions",
                "profile_name": name,
                "dimensions_seen": dims,
                "systems": sys_names,
                "detail": f"profile '{name}' has conflicting dimensions across extractions {dims} (systems: {sys_names})",
            })

    return issues


def apply_qa_flags(all_profiles, issues):
    """Append each finding to the affected profile rows' parser_notes, so the
    flag surfaces per-row in Verify Systems at the normal human-review point
    instead of silently landing in staging."""
    flagged = 0
    for issue in issues:
        for p in all_profiles:
            code = (p.get("product_code") or "").strip()
            name = (p.get("profile_name") or p.get("name") or "").strip().lower()
            matches = (
                (issue["type"] == "product_code_multi_system" and code == issue["product_code"])
                or (issue["type"] == "profile_name_conflicting_dimensions" and name == issue["profile_name"])
            )
            if not matches:
                continue
            notes = p.setdefault("parser_notes", [])
            if isinstance(notes, list):
                notes.append({
                    "qa_flag": issue["type"],
                    "severity": issue["severity"],
                    "detail": issue["detail"],
                    "source": "qa_review",
                    "needs_human_review": True,
                })
                flagged += 1
    return flagged


# ============================================================
# Grounding checks — deterministic, non-LLM cross-checks against the raw
# source chunk text. Catches the class of error an LLM can't reliably catch
# reviewing its own (or another chunk's) output: a hallucinated product code
# that never appears anywhere in the source (the US71/US92 class from the
# 2026-07-18 audit), a dimension field that doesn't match the raw dimensions
# string it claims to summarize, an invented unit of measure, or a numeric
# value outside any plausible range for that field. Never blocks a run —
# every finding is a parser_notes.qa_flag for human review, same mechanism
# as run_qa_checks/apply_qa_flags above.
# ============================================================

UOM_ALLOWLIST = {
    "each", "ea", "pack", "box", "carton", "bag", "bundle", "set", "pair",
    "roll", "length", "lm", "linear metre", "linear m",
    "sheet", "board", "panel", "m", "mm", "m2", "sqm",
    "kg", "g", "l", "ml", "tube", "unit", "piece", "pieces", "no",
}

# (min, max) plausible range in the field's own unit — wide enough to never
# flag a real construction product, tight enough to catch garbage like a
# decimal point dropped or a page number captured as a dimension.
NUMERIC_RANGE_FIELDS = {
    "length_mm": (1, 20000), "width_mm": (1, 6000), "height_mm": (1, 6000),
    "thickness_mm": (0.1, 500), "depth_mm": (0.1, 2000), "gauge_mm": (0.01, 50),
    "diameter_mm": (0.1, 2000), "roll_m": (0.01, 500), "length_m": (0.001, 500),
    "weight_kg": (0.001, 5000), "weight_g": (0.001, 500000), "volume_ml": (0.001, 1000000),
    "pieces": (1, 100000), "supplier_pack_qty": (1, 100000), "coverage_m2": (0.001, 10000),
}

DIMENSION_STRING_FIELDS = [
    "length_mm", "width_mm", "height_mm", "thickness_mm", "depth_mm",
    "gauge_mm", "diameter_mm", "roll_m", "length_m",
]

_NUM_RE = re.compile(r'\d+(?:\.\d+)?')


def _numbers_in_text(text):
    return [float(m) for m in _NUM_RE.findall(text or "")]


def _value_near_any(value, candidates, tol=0.51):
    return any(abs(value - c) <= tol for c in candidates)


def run_grounding_checks(all_systems, all_profiles, all_components, chunks):
    """Ground every extracted product_code/uom/dimension against the chunk
    text it was actually extracted from. Flags land directly on the row's
    parser_notes (mutates in place) and are also returned so callers can
    print/persist them alongside run_qa_checks' cross-check issues."""
    chunk_text_by_no = {c["chunk_no"]: c["text"] for c in chunks}
    issues = []

    def flag(row, issue_type, severity, detail):
        notes = row.setdefault("parser_notes", [])
        if isinstance(notes, list):
            notes.append({
                "qa_flag": issue_type,
                "severity": severity,
                "detail": detail,
                "source": "grounding_check",
                "needs_human_review": True,
            })
        issues.append({"severity": severity, "type": issue_type, "detail": detail})

    def check_row(row, label, check_dimensions):
        chunk_text = chunk_text_by_no.get(row.get("_chunk_no"))

        # Components use "sku" for the same join-key concept profiles/systems
        # call "product_code" — ground whichever one the row actually has.
        code_field = "product_code" if "product_code" in row else "sku"
        code = (row.get(code_field) or "").strip()
        if code and chunk_text is not None and code not in chunk_text:
            flag(row, "product_code_not_in_source", "high",
                 f"{label}: {code_field} '{code}' does not literally appear in its own source chunk "
                 f"(chunk {row.get('_chunk_no')}) — likely hallucinated or misattributed.")

        uom = (row.get("uom") or "").strip().lower()
        if uom and uom not in UOM_ALLOWLIST:
            flag(row, "uom_not_recognised", "low",
                 f"{label}: uom '{uom}' is not in the known unit vocabulary — verify it's a real unit, not a typo/invention.")

        if check_dimensions:
            dims_text = row.get("dimensions") or ""
            dims_numbers = _numbers_in_text(dims_text) if dims_text else None
            for field in DIMENSION_STRING_FIELDS:
                value = row.get(field)
                if value is None or dims_numbers is None:
                    continue
                try:
                    value = float(value)
                except (TypeError, ValueError):
                    continue
                if not _value_near_any(value, dims_numbers):
                    flag(row, "dimension_not_in_source_string", "medium",
                         f"{label}: {field}={value} does not appear in the raw dimensions text '{dims_text}' "
                         f"— possible transcription error.")

        for field, (lo, hi) in NUMERIC_RANGE_FIELDS.items():
            value = row.get(field)
            if value is None:
                continue
            try:
                value = float(value)
            except (TypeError, ValueError):
                continue
            if not (lo <= value <= hi):
                flag(row, "numeric_implausible", "medium",
                     f"{label}: {field}={value} is outside the plausible range [{lo}, {hi}] for this field.")

    for s in all_systems:
        check_row(s, s.get("name") or "system", check_dimensions=False)
    for p in all_profiles:
        check_row(p, p.get("profile_name") or p.get("name") or "profile", check_dimensions=True)
    for c in all_components:
        check_row(c, c.get("name") or c.get("sku") or "component", check_dimensions=False)

    return issues


_TM_STRIP = re.compile(r'[™®]')
NAME_FIELDS = {"name", "profile_name", "colour_name", "description"}

def strip_trademarks(rec):
    """Strip ™ and ® from all name/description string fields in a record."""
    for k in NAME_FIELDS:
        if k in rec and isinstance(rec[k], str):
            rec[k] = _TM_STRIP.sub('', rec[k]).strip()
    return rec


def clean_record(rec, allowed_fields):
    """Keep only allowed fields + temp key fields, and strip trademarks from names."""
    temp_keys = {"_temp_key", "_staged_system_temp_key", "_staged_component_temp_key"}
    out = {k: v for k, v in rec.items() if k in temp_keys or k in allowed_fields}
    return strip_trademarks(out)


def build_plan(manufacturer_id, all_systems, all_profiles, all_colours, all_components, all_links):
    for s in all_systems:
        s["manufacturer_id"] = manufacturer_id
        s.setdefault("source_document_id", None)
        s.setdefault("source_chunk_id", None)
    for c in all_components:
        c["manufacturer_id"] = manufacturer_id
        c.setdefault("source_document_id", None)
        c.setdefault("source_chunk_id", None)

    return {
        "stagedSystems": [clean_record(s, SYSTEM_FIELDS) for s in all_systems],
        "stagedSystemProfiles": [clean_record(p, PROFILE_FIELDS) for p in all_profiles],
        "stagedSystemColours": [clean_record(c, COLOUR_FIELDS) for c in all_colours if c.get("colour_name")],
        "stagedComponents": [clean_record(c, COMPONENT_FIELDS) for c in all_components],
        "stagedSystemComponents": [clean_record(lnk, LINK_FIELDS) for lnk in all_links],
        "fieldVerifications": [],
        "parserFieldEvidence": [],
    }


def insert_stage2_direct(plan, supabase_url, service_key, dry_run_dir, ts):
    """Insert components + system-component links directly via REST (Stage 2 standalone only)."""
    import httpx
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    components = plan["stagedComponents"]
    resolved_links = plan.get("_resolvedLinks", [])

    def strip_temp(rec):
        return {k: v for k, v in rec.items() if not k.startswith("_")}

    inserted_components = []
    for comp in components:
        payload = strip_temp(comp)
        if not payload.get("sort_order"):
            payload["sort_order"] = 0
        resp = httpx.post(f"{supabase_url}/rest/v1/staged_components", json=payload, headers=headers, timeout=30)
        if resp.status_code not in (200, 201):
            print(f"[ERROR] Failed to insert component '{comp.get('name')}': {resp.status_code} {resp.text}")
            sys.exit(1)
        row = resp.json()
        inserted = row[0] if isinstance(row, list) else row
        inserted_components.append(inserted)
        print(f"  [insert] component: {inserted.get('name')} -> {inserted.get('id')}")

    comp_idx_to_id = {i: c["id"] for i, c in enumerate(inserted_components)}

    inserted_links = []
    for lnk in resolved_links:
        comp_id = comp_idx_to_id.get(lnk["_comp_idx"])
        if not comp_id:
            print(f"  [WARN] link skipped — could not find inserted component at index {lnk['_comp_idx']}")
            continue
        payload = {
            "staged_system_id": lnk["staged_system_id"],
            "staged_component_id": comp_id,
            "role": lnk.get("role"),
            "notes": lnk.get("notes"),
            "sort_order": lnk.get("sort_order") or 0,
            "extraction_confidence": lnk.get("extraction_confidence"),
        }
        resp = httpx.post(f"{supabase_url}/rest/v1/staged_system_components", json=payload, headers=headers, timeout=30)
        if resp.status_code not in (200, 201):
            print(f"[ERROR] Failed to insert link: {resp.status_code} {resp.text}")
            sys.exit(1)
        row = resp.json()
        inserted_links.append(row[0] if isinstance(row, list) else row)

    print(f"\n[parser] Inserted {len(inserted_components)} components, {len(inserted_links)} links")

    result = {"inserted_components": inserted_components, "inserted_links": inserted_links}
    dry_run_dir.mkdir(parents=True, exist_ok=True)
    result_path = dry_run_dir / f"rpc_result_{ts}.json"
    result_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[parser] Result written to: {result_path}")


def call_rpc(plan, supabase_url, service_key):
    import httpx
    url = f"{supabase_url}/rest/v1/rpc/insert_parser_output_plan_v1"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    resp = httpx.post(url, json={"plan": plan}, headers=headers, timeout=120)
    if resp.status_code != 200:
        print(f"[ERROR] RPC {resp.status_code}: {resp.text}")
        return None
    return resp.json()


# ============================================================
# Main
# ============================================================

# Module-level so the __main__ wrapper can report crashes that escape main().
REPORTER = None


def main():
    global REPORTER

    parser = argparse.ArgumentParser(description="AI parser: Docling markdown -> Supabase staging tables")
    parser.add_argument("--input", required=True, help="Path to output.md from Docling chunked extraction")
    parser.add_argument("--manufacturer-id", required=True, help="data_studio_manufacturers.id UUID")
    parser.add_argument("--manufacturer-name", required=True, help="Manufacturer display name")
    parser.add_argument("--hints", default=None, help="Path to manufacturer hints .md file")
    parser.add_argument("--dry-run", action="store_true", help="Write plan JSON locally, skip Supabase")
    parser.add_argument("--stage", choices=["1", "2", "both"], default="both")
    parser.add_argument("--openai-model", default=None, help="Use OpenAI instead of Anthropic (e.g. gpt-4.5-preview, gpt-4o)")
    parser.add_argument("--model", default="claude-sonnet-5", help="Anthropic model ID (ignored when --openai-model is set; must support structured outputs)")
    parser.add_argument("--interactive", action="store_true",
                         help="Use the old one-call-per-chunk loop with inter-call pacing instead of the "
                              "Message Batches API (always used automatically for --openai-model)")
    parser.add_argument("--from-plan", default=None, help="Skip extraction: insert a previously saved plan JSON (every run saves one to .local/parser-dry-run/plan_*.json before inserting)")
    parser.add_argument("--allow-partial", action="store_true", help="Proceed with the live insert even if some chunks failed extraction (they are recorded in the run manifest)")
    args = parser.parse_args()

    anthropic_key, openai_key, supabase_url, service_key = load_env()

    # ── Resume path: insert a previously saved plan, no extraction ──────────
    if args.from_plan:
        REPORTER = PipelineReporter.start(
            "parser",
            payload={"manufacturer_name": args.manufacturer_name, "from_plan": args.from_plan},
            manufacturer_id=args.manufacturer_id,
        )
        plan_file = Path(args.from_plan)
        if not plan_file.exists():
            sys.exit(f"[ERROR] Plan file not found: {plan_file}")
        plan = json.loads(plan_file.read_text(encoding="utf-8"))
        if "_resolvedLinks" in plan:
            sys.exit("[ERROR] This plan came from a --stage 2 standalone run (direct insert); --from-plan only supports full RPC plans")
        if not supabase_url or not service_key:
            sys.exit("[ERROR] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        print(f"[parser] Inserting saved plan {plan_file}:")
        for k in ("stagedSystems", "stagedSystemProfiles", "stagedSystemColours", "stagedComponents", "stagedSystemComponents"):
            print(f"  {k:<24}: {len(plan.get(k, []))}")
        result = call_rpc(plan, supabase_url, service_key)
        if not result:
            msg = f"RPC insert failed — plan still preserved at {plan_file}"
            REPORTER.fail(msg)
            sys.exit(f"[ERROR] {msg}")
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        result_path = Path(".local/parser-dry-run") / f"rpc_result_{ts}.json"
        result_path.parent.mkdir(parents=True, exist_ok=True)
        result_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[parser] RPC result: {json.dumps(result.get('inserted_counts', result), indent=2)}")
        REPORTER.done(result.get("inserted_counts", {}))
        return

    use_openai = bool(args.openai_model)
    use_batch = not use_openai and not args.interactive

    if use_openai:
        if not openai_key:
            sys.exit("[ERROR] OPENAI_API_KEY not set in .env.local or environment")
        from openai import OpenAI as _OpenAI
        client = _OpenAI(api_key=openai_key)
        client._provider = "openai"
        client._model = args.openai_model
        inter_call_delay = 3  # OpenAI has much higher rate limits
        print(f"[parser] Provider: OpenAI ({args.openai_model}) — interactive loop (no Batches API on this path)")
    else:
        if not anthropic_key:
            sys.exit("[ERROR] ANTHROPIC_API_KEY not set in .env.local or environment")
        import anthropic
        client = anthropic.Anthropic(api_key=anthropic_key)
        client._provider = "anthropic"
        client._model = args.model
        inter_call_delay = 0 if use_batch else 65  # batch pricing/rate-limits don't need pacing
        mode = "Message Batches" if use_batch else "interactive (--interactive)"
        print(f"[parser] Provider: Anthropic ({args.model}) — {mode}")

    if not args.dry_run and (not supabase_url or not service_key):
        sys.exit("[ERROR] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required (or use --dry-run)")

    # Every run (manual or worker-spawned) reports to pipeline_jobs so the
    # pipeline UI can show live progress and failures — see scripts/lib/pipeline_report.py.
    REPORTER = PipelineReporter.start(
        "parser",
        payload={
            "manufacturer_name": args.manufacturer_name,
            "input": str(args.input),
            "dry_run": args.dry_run,
            "stage": args.stage,
            "provider": "openai" if use_openai else "anthropic",
            "model": args.openai_model or args.model,
            "mode": "openai" if use_openai else ("batch" if use_batch else "interactive"),
        },
        manufacturer_id=args.manufacturer_id,
    )

    hints_text = ""
    if args.hints:
        hints_path = Path(args.hints)
        if hints_path.exists():
            hints_text = hints_path.read_text(encoding="utf-8")
            print(f"[parser] Loaded hints: {hints_path}")
        else:
            print(f"[parser] Hints file not found: {hints_path} — continuing without hints")

    md_text = Path(args.input).read_text(encoding="utf-8")
    chunks = split_into_chunks(md_text)
    print(f"[parser] {len(chunks)} chunks | manufacturer: {args.manufacturer_name}")

    # The 7-page chunk boundary is a Docling memory constraint, not a
    # semantic one — a spec table straddling it gets header+rows in chunk N
    # and headerless continuation rows in chunk N+1, which two isolated
    # Claude calls can't reassemble. Stitch those back together before either
    # chunk is sent for extraction. See table_stitcher.py.
    chunks = stitch_split_tables(chunks)

    all_systems, all_profiles, all_colours = [], [], []
    all_components, all_links = [], []
    run_manifest = []  # per-chunk ok/failed record — written to disk before any insert

    # Stage 1 — systems, profiles, colours
    if args.stage in ("1", "both"):
        print("\n[parser] === Stage 1: systems, profiles, colours ===")
        if use_openai:
            for idx, chunk in enumerate(chunks, 1):
                REPORTER.progress(
                    {"currentStage": "stage1", "chunk": idx, "totalChunks": len(chunks)},
                    log_line=f"stage1 chunk {idx}/{len(chunks)} (pages {chunk['page_start']}-{chunk['page_end']})",
                )
                print(f"  [stage1] chunk {chunk['chunk_no']} pages {chunk['page_start']}-{chunk['page_end']}")
                result = call_openai_legacy(
                    client, STAGE1_SYSTEM_PROMPT,
                    legacy_stage1_user_prompt(chunk, args.manufacturer_name, hints_text),
                    label=f"stage1-chunk{chunk['chunk_no']}", inter_call_delay=inter_call_delay,
                )
                run_manifest.append({"stage": "stage1", "chunk_no": chunk["chunk_no"],
                                      "pages": f"{chunk['page_start']}-{chunk['page_end']}",
                                      "status": "ok" if result else "failed"})
                s, p, c = assemble_stage1(chunk, result)
                all_systems.extend(s)
                all_profiles.extend(p)
                all_colours.extend(c)
        elif use_batch:
            system = build_system_blocks(STAGE1_SYSTEM_PROMPT, hints_text)
            results_by_chunk = run_stage1_batch(client, chunks, args.manufacturer_name, system, REPORTER, run_manifest)
            for chunk in chunks:
                s, p, c = assemble_stage1(chunk, results_by_chunk.get(chunk["chunk_no"]))
                all_systems.extend(s)
                all_profiles.extend(p)
                all_colours.extend(c)
        else:
            system = build_system_blocks(STAGE1_SYSTEM_PROMPT, hints_text)
            for idx, chunk in enumerate(chunks, 1):
                REPORTER.progress(
                    {"currentStage": "stage1", "chunk": idx, "totalChunks": len(chunks)},
                    log_line=f"stage1 chunk {idx}/{len(chunks)} (pages {chunk['page_start']}-{chunk['page_end']})",
                )
                print(f"  [stage1] chunk {chunk['chunk_no']} pages {chunk['page_start']}-{chunk['page_end']}")
                result = call_claude_interactive(
                    client, system, stage1_user_prompt(chunk, args.manufacturer_name), STAGE1_JSON_SCHEMA,
                    label=f"stage1-chunk{chunk['chunk_no']}", inter_call_delay=inter_call_delay,
                )
                run_manifest.append({"stage": "stage1", "chunk_no": chunk["chunk_no"],
                                      "pages": f"{chunk['page_start']}-{chunk['page_end']}",
                                      "status": "ok" if result else "failed"})
                s, p, c = assemble_stage1(chunk, result)
                all_systems.extend(s)
                all_profiles.extend(p)
                all_colours.extend(c)

        print(f"\n[parser] Stage 1 total: {len(all_systems)} systems, {len(all_profiles)} profiles, {len(all_colours)} colours")
        print("\n[parser] Deduplicating systems...")
        all_systems = deduplicate_systems(all_systems, all_profiles)
        print(f"[parser] {len(all_systems)} unique systems after dedup")

    # Stage 2 — components
    existing_systems_by_id = {}  # id -> {name, product_code} for standalone stage 2 direct insert
    if args.stage in ("2", "both"):
        system_context = [
            {"name": s.get("name"), "product_code": s.get("product_code")}
            for s in all_systems
        ]
        # When running --stage 2 standalone, fetch existing systems from Supabase
        # (with IDs) so the AI has context and so links can be resolved via real UUIDs.
        if not system_context and supabase_url and service_key:
            try:
                import urllib.request
                req_url = f"{supabase_url}/rest/v1/staged_systems?manufacturer_id=eq.{args.manufacturer_id}&select=id,name,product_code&limit=200"
                req = urllib.request.Request(req_url, headers={
                    "apikey": service_key,
                    "Authorization": f"Bearer {service_key}",
                })
                with urllib.request.urlopen(req) as resp:
                    fetched = json.loads(resp.read())
                system_context = [{"name": s["name"], "product_code": s.get("product_code")} for s in fetched]
                existing_systems_by_id = {s["id"]: s for s in fetched}
                print(f"[parser] Fetched {len(system_context)} existing systems from Supabase for stage 2 context")
            except Exception as e:
                print(f"[parser] Warning: could not fetch existing systems from Supabase: {e}")

        print(f"\n[parser] === Stage 2: components ({len(system_context)} known systems) ===")

        if use_openai:
            for idx, chunk in enumerate(chunks, 1):
                REPORTER.progress(
                    {"currentStage": "stage2", "chunk": idx, "totalChunks": len(chunks)},
                    log_line=f"stage2 chunk {idx}/{len(chunks)} (pages {chunk['page_start']}-{chunk['page_end']})",
                )
                print(f"  [stage2] chunk {chunk['chunk_no']} pages {chunk['page_start']}-{chunk['page_end']}")
                result = call_openai_legacy(
                    client, STAGE2_SYSTEM_PROMPT,
                    legacy_stage2_user_prompt(chunk, args.manufacturer_name, hints_text, system_context),
                    label=f"stage2-chunk{chunk['chunk_no']}", inter_call_delay=inter_call_delay,
                )
                run_manifest.append({"stage": "stage2", "chunk_no": chunk["chunk_no"],
                                      "pages": f"{chunk['page_start']}-{chunk['page_end']}",
                                      "status": "ok" if result else "failed"})
                comps, links = assemble_stage2(chunk, result)
                all_components.extend(comps)
                all_links.extend(links)
        elif use_batch:
            system_context_text = STAGE2_SYSTEM_CONTEXT_SECTION.format(system_context=json.dumps(system_context, indent=2))
            system = build_system_blocks(STAGE2_SYSTEM_PROMPT, hints_text, extra_text=system_context_text)
            results_by_chunk = run_stage2_batch(client, chunks, args.manufacturer_name, system, REPORTER, run_manifest)
            for chunk in chunks:
                comps, links = assemble_stage2(chunk, results_by_chunk.get(chunk["chunk_no"]))
                all_components.extend(comps)
                all_links.extend(links)
        else:
            system_context_text = STAGE2_SYSTEM_CONTEXT_SECTION.format(system_context=json.dumps(system_context, indent=2))
            system = build_system_blocks(STAGE2_SYSTEM_PROMPT, hints_text, extra_text=system_context_text)
            for idx, chunk in enumerate(chunks, 1):
                REPORTER.progress(
                    {"currentStage": "stage2", "chunk": idx, "totalChunks": len(chunks)},
                    log_line=f"stage2 chunk {idx}/{len(chunks)} (pages {chunk['page_start']}-{chunk['page_end']})",
                )
                print(f"  [stage2] chunk {chunk['chunk_no']} pages {chunk['page_start']}-{chunk['page_end']}")
                result = call_claude_interactive(
                    client, system, stage2_user_prompt(chunk, args.manufacturer_name), STAGE2_JSON_SCHEMA,
                    label=f"stage2-chunk{chunk['chunk_no']}", inter_call_delay=inter_call_delay,
                )
                run_manifest.append({"stage": "stage2", "chunk_no": chunk["chunk_no"],
                                      "pages": f"{chunk['page_start']}-{chunk['page_end']}",
                                      "status": "ok" if result else "failed"})
                comps, links = assemble_stage2(chunk, result)
                all_components.extend(comps)
                all_links.extend(links)

        print(f"\n[parser] Stage 2 total: {len(all_components)} components, {len(all_links)} links")

    # Resolve temp keys / FK links
    print("\n[parser] Resolving FK links...")
    standalone_stage2 = args.stage == "2" and bool(existing_systems_by_id)
    unresolved_diagnostics = []

    if standalone_stage2:
        # Systems already exist in Supabase — resolve links to real UUIDs directly.
        name_to_sys_id = {}
        code_to_sys_id = {}
        for sys_id, s in existing_systems_by_id.items():
            n = normalize_system_name(s.get("name") or "")
            c = (s.get("product_code") or "").strip()
            if n:
                name_to_sys_id[n] = sys_id
            if c:
                code_to_sys_id[c] = sys_id

        comp_name_map = {}
        for i, c in enumerate(all_components):
            c["_temp_key"] = f"component_{i}"
            c["manufacturer_id"] = args.manufacturer_id
            c.setdefault("source_document_id", None)
            c.setdefault("source_chunk_id", None)
            n = (c.get("name") or "").lower().strip()
            if n:
                comp_name_map[n] = i

        resolved_links = []
        skipped = 0
        for lnk in all_links:
            sys_match = lnk.pop("staged_system_match", None) or lnk.pop("system_match", None) or {}
            comp_match = lnk.pop("component_match", None) or {}
            sys_id = (
                code_to_sys_id.get((sys_match.get("product_code") or "").strip())
                or name_to_sys_id.get(normalize_system_name(sys_match.get("system_name") or sys_match.get("name") or ""))
            )
            comp_name = (comp_match.get("name") or "").lower().strip()
            comp_idx = comp_name_map.get(comp_name)
            if sys_id is not None and comp_idx is not None:
                resolved_links.append({
                    "staged_system_id": sys_id,
                    "_comp_idx": comp_idx,
                    "role": lnk.get("role"),
                    "notes": lnk.get("notes"),
                    "sort_order": lnk.get("sort_order"),
                    "extraction_confidence": lnk.get("extraction_confidence"),
                })
            else:
                skipped += 1

        if skipped:
            print(f"  [WARN] {skipped} component links dropped — unresolved FK")
        print(f"  {len(resolved_links)} links resolved to existing system UUIDs")

        print("\n[parser] === Grounding checks (source-text cross-check) ===")
        grounding_issues = run_grounding_checks([], [], all_components, chunks)
        if grounding_issues:
            for iss in grounding_issues:
                print(f"  [QA-{iss['severity'].upper()}] {iss['detail']}")
            print(f"  Flagged {len(grounding_issues)} issue(s) with parser_notes.qa_flag for human review")
        else:
            print("  No grounding issues found.")
        qa_dir = Path(".local/parser-qa")
        qa_dir.mkdir(parents=True, exist_ok=True)
        qa_slug = re.sub(r'[^a-z0-9]+', '_', args.manufacturer_name.lower()).strip('_')
        qa_ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        qa_path = qa_dir / f"{qa_slug}_{qa_ts}.json"
        qa_path.write_text(json.dumps(grounding_issues, indent=2), encoding="utf-8")
        print(f"  QA report: {qa_path}")

        plan = {
            "stagedSystems": [],
            "stagedSystemProfiles": [],
            "stagedSystemColours": [],
            "stagedComponents": [clean_record(c, COMPONENT_FIELDS) for c in all_components],
            "stagedSystemComponents": [],  # handled separately via direct insert
            "_resolvedLinks": resolved_links,  # carries real system UUIDs for direct insert
        }
    else:
        all_systems, all_profiles, all_colours, all_components, all_links, unresolved_diagnostics = assign_temp_keys(
            all_systems, all_profiles, all_colours, all_components, all_links
        )

        print("\n[parser] === QA review (pre-insert cross-check) ===")
        qa_issues = run_qa_checks(all_systems, all_profiles) + unresolved_diagnostics
        if qa_issues:
            for iss in qa_issues:
                print(f"  [QA-{iss['severity'].upper()}] {iss['detail']}")
            flagged = apply_qa_flags(all_profiles, qa_issues)
            print(f"  Flagged {flagged} row(s) with parser_notes.qa_flag for human review in Verify Systems")
        else:
            print("  No cross-check issues found.")

        print("\n[parser] === Grounding checks (source-text cross-check) ===")
        grounding_issues = run_grounding_checks(all_systems, all_profiles, all_components, chunks)
        if grounding_issues:
            for iss in grounding_issues:
                print(f"  [QA-{iss['severity'].upper()}] {iss['detail']}")
            print(f"  Flagged {len(grounding_issues)} issue(s) with parser_notes.qa_flag for human review")
        else:
            print("  No grounding issues found.")
        qa_issues = qa_issues + grounding_issues

        qa_dir = Path(".local/parser-qa")
        qa_dir.mkdir(parents=True, exist_ok=True)
        qa_slug = re.sub(r'[^a-z0-9]+', '_', args.manufacturer_name.lower()).strip('_')
        qa_ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        qa_path = qa_dir / f"{qa_slug}_{qa_ts}.json"
        qa_path.write_text(json.dumps(qa_issues, indent=2), encoding="utf-8")
        print(f"  QA report: {qa_path}")

        plan = build_plan(args.manufacturer_id, all_systems, all_profiles, all_colours, all_components, all_links)

    print("\n[parser] Insertion plan:")
    print(f"  Systems    : {len(plan['stagedSystems'])}")
    print(f"  Profiles   : {len(plan['stagedSystemProfiles'])}")
    print(f"  Colours    : {len(plan['stagedSystemColours'])}")
    print(f"  Components : {len(plan['stagedComponents'])}")
    if standalone_stage2:
        print(f"  Links      : {len(plan.get('_resolvedLinks', []))} (direct insert, not via RPC)")
    else:
        print(f"  Links      : {len(plan['stagedSystemComponents'])}")

    # ── Persist everything BEFORE any insert attempt (2026-07-18 audit P0) ──
    # A failed RPC used to discard the entire multi-hour extraction; failed
    # chunks used to exist only as scrolled-away console warnings. The plan
    # and the chunk manifest are now durable artifacts of every run.
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dry_run_dir = Path(".local/parser-dry-run")
    dry_run_dir.mkdir(parents=True, exist_ok=True)

    plan_path = dry_run_dir / f"plan_{ts}.json"
    plan_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n[parser] Plan saved: {plan_path}")

    failed_chunks = [m for m in run_manifest if m["status"] != "ok"]
    if run_manifest:
        manifest_path = dry_run_dir / f"manifest_{ts}.json"
        manifest_path.write_text(json.dumps(run_manifest, indent=2), encoding="utf-8")
        if failed_chunks:
            print(f"\n[parser] WARNING: {len(failed_chunks)} chunk call(s) FAILED — manifest: {manifest_path}")
            for m in failed_chunks:
                print(f"    - {m['stage']} chunk {m['chunk_no']} (pages {m['pages']})")

    counts_summary = {
        "systems": len(plan.get("stagedSystems", [])),
        "profiles": len(plan.get("stagedSystemProfiles", [])),
        "colours": len(plan.get("stagedSystemColours", [])),
        "components": len(plan.get("stagedComponents", [])),
        "links": len(plan.get("_resolvedLinks", []) if standalone_stage2 else plan.get("stagedSystemComponents", [])),
        "failedChunks": len(failed_chunks),
    }

    if args.dry_run:
        print(f"\n[parser] Dry run — no Supabase writes. Insert later with:\n  --from-plan \"{plan_path}\"")
        REPORTER.done({**counts_summary, "dryRun": True})
        return

    # A run with failed chunks means products are missing. Refuse to insert a
    # silently incomplete catalogue unless the operator explicitly opts in.
    if failed_chunks and not args.allow_partial:
        msg = (f"{len(failed_chunks)} chunk(s) failed extraction — refusing live insert. "
               f"Fix and re-run, or insert this partial result with --allow-partial, "
               f"or resume later with --from-plan \"{plan_path}\"")
        REPORTER.fail(msg)
        sys.exit(f"[FATAL] {msg}")

    if standalone_stage2:
        print("\n[parser] Stage 2 standalone — inserting components + links directly...")
        insert_stage2_direct(plan, supabase_url, service_key, dry_run_dir, ts)
        REPORTER.done(counts_summary)
    else:
        print("\n[parser] Calling Supabase RPC...")
        result = call_rpc(plan, supabase_url, service_key)
        if result:
            # Save result alongside plan for audit
            result_path = dry_run_dir / f"rpc_result_{ts}.json"
            result_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
            print("\n[parser] RPC result:")
            print(json.dumps(result, indent=2))
            REPORTER.done({**counts_summary, "inserted": result.get("inserted_counts", {})})
        else:
            msg = (f"RPC insert failed — extraction is NOT lost. "
                   f"Retry without re-extracting: --from-plan \"{plan_path}\"")
            REPORTER.fail(msg)
            sys.exit(f"[FATAL] {msg}")


if __name__ == "__main__":
    # Crash/interrupt reporting: whatever escapes main() still marks the
    # pipeline_jobs row as failed, so the pipeline UI never shows a silent
    # spinner over a dead run. Explicit done()/fail() calls inside main() win.
    try:
        main()
    except SystemExit as e:
        if REPORTER is not None and not REPORTER.terminal_sent and e.code not in (0, None):
            REPORTER.fail(str(e.code))
        raise
    except KeyboardInterrupt:
        if REPORTER is not None and not REPORTER.terminal_sent:
            REPORTER.fail("interrupted by user (Ctrl+C)")
        raise
    except Exception as e:
        if REPORTER is not None and not REPORTER.terminal_sent:
            REPORTER.fail(f"{type(e).__name__}: {e}")
        raise
