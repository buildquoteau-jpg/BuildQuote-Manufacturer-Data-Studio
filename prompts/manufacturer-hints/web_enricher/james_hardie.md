# Web Enricher Hints — James Hardie

**Used by `scripts/web-enricher/run_web_enricher.py` for James Hardie enrichment runs.**

---

base_url: https://www.jameshardie.com.au
products_listing_url: https://www.jameshardie.com.au/products

---

## GPT Matching Notes

When matching staged system names to product page URLs:

- Ignore trademark symbols (™, ®) in both the staged name and the slug.
- James Hardie uses "Scyon" as a brand prefix for some products on the website (e.g. "Axon™ Cladding" maps to `/products/scyon-axon-cladding`).
- Some products are sold under a different marketing name on the website vs the catalogue — prefer the slug/URL that covers the same physical product.
- If a staged system is a sub-variant of a family (e.g. "Stria™ Cladding Fine Texture"), check if the website has one page for the whole family or separate pages per variant.
- Products not listed on /products (e.g. discontinued or commercial-only) will have no match — return null, do not guess.

---

## Slug Mappings

Known mappings from staged system name to product page path.
Add new mappings here after each enrichment run to avoid repeat GPT calls.

Format: "Staged system name" : "/products/slug"

- "Axon Cladding" : "/products/scyon-axon-cladding"
- "Linea Weatherboard" : "/products/scyon-linea-weatherboard"
- "Stria Cladding" : "/products/scyon-stria-cladding"
- "Stria Cladding Fine Texture" : "/products/scyon-stria-cladding"
- "Stria Cladding Smooth" : "/products/scyon-stria-cladding"
- "Matrix Cladding" : "/products/scyon-matrix-cladding"
- "Hardie Axent Trim" : "/products/scyon-axent-trim"
- "Hardie Brushed Concrete Cladding" : "/products/hardie-brushed-concrete-cladding"
- "Hardie Ceramic Tile Underlay" : "/products/james-hardie-ceramic-tile-underlay"
- "Hardie Fine Texture Cladding" : "/products/hardie-fine-texture-cladding"
- "Hardie Flex Sheet" : "/products/hardieflex-sheet"
- "Hardie Gravis Panel Floor" : "/products/hardie-gravis-panel-floor"
- "Hardie Gravis Panel Wall" : "/products/hardie-gravis-panel-wall"
- "Hardie Groove Lining" : "/products/hardiegroove-lining"
- "Hardie Oblique Cladding" : "/products/hardie-oblique-cladding"
- "Hardie Panel Compressed Sheet" : "/products/hardiepanel-compressed-sheet"
- "Hardie Plank Weatherboard" : "/products/hardieplank-weatherboard"
- "Hardie Tex Base Sheet" : "/products/hardietex-system"
- "Hardie Smart ZeroLot Wall System" : "/products/hardiesmart-fire-&-acoustic-wall-systems-zerolot-wall-system"
- "Hardie Deck" : "/products/hardiedeck-system"
- "Hardie Flex Eaves Lining" : "/products/hardieflex-eaves-lining"
- "Hardie Edge Base Trim" : "/accessory/hardieedge-base-trim-3950mm"
- "ExoTec Facade Panel and System" : "/products/exotec-panel-&-system"
- "Primeline Weatherboard" : "/products/primeline-weatherboard"
- "Hardie Secura Flooring" : "/products/hardie-secura-flooring"
- "Hardie Wrap Weather Barrier" : "/products/hardiewrap-weather-barrier"
- "Hardie Break" : "/accessory/hardiebreak"
- "Hardie Aged Care Wall System" : "/products/hardiesmart-fire-&-acoustic-wall-systems-aged-care-wall-system"
- "Hardie Blade Wall System" : "/products/hardiesmart-fire-&-acoustic-wall-systems-blade-wall-system"
- "Hardie Intertenancy Wall System" : "/products/hardiesmart-fire-&-acoustic-wall-systems-intertenancy-wall-system"
- "Hardie Boundary Wall System" : "/products/hardiesmart-fire-&-acoustic-wall-systems-boundary-wall-system"
- "Versilux Lining" : "/products/versilux-lining"
- "RAB Board" : "/products/rab-board"
- "EasyLap Panel" : "/products/easylap-panel"
- "Villaboard Lining" : "/products/villaboard-lining"
- "HardieFlex Sheet" : "/products/hardieflex-sheet"
- "HardieSoffit Sheet" : "/products/hardiesoffit-sheet"

---

## Hero Image Notes

- Hero images are served from Contentful CDN (`images.ctfassets.net`).
- The `og:image` meta tag on James Hardie product pages returns a **site-wide generic badge image** (not product-specific). It must be skipped.
- The script will fall back to scanning `<img>` tags and pick the first `.jpg` from ctfassets.net — these are the lifestyle product photos.
- Do not capture colour swatch images or installation diagram images as the hero.

## Skip Hero Asset IDs

Contentful asset IDs known to be generic/logo images — the script skips these when selecting hero_image_url.

- 4AEyzK0Ut2Q6t8yGndmI9p

---

## Install Guide / Tech Data Sheet Notes

- James Hardie hosts most PDFs through their Technical Library at `/technicalLibrary`, which is JS-rendered.
  Direct PDF links are NOT present in the plain HTML of individual product pages as of 2026-05.
- Because of this, `install_guide_url` and `tech_data_url` will likely remain null after BeautifulSoup extraction.
- The GPT fallback will also return null unless the page HTML changes to include direct links.
- **Recommended approach for PDF URLs**: run a separate Playwright-based scrape of `/technicalLibrary`
  filtered by product name, or manually populate these fields from the Technical Library after promotion.
- If you discover a direct PDF URL pattern (e.g. from the browser network tab on the Technical Library),
  add it to this hints file and update the slug mappings above.

---

## Known PDF URL Patterns (add here when discovered)

None confirmed yet. To find them:
1. Open `/technicalLibrary` in Chrome DevTools → Network tab → filter by `.pdf`
2. Search for the product name and click "Installation Guide"
3. Copy the PDF URL from the network request
4. Add to this file as: `"System Name install" : "https://...pdf"`
