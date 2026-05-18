#!/usr/bin/env python3
"""
patch_stage2.py — Re-run Stage 2 on a specific page range and insert net-new
components/links into staging, skipping anything already there.

Usage:
    python scripts/parser/patch_stage2.py \
        --input ".local/docling-output/<run>/output.md" \
        --manufacturer-id "6092e3a5-a542-4869-a2b2-6fc34cc82c83" \
        --manufacturer-name "James Hardie" \
        --hints "prompts/manufacturer-hints/james_hardie.md" \
        --openai-model gpt-5.4 \
        [--dry-run]

Fetches existing staged systems + components from Supabase to:
  1. Provide system context to Stage 2 AI
  2. Skip components/links that are already in staging
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


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
        os.environ.get("OPENAI_API_KEY"),
        os.environ.get("NEXT_PUBLIC_SUPABASE_URL"),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
    )


def fetch_staged_systems(supabase_url, service_key, manufacturer_id):
    import httpx
    hdrs = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    r = httpx.get(f"{supabase_url}/rest/v1/staged_systems",
        params={"select": "id,name,product_code", "manufacturer_id": f"eq.{manufacturer_id}"},
        headers=hdrs, timeout=15)
    if r.status_code != 200:
        sys.exit(f"[ERROR] Could not fetch staged systems: {r.text}")
    systems = r.json()
    print(f"[patch] Loaded {len(systems)} existing staged systems as context")
    return systems


def fetch_staged_components(supabase_url, service_key, manufacturer_id):
    import httpx
    hdrs = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    r = httpx.get(f"{supabase_url}/rest/v1/staged_components",
        params={"select": "id,name,sku", "manufacturer_id": f"eq.{manufacturer_id}", "limit": "500"},
        headers=hdrs, timeout=15)
    if r.status_code != 200:
        sys.exit(f"[ERROR] Could not fetch staged components: {r.text}")
    comps = r.json()
    print(f"[patch] Loaded {len(comps)} existing staged components")
    return comps


def fetch_staged_links(supabase_url, service_key, system_ids):
    """Return set of (staged_system_id, staged_component_id) already in staging."""
    import httpx
    if not system_ids:
        return set()
    hdrs = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    id_list = ",".join(system_ids)
    r = httpx.get(f"{supabase_url}/rest/v1/staged_system_components",
        params={"select": "staged_system_id,staged_component_id",
                "staged_system_id": f"in.({id_list})", "limit": "1000"},
        headers=hdrs, timeout=15)
    if r.status_code != 200:
        return set()
    return {(row["staged_system_id"], row["staged_component_id"]) for row in r.json()}


def split_into_chunks(md_text):
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


def call_ai(client, system_prompt, user_prompt, label="", max_retries=3):
    import time
    delay = 30
    provider = getattr(client, "_provider", "openai")

    for attempt in range(1, max_retries + 1):
        try:
            if provider == "anthropic":
                import anthropic as _anthropic
                response = client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=16000,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_prompt}],
                )
                raw = response.content[0].text
                stop_reason = response.stop_reason
                output_tokens = response.usage.output_tokens if response.usage else "?"
            else:
                response = client.chat.completions.create(
                    model=client._model,
                    max_completion_tokens=32000,
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
            is_rate_limit = "429" in err_str or "rate_limit" in err_str.lower()
            if is_rate_limit and attempt < max_retries:
                print(f"    [RATE LIMIT] {label} attempt {attempt} — waiting {delay}s...")
                time.sleep(delay)
                continue
            print(f"    [ERROR] {label}: {e}")
            return None

        raw = raw.strip()
        raw = re.sub(r'^```(?:json)?\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)
        print(f"    [tokens] stop={stop_reason} tokens={output_tokens}")

        try:
            result = json.loads(raw)
            time.sleep(3)
            return result
        except json.JSONDecodeError as e:
            print(f"    [WARN] Invalid JSON ({label}): {e}")
            if stop_reason in ("max_tokens", "length"):
                print(f"    [WARN] Response truncated at max_tokens")
            return None
    return None


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
      "role": "component",
      "notes": "string or null",
      "sort_order": null,
      "extraction_confidence": 0.0
    }}
  ],
  "warnings": [],
  "ignored_content_notes": []
}}"""


_TM_STRIP = re.compile(r'[™®]')

def strip_tm(s):
    if not isinstance(s, str):
        return s
    return re.sub(r'\s+', ' ', _TM_STRIP.sub('', s)).strip()


def normalize_name(name):
    return re.sub(r'\s+', ' ', (name or '').lower().strip())


def resolve_system(match_obj, sys_name_map, sys_code_map):
    if not match_obj:
        return None
    code = (match_obj.get("product_code") or "").strip()
    name = normalize_name(match_obj.get("system_name") or match_obj.get("name") or "")
    if code and code in sys_code_map:
        return sys_code_map[code]
    if name and name in sys_name_map:
        return sys_name_map[name]
    for k, v in sys_name_map.items():
        if name and (name in k or k in name):
            return v
    return None


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
LINK_FIELDS = {"role", "notes", "sort_order", "extraction_confidence"}


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--manufacturer-id", required=True)
    parser.add_argument("--manufacturer-name", required=True)
    parser.add_argument("--hints", default=None)
    parser.add_argument("--openai-model", default=None)
    parser.add_argument("--use-anthropic", action="store_true", help="Use Anthropic claude-sonnet-4-6 instead of OpenAI")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    openai_key, supabase_url, service_key = load_env()
    if not args.dry_run and (not supabase_url or not service_key):
        sys.exit("[ERROR] Supabase env vars required for live insert")

    if args.use_anthropic:
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
        if not anthropic_key:
            sys.exit("[ERROR] ANTHROPIC_API_KEY not set")
        import anthropic as _anthropic
        client = _anthropic.Anthropic(api_key=anthropic_key)
        client._provider = "anthropic"
        print("[patch] Provider: Anthropic (claude-sonnet-4-6)")
    else:
        if not openai_key:
            sys.exit("[ERROR] OPENAI_API_KEY not set")
        if not args.openai_model:
            sys.exit("[ERROR] --openai-model required when not using --use-anthropic")
        from openai import OpenAI as _OpenAI
        client = _OpenAI(api_key=openai_key)
        client._model = args.openai_model
        client._provider = "openai"
        print(f"[patch] Provider: OpenAI ({args.openai_model})")

    hints_text = ""
    if args.hints:
        p = Path(args.hints)
        if p.exists():
            hints_text = p.read_text(encoding="utf-8")

    # Load existing staging state
    existing_systems = fetch_staged_systems(supabase_url, service_key, args.manufacturer_id)
    existing_components = fetch_staged_components(supabase_url, service_key, args.manufacturer_id)
    existing_links = fetch_staged_links(supabase_url, service_key,
                                        [s["id"] for s in existing_systems])

    # Build lookup maps
    sys_name_map = {normalize_name(s["name"]): s["id"] for s in existing_systems}
    sys_code_map = {s["product_code"]: s["id"] for s in existing_systems if s.get("product_code")}
    existing_comp_names = {normalize_name(c["name"]): c["id"] for c in existing_components}
    existing_comp_skus  = {c["sku"]: c["id"] for c in existing_components if c.get("sku")}

    system_context = [{"name": s["name"], "product_code": s.get("product_code")} for s in existing_systems]

    # Parse chunks
    md_text = Path(args.input).read_text(encoding="utf-8")
    chunks = split_into_chunks(md_text)
    print(f"[patch] {len(chunks)} chunks in input | Stage 2 only")

    all_components, all_links = [], []
    for chunk in chunks:
        print(f"\n[stage2] chunk {chunk['chunk_no']} pages {chunk['page_start']}-{chunk['page_end']}")
        user_prompt = STAGE2_USER_TEMPLATE.format(
            manufacturer_name=args.manufacturer_name,
            page_start=chunk["page_start"],
            page_end=chunk["page_end"],
            chunk_text=chunk["text"],
            system_context=json.dumps(system_context, indent=2),
            hints_section=f"Manufacturer hints:\n{hints_text}" if hints_text else "",
        )
        result = call_ai(client, STAGE2_SYSTEM_PROMPT, user_prompt,
                         label=f"stage2-chunk{chunk['chunk_no']}")
        if not result:
            print(f"    [WARN] No result for chunk {chunk['chunk_no']}")
            continue

        comps  = result.get("components") or []
        links  = result.get("system_components") or []
        print(f"    -> {len(comps)} components, {len(links)} links")
        if result.get("warnings"):
            for w in result["warnings"]:
                print(f"    [WARN] {w}")
        all_components.extend(comps)
        all_links.extend(links)

    print(f"\n[patch] Raw totals: {len(all_components)} components, {len(all_links)} links")

    # ── Resolve and deduplicate ───────────────────────────────────────────────

    # Assign temp keys to new components; skip if name already in staging
    comp_temp_map = {}  # temp_key -> component dict (net-new only)
    comp_name_to_temp = {}
    comp_sku_to_temp  = {}
    skipped_existing = 0

    for i, c in enumerate(all_components):
        name_norm = normalize_name(c.get("name"))
        sku       = (c.get("sku") or "").strip()

        # Already in staging OR already seen in this run?
        if name_norm in existing_comp_names or (sku and sku in existing_comp_skus):
            skipped_existing += 1
            # Still register so links can resolve to the existing staging ID
            existing_id = existing_comp_names.get(name_norm) or existing_comp_skus.get(sku)
            comp_name_to_temp[name_norm] = f"__existing__{existing_id}"
            if sku:
                comp_sku_to_temp[sku] = f"__existing__{existing_id}"
            continue

        # Duplicate within this run?
        if name_norm in comp_name_to_temp or (sku and sku in comp_sku_to_temp):
            existing_key = comp_name_to_temp.get(name_norm) or comp_sku_to_temp.get(sku)
            if existing_key and not existing_key.startswith("__existing__"):
                if sku:
                    comp_sku_to_temp[sku] = existing_key
            skipped_existing += 1
            continue

        key = f"new_component_{i}"
        c["_temp_key"] = key
        c["manufacturer_id"] = args.manufacturer_id
        c["source_document_id"] = None
        c["source_chunk_id"] = None
        # Strip TM from name fields
        for field in ("name", "description"):
            if isinstance(c.get(field), str):
                c[field] = strip_tm(c[field])
        # Keep only allowed fields + temp key
        allowed = {k: v for k, v in c.items()
                   if k in COMPONENT_FIELDS or k == "_temp_key"}
        comp_temp_map[key] = allowed
        comp_name_to_temp[name_norm] = key
        if sku:
            comp_sku_to_temp[sku] = key

    print(f"  {skipped_existing} components already in staging — skipped")
    print(f"  {len(comp_temp_map)} net-new components")

    # Resolve links
    new_links = []
    skipped_links = 0
    seen_link_pairs = set()

    for lnk in all_links:
        sys_match  = lnk.get("staged_system_match") or lnk.get("system_match") or {}
        comp_match = lnk.get("component_match") or {}

        sys_id = resolve_system(sys_match, sys_name_map, sys_code_map)
        if not sys_id:
            skipped_links += 1
            continue

        comp_name_norm = normalize_name(comp_match.get("name"))
        comp_sku       = (comp_match.get("sku") or "").strip()
        comp_temp_key  = comp_sku_to_temp.get(comp_sku) or comp_name_to_temp.get(comp_name_norm)

        if not comp_temp_key:
            skipped_links += 1
            continue

        # If component is existing, we need to handle the link differently
        if comp_temp_key.startswith("__existing__"):
            existing_comp_id = comp_temp_key.replace("__existing__", "")
            pair = (sys_id, existing_comp_id)
            if pair in existing_links or pair in seen_link_pairs:
                skipped_links += 1
                continue
            seen_link_pairs.add(pair)
            # Tag as existing-component link (inserted via direct REST, not RPC temp-key)
            new_links.append({
                "_type": "existing_comp",
                "_staged_system_id": sys_id,
                "_staged_component_id": existing_comp_id,
                "role": lnk.get("role") or "component",
                "notes": lnk.get("notes"),
                "sort_order": lnk.get("sort_order"),
            })
        else:
            # New component — use temp key resolution via RPC
            pair_key = (sys_id, comp_temp_key)
            if pair_key in seen_link_pairs:
                skipped_links += 1
                continue
            seen_link_pairs.add(pair_key)
            clean = {k: v for k, v in lnk.items() if k in LINK_FIELDS}
            clean["_staged_system_id"] = sys_id          # real DB id
            clean["_staged_component_temp_key"] = comp_temp_key
            new_links.append({"_type": "new_comp", **clean})

    print(f"  {skipped_links} links dropped (unresolved or already exist)")
    new_comp_links   = [l for l in new_links if l["_type"] == "new_comp"]
    exist_comp_links = [l for l in new_links if l["_type"] == "existing_comp"]
    print(f"  {len(new_comp_links)} new-component links | {len(exist_comp_links)} existing-component links")

    new_comp_list = list(comp_temp_map.values())

    # RPC plan: insert new components only — no links (RPC can't resolve real UUIDs
    # as system temp keys; all links are inserted directly via REST after).
    plan = {
        "stagedSystems": [],
        "stagedSystemProfiles": [],
        "stagedSystemColours": [],
        "stagedComponents": new_comp_list,
        "stagedSystemComponents": [],
        "fieldVerifications": [],
        "parserFieldEvidence": [],
    }

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dry_run_dir = Path(".local/parser-dry-run")
    dry_run_dir.mkdir(parents=True, exist_ok=True)

    all_link_rows = new_comp_links + exist_comp_links  # will resolve after RPC
    print(f"\n[patch] Patch plan:")
    print(f"  Net-new components : {len(new_comp_list)}")
    print(f"  New-comp links     : {len(new_comp_links)}")
    print(f"  Exist-comp links   : {len(exist_comp_links)}")

    if args.dry_run:
        plan_path = dry_run_dir / f"patch_plan_{ts}.json"
        full = {"plan": plan, "new_comp_links": new_comp_links, "exist_comp_links": exist_comp_links}
        plan_path.write_text(json.dumps(full, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\n[patch] Dry run — written to: {plan_path}")
        return

    # ── Live insert ───────────────────────────────────────────────────────────
    import httpx

    hdrs = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    # Step 1: Insert new components via RPC (gets us their real IDs)
    comp_id_map = {}
    if new_comp_list:
        print(f"\n[patch] Calling RPC for {len(new_comp_list)} new components...")
        result = call_rpc(plan, supabase_url, service_key)
        if not result:
            sys.exit(1)
        print(f"  RPC inserted: {result.get('inserted_counts', {})}")
        comp_id_map = result.get("id_maps", {}).get("components", {})
    else:
        print("[patch] No new components to insert.")

    # Step 2: Build all link rows using real IDs, POST directly to REST
    link_rows = []
    for lnk in new_comp_links:
        comp_real_id = comp_id_map.get(lnk["_staged_component_temp_key"])
        if not comp_real_id:
            print(f"  [WARN] Could not resolve temp key {lnk['_staged_component_temp_key']} to real ID")
            continue
        link_rows.append({
            "staged_system_id": lnk["_staged_system_id"],
            "staged_component_id": comp_real_id,
            "role": lnk.get("role") or "component",
            "notes": lnk.get("notes"),
            "sort_order": lnk.get("sort_order"),
        })
    for lnk in exist_comp_links:
        link_rows.append({
            "staged_system_id": lnk["_staged_system_id"],
            "staged_component_id": lnk["_staged_component_id"],
            "role": lnk.get("role") or "component",
            "notes": lnk.get("notes"),
            "sort_order": lnk.get("sort_order"),
        })

    if link_rows:
        r = httpx.post(f"{supabase_url}/rest/v1/staged_system_components",
            json=link_rows, headers=hdrs, timeout=30)
        if r.status_code in (200, 201):
            print(f"  Inserted {len(link_rows)} links")
        else:
            print(f"  [WARN] links insert: {r.status_code} {r.text[:300]}")

    result_path = dry_run_dir / f"patch_result_{ts}.json"
    result_path.write_text(json.dumps({
        "new_components": len(new_comp_list),
        "links_inserted": len(link_rows),
        "comp_id_map": comp_id_map,
    }, indent=2), encoding="utf-8")
    print(f"\n[patch] Done. Result written to {result_path}")


if __name__ == "__main__":
    main()
