# Web Enricher Hints — JDS Metal Doorframes

**Used by `scripts/web-enricher/run_web_enricher.py`**

---

base_url: https://www.jdsmetaldoorframes.com.au
products_listing_url: https://www.jdsmetaldoorframes.com.au

---

## GPT Matching Notes

- JDS website uses flat URL paths with no `/products/` prefix (e.g. `/regalframe`, `/jds-deluxe`)
- Use `--skip-gpt-match` — all slug mappings are hardcoded below
- Some systems share a product page (knockdown variants are on the same page as their welded counterpart)
- Site is Wix-hosted (`static.wixstatic.com` CDN) — hero images may only be captured via `og:image` meta tag

---

## Slug Mappings

- "RegalFrame" : "/regalframe"
- "JDS Deluxe Frame" : "/jds-deluxe"
- "Negative Rebate Frame" : "/residential-negative-rebate"
- "RegalFrame Knockdown" : "/regalframe"
- "JDS Deluxe Knockdown" : "/jds-deluxe"
- "TenBend Knockdown" : "/jds-modular"
- "Cavity Slider Knockdown Kit" : "/cavity-sliders"
- "Standard Split Frame" : "/split-frame"
- "3 Section Split Frame" : "/3-section-split"
- "TenBend 3 Section Split Frame" : "/3-section-split"
- "Commercial Frame" : "/commercial-doorframes"
- "Meter Boxes" : "/meter-boxes"

---

## Hero Image Notes

- Images served from Wix CDN (`static.wixstatic.com`) — not in the enricher's default CDN domain list
- The scraper will attempt `og:image` meta tag as fallback — this is the most likely source of heroes on Wix sites
- If heroes come back null, patch `hero_image_url` manually from the product pages
