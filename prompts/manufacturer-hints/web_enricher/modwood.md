# Web Enricher Hints — Modwood

**Used by `scripts/web-enricher/run_web_enricher.py` for Modwood enrichment runs.**

---

base_url: https://www.modwood.com.au
products_listing_url: https://www.modwood.com.au/product

---

## GPT Matching Notes

When matching staged system names to product page URLs:

- Ignore trademark symbols (™, ®) — e.g. "Flame Shield®" matches `/products/flame-shield`
- Modwood uses plain product names as slugs (no brand prefix)
- "ModWood Natural Grain Collection" and "ModWood Xtreme Guard Collection" are the two main decking families
- "ModWood Mini Board / Screening" may appear as just "Mini Board" or "Screening" on the website
- Products not listed on /products will have no match — return null, do not guess

---

## Slug Mappings

Known mappings from staged system name to product page path.
Add new mappings here after each enrichment run to avoid repeat GPT calls.

Format: "Staged system name" : "/products/slug"

- "ModWood Natural Grain Collection" : "/product/natural-grain-collection-composite-decking/"
- "ModWood Xtreme Guard Collection" : "/product/modwood-xtreme-guard/"
- "ModWood Flame Shield" : "/product/flame-shield/"
- "ModWood Marina Board" : "/product/marina/"
- "ModWood Mini Board / Screening" : "/product/screening/"

---

## Hero Image Notes

- Use the `og:image` meta tag first — Modwood product pages typically have product-specific og:image values
- If og:image returns the site logo or a generic image, fall back to the first large `<img>` tag within the main content area
- Do not capture colour swatch thumbnails or installation diagram images as the hero

---

## Install Guide / Tech Data Sheet Notes

- Modwood hosts installation guides at `www.modwood.com.au` — PDF links are typically present in plain HTML
- Look for anchor tags containing "fixing instructions", "installation guide", or "technical data" in the href or link text
- Known PDF pattern: `https://www.modwood.com.au/wp-content/uploads/...pdf`
- `install_guide_url` should point to the fixing instructions PDF
- `tech_data_url` should point to the product specification/technical data sheet PDF

---

## Manual Hero Image Overrides

For pages where og:image is absent, use these confirmed hero images:

- "ModWood Natural Grain Collection" : "https://www.modwood.com.au/wp-content/uploads/2025/09/SG-137-Roof-Top-Pool-Darlinghurst-NSW-03-scaled.png"
- "ModWood Xtreme Guard Collection" : "https://www.modwood.com.au/wp-content/uploads/2025/05/XTG-Grooved-Sandy-Bay.jpg.webp"
- "ModWood Flame Shield" : "https://www.modwood.com.au/wp-content/uploads/2025/09/Bushfire-image-scaled.jpg.webp"

---

## Known PDF URL Patterns (add here when discovered)

None confirmed yet. Check individual product pages for direct PDF links in the page HTML.
