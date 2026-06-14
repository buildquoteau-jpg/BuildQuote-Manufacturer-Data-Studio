#!/usr/bin/env python3
"""
run_parser.py — AI parser: Docling markdown -> Supabase staging tables.

Two-pass approach:
  Stage 1: Extract systems + profiles + colours per catalogue section.
  Stage 2: Extract components + system-component links per section.

Writes to Supabase via insert_parser_output_plan_v1 RPC (service role).

Usage:
    python scripts/parser/run_parser.py \
        --input ".local/docling-output/<run>/output.md" \
        --manufacturer-id "6092e3a5-a542-4869-a2b2-6fc34cc82c83" \
        --manufacturer-name "James Hardie" \
        --hints "prompts/manufacturer-hints/james_hardie.md" \
        [--dry-run]

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
from datetime import datetime, timezone
from pathlib import Path


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
1. Return JSON only. No markdown. No prose. No text before or after the JSON.
2. Do not invent products. Extract only what is explicitly in the source.
3. Set any unknown field to null.
4. All dimension values must be numeric (no units inside the value).
5. Extract every profile row — even if there are 8+ variants of the same system.
6. source_page_number should be the catalogue page number if visible in the content."""

STAGE1_USER_TEMPLATE = """Manufacturer: {manufacturer_name}
Catalogue section (pages {page_start}–{page_end}):

{chunk_text}

---
{hints_section}

Extract all systems, profiles, and colours from this section.

Return this exact JSON shape (no other text):

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
      "install_guide_url": null,
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
1. Return JSON only. No markdown. No prose.
2. Do not invent products.
3. Set unknown fields to null.
4. All dimension values must be numeric.
5. Use "uom" not "unit".
6. supplier_pack_qty is the manufacturer pack size, not the customer order quantity."""

STAGE2_USER_TEMPLATE = """Manufacturer: {manufacturer_name}
Catalogue section (pages {page_start}–{page_end}):

{chunk_text}

---
Known systems already extracted (for linking components):
{system_context}

---
{hints_section}

Extract all components, accessories, fixings, and tools from this section.

Return this exact JSON shape (no other text):

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


# ============================================================
# Field allowlists (strip unknown fields before RPC)
# ============================================================

SYSTEM_FIELDS = {
    "manufacturer_id", "source_document_id", "source_chunk_id",
    "name", "product_code", "slug", "category", "subcategory", "description",
    "bal_rating", "acoustic_rating", "moisture_resistant", "structural_grade",
    "double_sided", "sheet_format", "install_guide_url", "tech_data_url",
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


def call_claude(client, system_prompt, user_prompt, label="", max_retries=3, inter_call_delay=0):
    import time

    delay = 30  # seconds to wait after a 429 before retrying
    provider = getattr(client, "_provider", "anthropic")

    for attempt in range(1, max_retries + 1):
        try:
            if provider == "openai":
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
            else:
                import anthropic
                response = client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=16000,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_prompt}],
                )
                raw = response.content[0].text
                stop_reason = response.stop_reason
                output_tokens = response.usage.output_tokens if response.usage else "?"

        except Exception as e:
            err_str = str(e)
            is_rate_limit = "429" in err_str or "rate_limit" in err_str.lower() or "rate limit" in err_str.lower()
            if is_rate_limit and attempt < max_retries:
                print(f"    [RATE LIMIT] {label} attempt {attempt} — waiting {delay}s before retry...")
                time.sleep(delay)
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
            print(f"    [WARN] Invalid JSON ({label}): {e}")
            print(f"    Raw (last 500): ...{raw[-500:]}")
            if stop_reason in ("max_tokens", "length"):
                print(f"    [WARN] Response hit max_tokens — JSON truncated.")
            return None

    return None


def parse_stage1(client, chunk, manufacturer_name, hints_text, inter_call_delay=0):
    print(f"  [stage1] chunk {chunk['chunk_no']} pages {chunk['page_start']}-{chunk['page_end']}")
    user_prompt = STAGE1_USER_TEMPLATE.format(
        manufacturer_name=manufacturer_name,
        page_start=chunk["page_start"],
        page_end=chunk["page_end"],
        chunk_text=chunk["text"],
        hints_section=f"Manufacturer hints:\n{hints_text}" if hints_text else "",
    )
    result = call_claude(client, STAGE1_SYSTEM_PROMPT, user_prompt, label=f"stage1-chunk{chunk['chunk_no']}", inter_call_delay=inter_call_delay)
    if not result:
        return [], [], []

    systems = result.get("systems") or []
    profiles = result.get("system_profiles") or []
    colours = result.get("system_colours") or []

    for item in systems:
        item["_chunk_no"] = chunk["chunk_no"]
        item["_page_start"] = chunk["page_start"]

    print(f"    -> {len(systems)} systems, {len(profiles)} profiles, {len(colours)} colours")
    if result.get("warnings"):
        for w in result["warnings"]:
            print(f"    [WARN] {w}")
    return systems, profiles, colours


def parse_stage2(client, chunk, manufacturer_name, hints_text, system_context, inter_call_delay=0):
    print(f"  [stage2] chunk {chunk['chunk_no']} pages {chunk['page_start']}-{chunk['page_end']}")
    user_prompt = STAGE2_USER_TEMPLATE.format(
        manufacturer_name=manufacturer_name,
        page_start=chunk["page_start"],
        page_end=chunk["page_end"],
        chunk_text=chunk["text"],
        system_context=json.dumps(system_context, indent=2),
        hints_section=f"Manufacturer hints:\n{hints_text}" if hints_text else "",
    )
    result = call_claude(client, STAGE2_SYSTEM_PROMPT, user_prompt, label=f"stage2-chunk{chunk['chunk_no']}", inter_call_delay=inter_call_delay)
    if not result:
        return [], []

    components = result.get("components") or []
    links = result.get("system_components") or []

    print(f"    -> {len(components)} components, {len(links)} links")
    if result.get("warnings"):
        for w in result["warnings"]:
            print(f"    [WARN] {w}")
    return components, links


def resolve_system_key(match_obj, name_map, code_map):
    if not match_obj:
        return None
    code = (match_obj.get("product_code") or "").strip()
    name = (match_obj.get("system_name") or match_obj.get("name") or "").lower().strip()
    if code and code in code_map:
        return code_map[code]
    if name and name in name_map:
        return name_map[name]
    # Fuzzy: substring match
    for k, v in name_map.items():
        if name and (name in k or k in name):
            return v
    return None


def assign_temp_keys(all_systems, all_profiles, all_colours, all_components, all_links):
    # Systems
    name_map, code_map = {}, {}
    for i, s in enumerate(all_systems):
        key = f"system_{i}"
        s["_temp_key"] = key
        n = (s.get("name") or "").lower().strip()
        c = (s.get("product_code") or "").strip()
        if n:
            name_map[n] = key
        if c:
            code_map[c] = key

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

    if skipped_profiles:
        print(f"  [WARN] {skipped_profiles} profiles dropped — could not match to a system")
    if skipped_colours:
        print(f"  [WARN] {skipped_colours} colours dropped — could not match to a system")
    if skipped_links:
        print(f"  [WARN] {skipped_links} component links dropped — unresolved FK")

    valid_profiles = [p for p in all_profiles if "_staged_system_temp_key" in p]
    valid_colours = [c for c in all_colours if "_staged_system_temp_key" in c]
    valid_links = [lnk for lnk in all_links if "_staged_system_temp_key" in lnk and "_staged_component_temp_key" in lnk]

    return all_systems, valid_profiles, valid_colours, all_components, valid_links


def normalize_system_name(name):
    """Normalize name for deduplication: collapse whitespace, lowercase."""
    import unicodedata
    name = unicodedata.normalize("NFKC", name or "")
    name = re.sub(r'\s+', ' ', name).strip().lower()
    # Normalize trademark symbols and spacing around them
    name = re.sub(r'\s*[™®]\s*', '™', name)
    return name


def deduplicate_systems(all_systems, all_profiles):
    """
    Merge duplicate systems (same normalised name) by keeping the one with
    the most profiles — typically the one extracted from the actual spec pages,
    not from the TOC.  Profile _staged_system_temp_key refs are NOT assigned
    yet, so we track by list position / _chunk_no instead.
    """
    # Count profiles per system by _chunk_no+name (profiles haven't been linked yet)
    # We'll just prefer systems with higher extraction_confidence and from later chunks
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
            # Prefer higher confidence; on tie prefer later chunk (more spec content)
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

    # Strip internal temp keys before inserting
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

def main():
    parser = argparse.ArgumentParser(description="AI parser: Docling markdown -> Supabase staging tables")
    parser.add_argument("--input", required=True, help="Path to output.md from Docling chunked extraction")
    parser.add_argument("--manufacturer-id", required=True, help="data_studio_manufacturers.id UUID")
    parser.add_argument("--manufacturer-name", required=True, help="Manufacturer display name")
    parser.add_argument("--hints", default=None, help="Path to manufacturer hints .md file")
    parser.add_argument("--dry-run", action="store_true", help="Write plan JSON locally, skip Supabase")
    parser.add_argument("--stage", choices=["1", "2", "both"], default="both")
    parser.add_argument("--openai-model", default=None, help="Use OpenAI instead of Anthropic (e.g. gpt-4.5-preview, gpt-4o)")
    parser.add_argument("--production", action="store_true", help="Target production Supabase (reads PRODUCTION_SUPABASE_URL + PRODUCTION_SUPABASE_SERVICE_ROLE_KEY from .env.local)")
    args = parser.parse_args()

    anthropic_key, openai_key, supabase_url, service_key = load_env(production=args.production)

    use_openai = bool(args.openai_model)

    if use_openai:
        if not openai_key:
            sys.exit("[ERROR] OPENAI_API_KEY not set in .env.local or environment")
        from openai import OpenAI as _OpenAI
        client = _OpenAI(api_key=openai_key)
        client._provider = "openai"
        client._model = args.openai_model
        inter_call_delay = 3  # OpenAI has much higher rate limits
        print(f"[parser] Provider: OpenAI ({args.openai_model})")
    else:
        if not anthropic_key:
            sys.exit("[ERROR] ANTHROPIC_API_KEY not set in .env.local or environment")
        import anthropic
        client = anthropic.Anthropic(api_key=anthropic_key)
        client._provider = "anthropic"
        inter_call_delay = 65  # 8k tokens/min limit on this key
        print(f"[parser] Provider: Anthropic (claude-sonnet-4-6)")

    if not args.dry_run and (not supabase_url or not service_key):
        sys.exit("[ERROR] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required (or use --dry-run)")

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

    all_systems, all_profiles, all_colours = [], [], []
    all_components, all_links = [], []

    # Stage 1 — systems, profiles, colours
    if args.stage in ("1", "both"):
        print(f"\n[parser] === Stage 1: systems, profiles, colours ===")
        for chunk in chunks:
            s, p, c = parse_stage1(client, chunk, args.manufacturer_name, hints_text, inter_call_delay=inter_call_delay)
            all_systems.extend(s)
            all_profiles.extend(p)
            all_colours.extend(c)
        print(f"\n[parser] Stage 1 total: {len(all_systems)} systems, {len(all_profiles)} profiles, {len(all_colours)} colours")
        print(f"\n[parser] Deduplicating systems...")
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
        for chunk in chunks:
            comps, links = parse_stage2(client, chunk, args.manufacturer_name, hints_text, system_context, inter_call_delay=inter_call_delay)
            all_components.extend(comps)
            all_links.extend(links)
        print(f"\n[parser] Stage 2 total: {len(all_components)} components, {len(all_links)} links")

    # Resolve temp keys / FK links
    print(f"\n[parser] Resolving FK links...")
    standalone_stage2 = args.stage == "2" and bool(existing_systems_by_id)

    if standalone_stage2:
        # Systems already exist in Supabase — resolve links to real UUIDs directly.
        name_to_sys_id = {}
        code_to_sys_id = {}
        for sys_id, s in existing_systems_by_id.items():
            n = (s.get("name") or "").lower().strip()
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
                name_to_sys_id.get((sys_match.get("system_name") or sys_match.get("name") or "").lower().strip())
                or code_to_sys_id.get((sys_match.get("product_code") or "").strip())
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

        plan = {
            "stagedSystems": [],
            "stagedSystemProfiles": [],
            "stagedSystemColours": [],
            "stagedComponents": [clean_record(c, COMPONENT_FIELDS) for c in all_components],
            "stagedSystemComponents": [],  # handled separately via direct insert
            "_resolvedLinks": resolved_links,  # carries real system UUIDs for direct insert
        }
    else:
        all_systems, all_profiles, all_colours, all_components, all_links = assign_temp_keys(
            all_systems, all_profiles, all_colours, all_components, all_links
        )
        plan = build_plan(args.manufacturer_id, all_systems, all_profiles, all_colours, all_components, all_links)

    print(f"\n[parser] Insertion plan:")
    print(f"  Systems    : {len(plan['stagedSystems'])}")
    print(f"  Profiles   : {len(plan['stagedSystemProfiles'])}")
    print(f"  Colours    : {len(plan['stagedSystemColours'])}")
    print(f"  Components : {len(plan['stagedComponents'])}")
    if standalone_stage2:
        print(f"  Links      : {len(plan.get('_resolvedLinks', []))} (direct insert, not via RPC)")
    else:
        print(f"  Links      : {len(plan['stagedSystemComponents'])}")

    # Dry run or insert
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dry_run_dir = Path(".local/parser-dry-run")

    if args.dry_run:
        dry_run_dir.mkdir(parents=True, exist_ok=True)
        plan_path = dry_run_dir / f"plan_{ts}.json"
        plan_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\n[parser] Dry run — plan written to: {plan_path}")
    elif standalone_stage2:
        print(f"\n[parser] Stage 2 standalone — inserting components + links directly...")
        insert_stage2_direct(plan, supabase_url, service_key, dry_run_dir, ts)
    else:
        print(f"\n[parser] Calling Supabase RPC...")
        result = call_rpc(plan, supabase_url, service_key)
        if result:
            # Save result alongside plan for audit
            dry_run_dir.mkdir(parents=True, exist_ok=True)
            result_path = dry_run_dir / f"rpc_result_{ts}.json"
            result_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"\n[parser] RPC result:")
            print(json.dumps(result, indent=2))
        else:
            sys.exit(1)


if __name__ == "__main__":
    main()
