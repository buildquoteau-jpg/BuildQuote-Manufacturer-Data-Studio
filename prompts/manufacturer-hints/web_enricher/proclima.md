# Web Enricher Hints — pro clima

**Used by `scripts/web-enricher/run_web_enricher.py` for pro clima enrichment runs.**

---

base_url: https://proclima.com.au
products_listing_url: https://proclima.com.au/products

---

## GPT Matching Notes

When matching staged system names to product page URLs:

- Ignore trademark symbols (™, ®) in both the staged name and the slug.
- pro clima uses lowercase slugs with hyphens (e.g. "INTELLO® PLUS" → `/products/intello-plus`).
- Some products have a series page (e.g. SOLITEX MENTO family). Prefer the most specific URL if one exists.
- Components (tapes, tools, grommets, adhesives) may also have individual product pages — they don't appear as `staged_systems` so don't try to match them.
- If no match exists (accessories, grommets without a dedicated page) return null.

---

## Slug Mappings

Known mappings from staged system name to product page path.
Add new mappings here after each enrichment run to avoid repeat GPT calls.

Format: "Staged system name" : "/products/slug"

