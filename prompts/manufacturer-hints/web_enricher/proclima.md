# Web Enricher Hints — pro clima

**Used by `scripts/web-enricher/run_web_enricher.py` for pro clima enrichment runs.**

---

base_url: https://proclima.com.au
products_listing_url: https://proclima.com.au/overview/
product_path_prefix: /

---

## Site Notes

- WordPress site (NOT Shopify / Next.js). Hero images come from `og:image`, not `__NEXT_DATA__`.
- URL pattern is `/<slug>/` at the root — NOT `/products/<slug>/`.
  The enricher's listing-page scraper filters for `/products/` hrefs, so it will NOT auto-scrape
  this site. Always use `--skip-gpt-match` and rely on the Slug Mappings below.
- PDFs live at `https://proclima.com.au/wp-content/uploads/...`
- Three staged systems have no dedicated product page (will be skipped):
    - `PRESSFIX` — no page found
    - `PRESSFIX XL` — no page found
    - `SOLITEX ADHERO® VISTO strips` — variant/accessory of SOLITEX ADHERO VISTO, no dedicated page

---

## GPT Matching Notes

When matching staged system names to product page URLs:

- Ignore trademark symbols (™, ®) in both the staged name and the slug.
- pro clima uses lowercase slugs with hyphens at the root path (e.g. "INTELLO® PLUS" → `/intello-plus/`).
- Some products have non-obvious slugs — always check Slug Mappings first:
    - `8mm 3D Separation Mesh` → `/3-d-separation-mesh/` (hyphenated "3-d")
    - `ADHERO® VISTO Floor Drain` → `/floor-drain-adhero/` (order reversed)
    - `AEROSANA® VISCONN FLEECE` → `/aerosana-fleece/` (site drops "VISCONN" from this variant)
- If no match exists (accessories, grommets without a dedicated page) return null.

---

## Slug Mappings

Known mappings from staged system name to product page path.
Add new mappings here after each enrichment run to avoid repeat GPT calls.

- "8mm 3D Separation Mesh" : "/3-d-separation-mesh/"
- "ADHERO® VISTO Floor Drain" : "/floor-drain-adhero/"
- "AEROBOXX" : "/aeroboxx/"
- "AEROFIXX" : "/aerofixx/"
- "AEROSANA® VISCONN" : "/aerosana-visconn/"
- "AEROSANA® VISCONN FIBRE" : "/aerosana-visconn-fibre/"
- "AEROSANA® VISCONN FLEECE" : "/aerosana-fleece/"
- "AEROSANA® VISCONN WHITE" : "/aerosana-visconn-white/"
- "CONTEGA® EXO" : "/contega-exo/"
- "CONTEGA® IQ" : "/contega-iq/"
- "CONTEGA® PV" : "/contega-pv/"
- "DA" : "/da/"
- "DUPLEX" : "/duplex/"
- "INSTAABOX" : "/instaabox/"
- "INTELLO® conneX" : "/intello-connex/"
- "INTELLO® PLUS" : "/intello-plus/"
- "KAFLEX mono/duo" : "/kaflex-mono-duo/"
- "KAFLEX multi" : "/kaflex-multi/"
- "KAFLEX post" : "/kaflex-post/"
- "ORCON® CLASSIC" : "/orcon-classic/"
- "ORCON® MULTIBOND" : "/orcon-multibond/"
- "ROFLEX 20" : "/roflex-20/"
- "ROFLEX 30/50/100/150/200/250/300" : "/roflex-30-50-100-150-200-250-300/"
- "SOLITEX ADHERO® FC" : "/solitex-adhero-fc/"
- "SOLITEX ADHERO® VISTO" : "/solitex-adhero-visto/"
- "SOLITEX EXTASANA ADHERO®" : "/solitex-extasana-adhero/"
- "SOLITEX EXTASANA®" : "/solitex-extasana/"
- "SOLITEX MENTO® 5000" : "/solitex-mento-5000/"
- "SOLITEX MENTO® PLUS" : "/solitex-mento-plus/"
- "SOLITEX MENTO® ULTRA" : "/solitex-mento-ultra/"
- "TESCON EXTORA®" : "/tescon-extora/"
- "TESCON EXTORA® PROFIL" : "/tescon-extora-profil/"
- "TESCON EXTOSEAL®" : "/tescon-extoseal/"
- "TESCON® NAIDECK" : "/tescon-naideck/"
- "TESCON® NAIDECK patch" : "/tescon-naideck-patch/"
- "TESCON® PRIMER RP" : "/tescon-primer-rp/"
- "TESCON® PROFIL" : "/tescon-profil/"
- "TESCON® VANA" : "/tescon-vana/"
- "TFLEX®" : "/tflex/"
