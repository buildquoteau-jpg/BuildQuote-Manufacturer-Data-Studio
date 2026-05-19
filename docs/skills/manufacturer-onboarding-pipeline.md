# Skill: Manufacturer Onboarding Pipeline

End-to-end runbook for bringing a new manufacturer's product catalogue into staging,
enriching it with web data, verifying it, and backing it up before promotion to production.

Sub-skill references:
- [`docs/skills/catalogue-parser-pipeline.md`](catalogue-parser-pipeline.md) — Docling + AI parser detail
- [`docs/skills/web-enricher-pipeline.md`](web-enricher-pipeline.md) — Web enricher detail

---

## Overview

```
PDF catalogue
    │
    ▼
1. Create manufacturer record
    │
    ▼
2. Docling extraction (chunked)
    │
    ▼
3. Review chunks → write parser hints
    │
    ▼
4. AI parser (dry run → live insert)
    │
    ▼
5. Review staging data, check for dups
    │
    ▼
6. Check manufacturer website → compose web enricher slug hints
    │
    ▼
7. Web enricher (dry run → live)
    │
    ▼
8. Confirm all data, no dups
    │
    ▼
9. Backup JSON
    │
    ▼
10. Promote staging → production
```

---

## Step 1 — Create manufacturer record

Insert a row into `data_studio_manufacturers` (local Supabase Studio or SQL):

```sql
INSERT INTO data_studio_manufacturers (name, slug, country)
VALUES ('Manufacturer Name', 'manufacturer-slug', 'AU')
RETURNING id;
```

Copy the returned `id` — you'll use it as `--manufacturer-id` throughout.

Also insert a `catalogue_sources` row and capture its `id` as `source_document_id`:

```sql
INSERT INTO catalogue_sources (manufacturer_id, label, file_name)
VALUES ('<manufacturer_id>', 'Product Catalogue 2026', 'catalogue.pdf')
RETURNING id;
```

---

## Step 2 — Docling extraction (chunked)

Run from repo root using the `.venv-docling` environment.
Use `--chunk-size 7` to keep prompts small and avoid memory crashes.

```powershell
.venv-docling/Scripts/python.exe scripts/docling/extract_docling_chunked.py `
  --input "C:\path\to\catalogue.pdf" `
  --chunk-size 7
```

Output lands in:
```
.local/docling-output/<stem>_chunked_<timestamp>/output.md
```

Each chunk is marked with `<!-- chunk N: pages X-Y -->`.

**If a chunk looks truncated** (missing products you can see in the PDF):
- Re-extract just that page range with `--start-page` / `--end-page` flags
- Use `patch_stage2.py` to insert only the net-new data from the re-extracted chunk

---

## Step 3 — Review chunks, write parser hints

Open `.local/docling-output/.../output.md` and skim each chunk. Look for:

| Issue | Fix |
|---|---|
| Products with unusual UOM (rolls, packs, m²) | Add UOM rule to hints file |
| Colour systems (pre-primed vs ColorPlus) | Add colour rule to hints file |
| Accessories with unclear roles (corner, jointer, tool) | Add component role examples to hints file |
| Products where sub-variants share a page vs have separate pages | Note in hints |
| ™/® symbols in product names | Parser strips automatically — no action needed |

Create the hints file at:
```
prompts/manufacturer-hints/<manufacturer-slug>.md
```

See `prompts/manufacturer-hints/james_hardie.md` as a worked example.

---

## Step 4 — AI parser (dry run first, then live)

**Dry run:**
```powershell
python scripts/parser/run_parser.py `
  --input ".local/docling-output/<run>/output.md" `
  --manufacturer-id "<uuid>" `
  --manufacturer-name "Manufacturer Name" `
  --hints "prompts/manufacturer-hints/<slug>.md" `
  --openai-model "gpt-5.4" `
  --dry-run
```

Review the plan JSON at `.local/parser-dry-run/plan_<timestamp>.json`.
Check: system names, profile counts, component roles, link counts.

**Live insert (remove `--dry-run`):**
```powershell
python scripts/parser/run_parser.py `
  --input ".local/docling-output/<run>/output.md" `
  --manufacturer-id "<uuid>" `
  --manufacturer-name "Manufacturer Name" `
  --hints "prompts/manufacturer-hints/<slug>.md" `
  --openai-model "gpt-5.4"
```

---

## Step 5 — Review staging data, check for dups

Run in Supabase Studio (local) or via SQL:

```sql
-- Count per table
SELECT 'systems' AS t, COUNT(*) FROM staged_systems WHERE manufacturer_id = '<uuid>'
UNION ALL
SELECT 'profiles', COUNT(*) FROM staged_system_profiles ssp
  JOIN staged_systems ss ON ss.id = ssp.staged_system_id WHERE ss.manufacturer_id = '<uuid>'
UNION ALL
SELECT 'components', COUNT(*) FROM staged_components WHERE manufacturer_id = '<uuid>'
UNION ALL
SELECT 'links', COUNT(*) FROM staged_system_components ssc
  JOIN staged_systems ss ON ss.id = ssc.staged_system_id WHERE ss.manufacturer_id = '<uuid>';

-- Check for duplicate system names
SELECT name, COUNT(*) FROM staged_systems
WHERE manufacturer_id = '<uuid>'
GROUP BY name HAVING COUNT(*) > 1;

-- Check for short stub rows (TOC stubs — no profiles)
SELECT ss.name, COUNT(ssp.id) AS profile_count
FROM staged_systems ss
LEFT JOIN staged_system_profiles ssp ON ssp.staged_system_id = ss.id
WHERE ss.manufacturer_id = '<uuid>'
GROUP BY ss.name
HAVING COUNT(ssp.id) = 0;
```

Delete any stub duplicates before proceeding:
```sql
DELETE FROM staged_systems WHERE id IN ('<stub-id-1>', '<stub-id-2>');
```

---

## Step 6 — Check manufacturer website, compose slug hints

Open the manufacturer's product listing page in a browser (e.g. `https://www.manufacturer.com.au/products`).

For each staged system name, find the matching product page URL.
Record the mappings in the web enricher hints file:

```
prompts/manufacturer-hints/web_enricher/<manufacturer-slug>.md
```

Minimum required fields at the top of the hints file:
```
base_url: https://www.manufacturer.com.au
products_listing_url: https://www.manufacturer.com.au/products
```

Then add `## Slug Mappings`:
```
- "System Name" : "/products/slug"
- "Other System" : "/products/other-slug"
```

**Tips:**
- Check the URL in your browser's address bar — copy only the path after the domain
- Some accessories live under `/accessory/` not `/products/` — use whatever the site uses
- Sub-variants (Fine Texture, Smooth) may now have separate pages — verify each one
- Products not on the listing page (discontinued, commercial-only) → leave unmapped, enricher will skip them

See `prompts/manufacturer-hints/web_enricher/james_hardie.md` as a worked example.

---

## Step 7 — Web enricher (dry run first, then live)

**Dry run (hints-only, cheapest):**
```powershell
python scripts/web-enricher/run_web_enricher.py `
  --manufacturer-id "<uuid>" `
  --manufacturer-name "Manufacturer Name" `
  --hints "prompts/manufacturer-hints/web_enricher/<slug>.md" `
  --skip-gpt-match `
  --skip-gpt-pdf `
  --limit 5 `
  --dry-run
```

Review the patch file at `.local/web-enricher-dry-run/patch_<slug>_<timestamp>.json`.
Check: hero images look product-specific (not a generic site badge), URLs are correct.

**Live run in batches:**
```powershell
python scripts/web-enricher/run_web_enricher.py `
  --manufacturer-id "<uuid>" `
  --manufacturer-name "Manufacturer Name" `
  --hints "prompts/manufacturer-hints/web_enricher/<slug>.md" `
  --skip-gpt-match `
  --skip-gpt-pdf `
  --require-null hero_image_url
```

`--require-null hero_image_url` prevents already-patched rows from being re-processed.

If a row is skipped (`no new values`):
- The slug may be a 404 — check the URL in a browser and update the hints file
- Run with `--ids "<uuid>"` to re-target that row after fixing the slug

---

## Step 8 — Confirm all data, no dups

Before backup, run a final check:

```sql
-- All systems should have hero + website URLs
SELECT name, hero_image_url IS NOT NULL AS has_hero, website_url IS NOT NULL AS has_web
FROM staged_systems
WHERE manufacturer_id = '<uuid>'
ORDER BY name;

-- No duplicate names
SELECT name, COUNT(*) FROM staged_systems
WHERE manufacturer_id = '<uuid>'
GROUP BY name HAVING COUNT(*) > 1;
```

Expected: all rows show `has_hero = true`, `has_web = true`, zero duplicates.

---

## Step 9 — Backup JSON

Run the backup script (inline Python using `.env.local` credentials):

```powershell
python -c "
import json, os, requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv('.env.local')
url = os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
MFR_ID = '<uuid>'
MFR_SLUG = 'manufacturer-slug'

def get(table, params):
    r = requests.get(f'{url}/rest/v1/{table}?{params}', headers=headers)
    r.raise_for_status()
    return r.json()

def get_by_system_ids(table, system_ids, batch=5):
    rows = []
    for i in range(0, len(system_ids), batch):
        chunk = ','.join(system_ids[i:i+batch])
        rows += get(table, f'staged_system_id=in.({chunk})&select=*')
    return rows

systems    = get('staged_systems', f'manufacturer_id=eq.{MFR_ID}&select=*')
system_ids = [s['id'] for s in systems]
components = get('staged_components', f'manufacturer_id=eq.{MFR_ID}&select=*')
links      = get_by_system_ids('staged_system_components', system_ids)
profiles   = get_by_system_ids('staged_system_profiles', system_ids)
colours    = get_by_system_ids('staged_system_colours', system_ids)

backup = {
    'meta': {
        'manufacturer_id': MFR_ID,
        'manufacturer_name': MFR_SLUG,
        'backed_up_at': datetime.now().isoformat() + 'Z',
        'counts': {
            'staged_systems': len(systems),
            'staged_components': len(components),
            'staged_system_components': len(links),
            'staged_system_profiles': len(profiles),
            'staged_system_colours': len(colours),
        }
    },
    'staged_systems': systems,
    'staged_components': components,
    'staged_system_components': links,
    'staged_system_profiles': profiles,
    'staged_system_colours': colours,
}

ts = datetime.now().strftime('%Y%m%d')
out = f'.local/{MFR_SLUG}_backup_{ts}.json'
os.makedirs('.local', exist_ok=True)
with open(out, 'w') as f:
    json.dump(backup, f, indent=2)

print(f'Saved: {os.path.abspath(out)}')
print(json.dumps(backup['meta']['counts'], indent=2))
"
```

Output file: `.local/<manufacturer-slug>_backup_YYYYMMDD.json`

---

## Step 10 — Promote staging → production

> **Do not promote until the backup JSON exists and Step 8 checks pass.**

Promotion copies confirmed staging rows into the live production tables
(`systems`, `system_profiles`, `system_colours`, `components`, `system_components`).

Promotion runbook: TBD — will be documented in a separate skill once the promotion
script is built.

---

## Quick checklist

- [ ] Manufacturer row created, `id` noted
- [ ] `catalogue_sources` row inserted, `id` noted
- [ ] Docling extraction complete, chunks reviewed
- [ ] Parser hints file created/updated
- [ ] Parser dry run reviewed — names, profiles, component roles look correct
- [ ] Parser live insert complete
- [ ] Duplicate check passed (zero duplicate system names, zero stub-only rows)
- [ ] Web enricher hints file created with `base_url`, `products_listing_url`, slug mappings
- [ ] Web enricher dry run reviewed — heroes look product-specific
- [ ] Web enricher live run complete — all rows have `hero_image_url` + `website_url`
- [ ] Final SQL verification passed
- [ ] Backup JSON saved to `.local/<slug>_backup_YYYYMMDD.json`
- [ ] Ready for promotion
