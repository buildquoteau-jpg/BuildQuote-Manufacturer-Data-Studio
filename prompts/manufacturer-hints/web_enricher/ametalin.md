# Web Enricher Hints — Ametalin

**Used by `scripts/web-enricher/run_web_enricher.py` for Ametalin enrichment runs.**

---

base_url: https://www.ametalin.com
products_listing_url: https://www.ametalin.com/products/
product_path_prefix: /product/

---

## Site Notes

- WordPress site. Hero images come from `og:image` meta tag.
- Product pages follow the pattern `/product/<slug>/`.
- PDFs live at `https://www.ametalin.com/wp-content/uploads/PDFs/TDS/` — already patched via patch_ametalin_known_urls.py, so `tech_data_url` will already be set. Use `--skip-gpt-pdf` to skip PDF scraping.
- `design_guide_url` is also already set on all rows by the patch script.
- Enricher only needs to fill `hero_image_url`, `website_url`, `source_url`.

---

## GPT Matching Notes

When matching staged system names to product page URLs:

- Ignore trademark symbols (™, ®) when constructing slugs.
- Ametalin uses lowercase hyphenated slugs under `/product/`.
- "Ametalin" prefix is dropped in slugs (e.g. "Ametalin CeaseFire®" → `/product/ceasefire/`).
- "Micro-perforated" typically becomes "micro-perforated" in slugs.
- "xR" becomes "xr" in slugs.
- Drainage Battens product slugs may use "cavity-drainage-battens" and "thermalcav-drainage-battens".

---

## Slug Mappings

Known mappings from staged system name to product page path.

- "Ametalin CeaseFire®"                  : "/product/ceasefire/"
- "FireSark®"                             : "/product/firesark/"
- "FireSark® Micro-perforated"            : "/product/firesark-micro-perforated/"
- "SilverSark® HVB"                       : "/product/silversark-hvb/"
- "SilverSark® TRE"                       : "/product/silversark-tre/"
- "SilverSark® HD"                        : "/product/silversark-hd/"
- "SilverSark® XHD"                       : "/products/silversark/"
- "SilverSark® xR HD"                     : "/products/silversark-xr/"
- "SilverSark® xR XHD"                    : "/products/silversark-xr/"
- "SilverWrap® LD"                        : "/products/silverwrap/"
- "SilverWrap® LD Micro-perforated"       : "/products/silverwrap/"
- "SilverWrap® MD"                        : "/products/silverwrap/"
- "SilverWrap® MD Micro-perforated"       : "/products/silverwrap/"
- "SilverWrap® HD Micro-perforated"       : "/products/silverwrap/"
- "SilverWrap® XHD Micro-perforated"      : "/products/silverwrap/"
- "SilverWrap® xR HD Micro-perforated"    : "/products/silverwrap/"
- "VapourTech® RWC Roof Wall Commercial"  : "/product/vapourtech-rwc/"
- "VapourTech® Wall"                      : "/product/vapourtech-wall/"
- "VapourTech® Brane® VHP"               : "/product/vapourtech-brane-vhp/"
- "ThermalBreak®"                         : "/product/thermalbreak/"
- "ThermalLiner™"                         : "/product/thermalliner/"
- "SilverFloor®"                          : "/product/silverfloor/"
- "ThermalFloor™"                         : "/product/thermalfloor/"
- "Ametalin Cavity Drainage Battens™"     : "/product/cavity-drainage-battens/"
- "Ametalin ThermalCav™ Drainage Battens" : "/products/ametalin-thermalcav-drainage-battens/"
