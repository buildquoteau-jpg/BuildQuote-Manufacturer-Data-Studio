#!/usr/bin/env python3
"""
run_web_enricher.py — Website enricher: fills hero_image_url, website_url, source_url
in staged_systems from the manufacturer's official website.

Two-step approach:
  Step 1: Match — one GPT call to map staged system names to product page URLs.
  Step 2: Scrape — fetch each product page, extract fields via BeautifulSoup + __NEXT_DATA__.

Only fills columns that are currently NULL. Never overwrites existing data.

Usage:
    python scripts/web-enricher/run_web_enricher.py \
        --manufacturer-id "6092e3a5-a542-4869-a2b2-6fc34cc82c83" \
        --manufacturer-name "James Hardie" \
        --hints "prompts/manufacturer-hints/web_enricher/james_hardie.md" \
        [--limit 5] \
        [--ids id1,id2,...] \
        [--require-null hero_image_url] \
        [--dry-run]

    # Skip GPT name matching (hints slug mappings only):
        [--skip-gpt-match]

Environment (.env.local):
    OPENAI_API_KEY
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY

Dependencies:
    pip install requests beautifulsoup4 openai httpx python-dotenv

Run from repo root.
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

# scripts/lib is importable regardless of cwd
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.pipeline_report import PipelineReporter  # noqa: E402

# Module-level so the __main__ wrapper can report crashes that escape main().
REPORTER = None


# ============================================================
# Prompts
# ============================================================

MATCH_SYSTEM_PROMPT = """You are a data enrichment assistant for a construction product catalogue platform.

Your task: match product names from a staged database to product page URLs scraped from a manufacturer's official website.

RULES:
1. Return JSON only. No markdown. No prose.
2. For each staged name, find the single best matching URL from the available list.
3. Set url to null if no reasonable match exists — do not guess wildly.
4. Confidence: 1.0 = exact match, 0.7–0.9 = likely, below 0.7 = set url to null.
5. Ignore trademark symbols (™, ®, ©) when matching."""

MATCH_USER_TEMPLATE = """Manufacturer: {manufacturer_name}

Staged system names to match:
{staged_names}

Available product page URLs scraped from the website:
{product_urls}

{hints_section}

Return this exact JSON (no other text):
{{
  "matches": [
    {{
      "staged_name": "exact name from the staged list above",
      "url": "full URL or null",
      "confidence": 0.0,
      "notes": "brief reason or null"
    }}
  ]
}}"""

# ============================================================
# Target fields
# ============================================================

TARGET_FIELDS = ("hero_image_url", "website_url", "source_url", "install_guide_urls", "tech_data_url")


# ============================================================
# Environment
# ============================================================

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


# ============================================================
# Supabase helpers
# ============================================================

def fetch_staged_systems(supabase_url, service_key, manufacturer_id, ids=None, limit=None, require_null=None):
    """Fetch staged_systems rows that have at least one target field NULL.

    require_null: if set, only return rows where ALL of these fields are null.
    Useful to skip rows already partially patched (e.g. hero done, PDFs still missing).
    """
    import httpx

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Accept": "application/json",
    }
    params = {
        "manufacturer_id": f"eq.{manufacturer_id}",
        "select": "id,name," + ",".join(TARGET_FIELDS),
        "order": "name.asc",
    }
    if ids:
        params["id"] = f"in.({','.join(ids)})"

    resp = httpx.get(
        f"{supabase_url}/rest/v1/staged_systems",
        headers=headers,
        params=params,
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"[ERROR] Supabase fetch {resp.status_code}: {resp.text}")
        return []

    rows = resp.json()

    if require_null:
        # Only rows where every listed field is null
        rows = [r for r in rows if all(r.get(f) is None for f in require_null)]
    else:
        # Default: at least one target field is null
        rows = [r for r in rows if any(r.get(f) is None for f in TARGET_FIELDS)]

    if limit:
        rows = rows[:limit]

    return rows


def patch_row(supabase_url, service_key, row_id, patch_data):
    """PATCH a single staged_systems row."""
    import httpx

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    resp = httpx.patch(
        f"{supabase_url}/rest/v1/staged_systems",
        headers=headers,
        params={"id": f"eq.{row_id}"},
        json=patch_data,
        timeout=30,
    )
    return resp.status_code in (200, 204)


# ============================================================
# Web scraping
# ============================================================

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-AU,en;q=0.9",
}


def fetch_html(url, retries=2):
    import requests

    for attempt in range(retries + 1):
        try:
            resp = requests.get(url, headers=HTTP_HEADERS, timeout=20)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            if attempt < retries:
                time.sleep(2)
                continue
            print(f"  [WARN] Could not fetch {url}: {e}")
            return None


def abs_url(href, page_url):
    """Convert a relative href to absolute using the page URL as base."""
    if not href:
        return None
    if href.startswith("//"):
        return "https:" + href
    if href.startswith("/"):
        p = urlparse(page_url)
        return f"{p.scheme}://{p.netloc}{href}"
    if href.startswith("http"):
        return href
    return None


def scrape_product_links(listing_url, product_path_prefix="/products/"):
    """Fetch the products listing page and return [{name, url, slug}].

    product_path_prefix: only links whose path contains this string are kept.
    Pass "/" to accept all same-domain links (e.g. sites using /<slug>/ at root).
    """
    from bs4 import BeautifulSoup

    html = fetch_html(listing_url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    p = urlparse(listing_url)
    base = f"{p.scheme}://{p.netloc}"

    links = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/"):
            href = base + href
        if not href.startswith(base):
            continue
        path = urlparse(href).path
        if product_path_prefix != "/" and product_path_prefix not in path:
            continue
        slug = path.rstrip("/").split("/")[-1]
        if not slug or href in seen:
            continue
        seen.add(href)
        links.append({
            "name": a.get_text(strip=True),
            "url": href,
            "slug": slug,
        })

    return links


def _collect_hero_candidates(soup, page_url, skip_ids):
    """
    Collect candidate hero image URLs from the page in priority order:
    1. __NEXT_DATA__ JSON blob (Next.js) — contains the real JS-rendered image URLs
    2. og:image meta tag
    3. <img> tags from CDN domains

    Skips any URL whose path contains a known generic asset ID.
    """
    cdn_domains = ("ctfassets.net", "cloudinary.com", "imgix.net")
    skip = set(skip_ids or [])

    def _is_generic(url):
        return any(sid in url for sid in skip)

    candidates = []
    seen = set()

    def _add(url):
        url = url.strip()
        if url and url not in seen and not _is_generic(url):
            seen.add(url)
            candidates.append(url)

    # Priority 1: __NEXT_DATA__ — Next.js embeds all page data here including real hero URLs
    script = soup.find("script", id="__NEXT_DATA__")
    if script and script.string:
        # Pull every ctfassets.net jpg/jpeg/webp URL from the JSON dump
        for raw in re.findall(
            r'https://images\.ctfassets\.net/[^\s"\'\\<>]+\.(?:jpg|jpeg|webp)(?:\?[^\s"\'\\<>]*)?',
            script.string,
        ):
            _add(raw.replace("\\/", "/"))

    # Priority 2: og:image
    og = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"})
    if og and og.get("content"):
        _add(og["content"])

    # Priority 3: <img> src tags
    for img in soup.find_all("img", src=True):
        src = img["src"]
        if any(cdn in src for cdn in cdn_domains):
            _add(abs_url(src, page_url) or src)

    return candidates


def _pick_hero(product_name, candidates):
    """
    Choose the best hero image from a list of candidates using filename heuristics.
    Prefers URLs whose filename contains keywords from the product name.
    Falls back to the first .jpg, then the first candidate.
    """
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    # Keywords: lowercase words from the product name, skip very short ones
    keywords = re.sub(r"[™®©]", "", product_name.lower()).split()
    keywords = [k for k in keywords if len(k) > 3]

    for url in candidates:
        filename = url.split("/")[-1].split("?")[0].lower()
        if any(kw in filename for kw in keywords):
            return url

    # Fallback: first .jpg (lifestyle photo) over .png (logo/badge)
    for url in candidates:
        if ".jpg" in url.lower() or ".jpeg" in url.lower():
            return url

    return candidates[0]


def _extract_pdf_links(soup, page_url):
    """
    Find install guide and tech data PDF links on a product page.
    Returns (install_guide_urls, tech_data_url).
    install_guide_urls is a list of {label, url} dicts (supports multiple guides).
    """
    from urllib.parse import urljoin

    INSTALL_KEYWORDS = ("install", "installation", "fixing guide", "application guide", "how to", "installer")
    TECH_KEYWORDS    = ("technical", "tech data", "data sheet", "datasheet", "specification", "tds", "sds", "safety data")

    install_guides = []
    tech_data_url  = None

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href.lower().endswith(".pdf"):
            continue
        full_url = urljoin(page_url, href)
        label_text = (a.get_text(strip=True) or a.get("title") or "").lower()
        aria = (a.get("aria-label") or "").lower()
        text = f"{label_text} {aria} {href.lower()}"

        is_install = any(kw in text for kw in INSTALL_KEYWORDS)
        is_tech    = any(kw in text for kw in TECH_KEYWORDS)

        if is_install:
            label = a.get_text(strip=True) or "Installation Guide"
            install_guides.append({"label": label, "url": full_url})
        elif is_tech and not tech_data_url:
            tech_data_url = full_url

    return install_guides or None, tech_data_url


def extract_fields_from_page(soup, page_url, product_name="", skip_hero_asset_ids=None):
    """Extract target fields from a parsed product page via BeautifulSoup."""
    result = {
        "hero_image_url": None,
        "website_url": page_url,
        "source_url": page_url,
        "install_guide_urls": None,
        "tech_data_url": None,
    }

    candidates = _collect_hero_candidates(soup, page_url, skip_hero_asset_ids or [])
    result["hero_image_url"] = _pick_hero(product_name, candidates)

    install_guides, tech_data_url = _extract_pdf_links(soup, page_url)
    if install_guides:
        result["install_guide_urls"] = install_guides
        print(f"    install guides found: {len(install_guides)}")
    if tech_data_url:
        result["tech_data_url"] = tech_data_url
        print(f"    tech data found: {tech_data_url[:60]}...")

    return result


# ============================================================
# GPT helpers
# ============================================================

def call_gpt(client, system_prompt, user_prompt, label="", max_tokens=4096):
    try:
        response = client.chat.completions.create(
            model=client._model,
            max_completion_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        raw = response.choices[0].message.content or ""
        tokens = response.usage.completion_tokens if response.usage else "?"
        print(f"  [tokens] {label} output_tokens={tokens}")
    except Exception as e:
        print(f"  [ERROR] GPT call failed ({label}): {e}")
        return None

    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"  [WARN] Invalid JSON ({label}): {e}")
        print(f"  Raw (first 500): {raw[:500]}")
        return None


def match_names_to_urls(client, rows, product_links, manufacturer_name, hints_text):
    """One GPT call: map staged system names to product page URLs. Returns {name: {url, confidence}}."""
    staged_names = "\n".join(f"- {r['name']}" for r in rows)
    product_urls = "\n".join(
        f"- {lnk['slug']}: {lnk['url']}"
        + (f"  (link text: \"{lnk['name']}\")" if lnk["name"] else "")
        for lnk in product_links
    )

    user_prompt = MATCH_USER_TEMPLATE.format(
        manufacturer_name=manufacturer_name,
        staged_names=staged_names,
        product_urls=product_urls,
        hints_section=f"Manufacturer hints:\n{hints_text}" if hints_text else "",
    )

    result = call_gpt(client, MATCH_SYSTEM_PROMPT, user_prompt, label="name-match")
    if not result:
        return {}

    mapping = {}
    for m in result.get("matches", []):
        name = m.get("staged_name", "")
        url = m.get("url")
        confidence = float(m.get("confidence", 0))
        notes = m.get("notes") or ""
        if url and confidence >= 0.7:
            mapping[name] = {"url": url, "confidence": confidence, "notes": notes}
        else:
            print(f"  [no-match] '{name}' — confidence={confidence:.2f} {notes}")
    return mapping


# ============================================================
# Hints file parser
# ============================================================

def parse_hints_config(hints_text):
    """
    Parse structured config from the hints file.
    Looks for YAML-like key: value lines and a ## Slug Mappings section.
    """
    config = {}

    for key in ("base_url", "products_listing_url", "product_path_prefix"):
        m = re.search(rf"^{key}:\s*(.+)$", hints_text, re.MULTILINE)
        if m:
            config[key] = m.group(1).strip()

    slug_section = re.search(r"##\s*Slug Mappings\s*\n(.*?)(?=\n##|\Z)", hints_text, re.DOTALL)
    if slug_section:
        mappings = {}
        for line in slug_section.group(1).splitlines():
            m = re.match(r'\s*[-*]?\s*"?(.+?)"?\s*:\s*"?(/[^\s"]+)"?\s*$', line)
            if m:
                mappings[m.group(1).strip()] = m.group(2).strip()
        if mappings:
            config["slug_mappings"] = mappings

    # skip_hero_asset_ids: list of Contentful asset IDs that are generic/logo images
    skip_section = re.search(r"##\s*Skip Hero Asset IDs\s*\n(.*?)(?=\n##|\Z)", hints_text, re.DOTALL)
    if skip_section:
        ids = []
        for line in skip_section.group(1).splitlines():
            m = re.match(r'\s*[-*]?\s*([A-Za-z0-9]{10,})\s*', line)
            if m:
                ids.append(m.group(1).strip())
        if ids:
            config["skip_hero_asset_ids"] = ids

    return config


# ============================================================
# Output
# ============================================================

def build_patch(row, extracted):
    """Only include fields that are currently null and have a new non-null value."""
    patch = {}
    for field in TARGET_FIELDS:
        current = row.get(field)
        new_val = extracted.get(field)
        if not new_val:
            continue
        # install_guide_urls is a list — treat empty list as null
        if isinstance(current, list) and len(current) > 0:
            continue
        if current is not None and not isinstance(current, list):
            continue
        patch[field] = new_val
    return patch


def print_results_table(results):
    print("\n" + "=" * 80)
    print(f"  PROPOSED PATCHES — {len(results)} rows processed")
    print("=" * 80)
    for r in results:
        print(f"\n  [{r['name']}]")
        print(f"    id          : {r['id']}")
        print(f"    matched_url : {r.get('matched_url') or '(no match)'}")
        patch = r.get("patch", {})
        if patch:
            for k, v in patch.items():
                display = v if len(str(v)) <= 76 else str(v)[:73] + "..."
                print(f"    {k:<22}: {display}")
        else:
            print(f"    (no new values)")
    print("\n" + "=" * 80)
    patched = sum(1 for r in results if r.get("patch"))
    print(f"  {patched}/{len(results)} rows have patches\n")


# ============================================================
# Main
# ============================================================

def main():
    ap = argparse.ArgumentParser(description="Website enricher: fill URL fields in staged_systems")
    ap.add_argument("--manufacturer-id", required=True)
    ap.add_argument("--manufacturer-name", required=True)
    ap.add_argument("--hints", default=None, help="Path to web enricher hints .md")
    ap.add_argument("--dry-run", action="store_true", help="Print + save patch file, skip Supabase writes")
    ap.add_argument("--limit", type=int, default=None, help="Max rows to process (ignores --ids)")
    ap.add_argument("--ids", default=None, help="Comma-separated staged_system UUIDs to target")
    ap.add_argument("--openai-model", default="gpt-5.4", help="OpenAI model (default: gpt-5.4)")
    ap.add_argument("--skip-gpt-match", action="store_true", help="Use hints slug mappings only, no GPT name matching")
    ap.add_argument("--require-null", default=None, help="Only process rows where ALL listed fields are null. Comma-separated. E.g. hero_image_url,website_url")
    args = ap.parse_args()

    openai_key, supabase_url, service_key = load_env()

    if not openai_key:
        sys.exit("[ERROR] OPENAI_API_KEY not set in .env.local")
    if not supabase_url or not service_key:
        sys.exit("[ERROR] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")

    # GPT client — only needed for name matching
    client = None
    if not args.skip_gpt_match:
        from openai import OpenAI as _OpenAI
        client = _OpenAI(api_key=openai_key)
        client._model = args.openai_model
        print(f"[enricher] Provider: OpenAI ({args.openai_model})")

    # Hints
    hints_text = ""
    hints_config = {}
    if args.hints:
        hints_path = Path(args.hints)
        if hints_path.exists():
            hints_text = hints_path.read_text(encoding="utf-8")
            hints_config = parse_hints_config(hints_text)
            print(f"[enricher] Loaded hints: {hints_path}")
            if hints_config.get("slug_mappings"):
                print(f"[enricher] {len(hints_config['slug_mappings'])} known slug mappings in hints")
        else:
            print(f"[enricher] Hints file not found: {hints_path} — continuing without hints")

    base_url = hints_config.get("base_url", "")
    listing_url = hints_config.get("products_listing_url", "")
    if not listing_url:
        sys.exit("[ERROR] products_listing_url not found in hints file — cannot scrape product listing")

    # Load rows from Supabase
    global REPORTER
    REPORTER = PipelineReporter.start(
        "web_enricher",
        payload={"manufacturer_name": args.manufacturer_name,
                 "dry_run": args.dry_run, "limit": args.limit},
        manufacturer_id=args.manufacturer_id,
    )

    ids = [i.strip() for i in args.ids.split(",")] if args.ids else None
    require_null = [f.strip() for f in args.require_null.split(",")] if args.require_null else None
    print(f"\n[enricher] Fetching staged_systems for manufacturer {args.manufacturer_id}...")
    rows = fetch_staged_systems(supabase_url, service_key, args.manufacturer_id, ids=ids, limit=args.limit, require_null=require_null)
    print(f"[enricher] {len(rows)} rows with at least one null target field")

    if not rows:
        print("[enricher] Nothing to do — all target fields already populated.")
        return

    # Scrape the product listing page
    product_path_prefix = hints_config.get("product_path_prefix", "/products/")
    print(f"\n[enricher] Scraping product listing: {listing_url}")
    product_links = scrape_product_links(listing_url, product_path_prefix=product_path_prefix)
    print(f"[enricher] Found {len(product_links)} product links")

    # Split rows: known slug mapping vs needs GPT
    known_mappings = hints_config.get("slug_mappings", {})
    pre_matched = {}
    needs_gpt = []

    for row in rows:
        slug_path = known_mappings.get(row["name"])
        if slug_path:
            pre_matched[row["name"]] = {
                "url": base_url.rstrip("/") + slug_path,
                "confidence": 1.0,
                "notes": "from hints",
            }
        else:
            needs_gpt.append(row)

    if pre_matched:
        print(f"[enricher] {len(pre_matched)} rows matched from hints (no GPT needed)")

    gpt_matched = {}
    if needs_gpt and not args.skip_gpt_match:
        if not client:
            print("[WARN] --skip-gpt-match set but rows need matching — skipping unmatched rows")
        elif not product_links:
            print("[WARN] No product links scraped — cannot GPT-match")
        else:
            print(f"\n[enricher] GPT matching {len(needs_gpt)} names to product URLs...")
            gpt_matched = match_names_to_urls(
                client, needs_gpt, product_links, args.manufacturer_name, hints_text
            )
    elif needs_gpt and args.skip_gpt_match:
        print(f"[enricher] {len(needs_gpt)} rows have no hints mapping and --skip-gpt-match is set — will be skipped")

    url_mapping = {**pre_matched, **gpt_matched}

    # Scrape each product page and extract fields
    results = []
    for row_idx, row in enumerate(rows, 1):
        name = row["name"]
        REPORTER.progress(
            {"currentStage": "scrape", "row": row_idx, "totalRows": len(rows), "name": name},
            log_line=f"scraping {row_idx}/{len(rows)}: {name}",
        )
        match = url_mapping.get(name)

        entry = {
            "id": row["id"],
            "name": name,
            "matched_url": match["url"] if match else None,
            "match_confidence": match["confidence"] if match else None,
            "patch": {},
        }

        if not match:
            print(f"\n  [skip] '{name}' — no URL match found")
            results.append(entry)
            continue

        page_url = match["url"]
        print(f"\n  [fetch] '{name}'")
        print(f"          {page_url}")

        html = fetch_html(page_url)
        if not html:
            results.append(entry)
            continue

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")

        extracted = extract_fields_from_page(soup, page_url, product_name=name, skip_hero_asset_ids=hints_config.get("skip_hero_asset_ids", []))
        print(f"  [scraped] hero={bool(extracted['hero_image_url'])}")

        entry["patch"] = build_patch(row, extracted)
        results.append(entry)

        time.sleep(1.5)  # polite crawl delay between pages

    # Print results table
    print_results_table(results)

    # Save patch file
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = Path(".local/web-enricher-dry-run")
    out_dir.mkdir(parents=True, exist_ok=True)
    mfr_slug = re.sub(r"[^\w]+", "_", args.manufacturer_name).strip("_").lower()
    patch_path = out_dir / f"patch_{mfr_slug}_{ts}.json"
    patch_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[enricher] Patch file saved: {patch_path}")

    if args.dry_run:
        print("[enricher] Dry run complete — no Supabase writes.")
        REPORTER.done({"rows": len(results),
                       "withPatches": sum(1 for r in results if r.get("patch")),
                       "dryRun": True})
        return

    # Apply patches
    patched, skipped, failed = 0, 0, 0
    for r in results:
        if not r["patch"]:
            skipped += 1
            continue
        ok = patch_row(supabase_url, service_key, r["id"], r["patch"])
        if ok:
            patched += 1
            print(f"  [patched] {r['name']} ({len(r['patch'])} fields)")
        else:
            failed += 1
            print(f"  [ERROR]   Failed to patch {r['name']} ({r['id']})")

    print(f"\n[enricher] Done — {patched} patched, {skipped} skipped, {failed} failed.")
    if failed:
        REPORTER.fail(f"{failed} row patch(es) failed ({patched} patched, {skipped} skipped) — see patch file {patch_path}")
    else:
        REPORTER.done({"patched": patched, "skipped": skipped, "failed": failed})


if __name__ == "__main__":
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
