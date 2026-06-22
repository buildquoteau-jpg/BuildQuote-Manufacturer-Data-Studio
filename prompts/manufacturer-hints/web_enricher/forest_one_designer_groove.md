# Web Enricher Hints — ForestOne Designer Groove

**Used by `scripts/web-enricher/run_web_enricher.py`**

---

base_url: https://forest.one
products_listing_url: https://forest.one/products/our-brands/designergroove/

---

## GPT Matching Notes

- Forest One product URLs do NOT use a `/products/` prefix — slugs go directly off the root (e.g. `forest.one/vj100-ultra-mdf`)
- All three Designer Groove variants are known — use `--skip-gpt-match` with the slug mappings below
- The products listing page uses Magento/custom structure; the enricher scraper will return 0 links (expected — slug mappings cover all systems)

---

## Slug Mappings

- "Designer Groove VJ100" : "/vj100-ultra-mdf"
- "Designer Groove VJ150" : "/vj150-regency"
- "Designer Groove REGENCY150" : "/regency-ultra-mdf"

---

## Hero Image Notes

- Forest One serves product images from `/media/sparsh/product_attachment/` and `/d/e/` paths
- Pages use lazy-loaded SVG placeholders — BeautifulSoup may not capture the real image URL from `<img>` tags
- Known hero image URLs (verified 2026-05-19):
  - VJ150: `https://forest.one/d/e/desg_vj_150.jpg`
  - REGENCY150: `https://forest.one/media/sparsh/product_attachment/desg_regency150.jpg`
  - VJ100: not confirmed — likely `https://forest.one/media/sparsh/product_attachment/desg_vj_100.jpg` (check manually)
- If hero scraping returns null, patch `hero_image_url` manually using the URLs above

---

## Source / Tech Data URLs

All three products share the same brochure PDF:
`https://forest.one/media/sparsh/product_attachment/ForestOne_Designer_Groove_Full_Brochure_-_05.24.pdf`

No per-product installation guide URLs are directly linked on product pages.
The Resources pages (`/installation-and-fabrication-guides`, `/technical-and-safety-data-sheets`) are JS-rendered and cannot be scraped with BeautifulSoup.
