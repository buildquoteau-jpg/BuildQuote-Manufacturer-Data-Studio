# Web Enricher Pipeline

Fills `hero_image_url`, `website_url`, `source_url`, `install_guide_url`, `tech_data_url`
in `staged_systems` from the manufacturer's official website.

Runs **after** the PDF catalogue parser has populated the core product data.
Only writes to columns that are currently NULL — safe to re-run.

---

## Script

```
scripts/web-enricher/run_web_enricher.py
```

Dependencies (add to your venv if not already present):
```bash
pip install requests beautifulsoup4 openai httpx python-dotenv
```

---

## Approach

**Step 1 — Match** (one GPT call, or hints-only if slugs are known):
The script fetches the manufacturer's `/products` listing page, scrapes all product links,
then uses GPT to match each staged system name to a product page URL.
Known mappings in the hints file skip GPT entirely.

**Step 2 — Scrape** (per product page, no AI needed for hero images):
Each matched product page is fetched with `requests` + parsed with `BeautifulSoup`.
- `hero_image_url` → `og:image` meta tag (most reliable)
- `website_url` + `source_url` → the product page URL
- `install_guide_url` + `tech_data_url` → scanned from anchor tags (PDF links)

**Step 3 — GPT fallback for PDFs** (optional, per page):
If BeautifulSoup finds no PDF links, the page's link/resource text is sent to GPT
to identify any installation guide or tech data sheet URLs.
Use `--skip-gpt-pdf` to disable this and save tokens.

---

## Usage

### Always run dry first
```bash
python scripts/web-enricher/run_web_enricher.py \
    --manufacturer-id "6092e3a5-a542-4869-a2b2-6fc34cc82c83" \
    --manufacturer-name "James Hardie" \
    --hints "prompts/manufacturer-hints/web_enricher/james_hardie.md" \
    --limit 5 \
    --dry-run
```

### Process specific rows by ID
```bash
python scripts/web-enricher/run_web_enricher.py \
    --manufacturer-id "6092e3a5-a542-4869-a2b2-6fc34cc82c83" \
    --manufacturer-name "James Hardie" \
    --hints "prompts/manufacturer-hints/web_enricher/james_hardie.md" \
    --ids "uuid-1,uuid-2,uuid-3" \
    --dry-run
```

### Write to local Supabase (remove --dry-run)
```bash
python scripts/web-enricher/run_web_enricher.py \
    --manufacturer-id "6092e3a5-a542-4869-a2b2-6fc34cc82c83" \
    --manufacturer-name "James Hardie" \
    --hints "prompts/manufacturer-hints/web_enricher/james_hardie.md" \
    --limit 10
```

### Hints-only run (no GPT calls at all — cheapest)
```bash
python scripts/web-enricher/run_web_enricher.py \
    --manufacturer-id "6092e3a5-a542-4869-a2b2-6fc34cc82c83" \
    --manufacturer-name "James Hardie" \
    --hints "prompts/manufacturer-hints/web_enricher/james_hardie.md" \
    --skip-gpt-match \
    --skip-gpt-pdf \
    --dry-run
```

---

## Flags

| Flag | Purpose |
|---|---|
| `--dry-run` | Print table + save patch JSON, skip Supabase writes |
| `--limit N` | Process only the first N unresolved rows (token control) |
| `--ids a,b,c` | Target specific staged_system UUIDs |
| `--skip-gpt-match` | Use hints slug mappings only, no GPT name matching |
| `--skip-gpt-pdf` | No GPT fallback for PDF link extraction |
| `--openai-model` | Override model (default: `gpt-5.4`) |

---

## Output

**Console**: table of proposed patches per row — name, matched URL, field values.

**Patch file**: always saved to `.local/web-enricher-dry-run/patch_<timestamp>.json`
even on a live run (audit trail). Review this before the first live run.

---

## Hints file

Each manufacturer has its own hints file under:
```
prompts/manufacturer-hints/web_enricher/<manufacturer>.md
```

The hints file contains:
- `base_url` and `products_listing_url` — required, script will exit without them
- `## Slug Mappings` — known name → `/products/slug` pairs (avoids GPT for known products)
- GPT matching notes — disambiguation rules injected into the match prompt
- Hero image notes — CDN patterns, which image to prefer
- PDF notes — known patterns or manual fallback instructions

**After each run**: copy confirmed slug mappings from the console output into the hints file
so future runs skip GPT for those products.

---

## James Hardie specifics

- **hero_image_url**: reliable via `og:image`. Always populated if the page is reachable.
- **website_url / source_url**: always populated once matched.
- **install_guide_url / tech_data_url**: James Hardie's Technical Library is JS-rendered —
  direct PDF links are not in the plain HTML. These will likely remain null after scraping.
  
  To populate PDF URLs: open the Technical Library in Chrome DevTools, search by product,
  capture the PDF URL from the Network tab, then add it manually to the hints file or
  directly update the row in Supabase Studio.

---

## Token cost estimate

| Run type | GPT calls | Approx tokens |
|---|---|---|
| 34 rows, hints only | 0 | 0 |
| 34 rows, GPT match only | 1 | ~2k–4k |
| 34 rows, match + PDF fallback | 1 + up to 34 | ~10k–20k |
| 5-row limit with both GPT steps | 1 + up to 5 | ~3k–6k |

Use `--limit 5` for initial test runs. Add slug mappings to hints after each run
to reduce GPT usage on subsequent runs.

---

## Adding a new manufacturer

1. Create `prompts/manufacturer-hints/web_enricher/<manufacturer>.md`
   with `base_url`, `products_listing_url`, and any known slug mappings.
2. Run with `--dry-run --limit 5` to validate matching.
3. Inspect the patch file in `.local/web-enricher-dry-run/`.
4. Add confirmed slug mappings to the hints file.
5. Run without `--dry-run` in batches.
