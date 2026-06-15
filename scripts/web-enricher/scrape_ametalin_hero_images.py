#!/usr/bin/env python3
"""
scrape_ametalin_hero_images.py

Uses Playwright (headless Chromium) to scrape hero_image_url for all Ametalin
staged_systems that have a website_url but no hero_image_url.

Extracts: og:image meta tag, falling back to the first large <img> in the
.fl-photo-content or .wp-block-cover elements.

Usage:
    python scripts/web-enricher/scrape_ametalin_hero_images.py \
        --manufacturer-id d0bbc37e-b21b-433a-8f7f-5269a862de97 [--dry-run]
"""

import argparse, os, json, urllib.request, urllib.parse
from datetime import datetime, timezone

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def _headers():
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_systems(manufacturer_id: str) -> list[dict]:
    url = (
        f"{SUPABASE_URL}/rest/v1/staged_systems"
        f"?manufacturer_id=eq.{urllib.parse.quote(manufacturer_id)}"
        f"&hero_image_url=is.null"
        f"&website_url=not.is.null"
        f"&select=id,name,website_url"
        f"&limit=100"
    )
    req = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def patch_hero(system_id: str, hero_url: str) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/staged_systems?id=eq.{urllib.parse.quote(system_id)}"
    data = json.dumps({"hero_image_url": hero_url}).encode()
    headers = {**_headers(), "Prefer": "return=minimal"}
    req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status in (200, 204)
    except Exception as e:
        print(f"    [error] patch failed: {e}")
        return False


def scrape_hero(page, url: str) -> str | None:
    try:
        page.goto(url, wait_until="load", timeout=20000)
        page.wait_for_timeout(1000)

        hero = page.evaluate("""() => {
            const isLogo = (src) => src.toLowerCase().includes('logo');

            // 1. og:image meta (skip if it's the logo)
            const og = document.querySelector('meta[property="og:image"]');
            if (og && og.content && og.content.startsWith('http') && !isLogo(og.content))
                return og.content;

            // 2. size-full wp image — the product hero, not the logo
            const full = document.querySelector('img.size-full');
            if (full && full.src && full.src.startsWith('http') && !isLogo(full.src))
                return full.src;

            // 3. fl-photo-content images, skipping logos
            const fls = Array.from(document.querySelectorAll('.fl-photo-content img'));
            for (const img of fls) {
                if (img.src && img.src.startsWith('http') && !isLogo(img.src))
                    return img.src;
            }

            // 4. any large img in main content, skipping logos
            const imgs = Array.from(document.querySelectorAll('.fl-row img, .entry-content img'));
            for (const img of imgs) {
                if (img.src && img.src.startsWith('http') && !isLogo(img.src) && img.naturalWidth > 300)
                    return img.src;
            }
            return null;
        }""")

        return hero if hero else None
    except Exception as e:
        print(f"    [warn] could not load {url}: {e}")
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manufacturer-id", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not SUPABASE_URL or not SERVICE_KEY:
        print("[error] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        return

    print(f"\n[hero-scraper] Fetching systems without hero_image_url...")
    rows = fetch_systems(args.manufacturer_id)
    print(f"[hero-scraper] {len(rows)} rows to process\n")

    if not rows:
        print("[hero-scraper] Nothing to do.")
        return

    # Deduplicate URLs — some products share a page
    url_to_rows: dict[str, list[dict]] = {}
    for row in rows:
        url_to_rows.setdefault(row["website_url"], []).append(row)

    mode = "DRY RUN" if args.dry_run else "LIVE"
    patched = failed = 0

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_extra_http_headers({"User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )})

        for page_url, page_rows in url_to_rows.items():
            names = ", ".join(r["name"] for r in page_rows)
            print(f"  [fetch] {page_url}")
            print(f"          -> {names}")

            hero = scrape_hero(page, page_url)

            if not hero:
                print(f"    [warn] no hero image found")
                failed += len(page_rows)
                continue

            print(f"    [hero] {hero}")

            for row in page_rows:
                if args.dry_run:
                    print(f"    [dry]  would patch '{row['name']}'")
                    patched += 1
                else:
                    ok = patch_hero(row["id"], hero)
                    if ok:
                        print(f"    [ok]   patched '{row['name']}'")
                        patched += 1
                    else:
                        failed += 1

        browser.close()

    print(f"\n[done] {mode}")
    print(f"  patched: {patched}")
    if failed:
        print(f"  failed:  {failed}")


if __name__ == "__main__":
    main()
