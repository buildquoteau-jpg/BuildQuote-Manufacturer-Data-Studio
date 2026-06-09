# Manufacturer Hint File — Modwood

**Injected into the parser system prompt for all Modwood extraction runs.**  
**Do not treat known_systems as a closed list — flag unexpected systems rather than ignoring them.**

---

## Known systems

| System name | Category | Subcategory | Notes |
|---|---|---|---|
| ModWood Natural Grain Collection | Decking | Wood composite decking | Original collection; 88mm and 137mm profiles; 4 colours |
| ModWood Xtreme Guard Collection | Decking | Capped wood composite decking | 4-face capped; 137mm only; 5 multi-chromatic colours (names not in source) |
| ModWood Flame Shield® | Decking | Fire-rated wood composite decking | BAL-40 rated; 137 x 23mm profile only; same NGC colours |
| ModWood Marina Board | Decking | Marine/pool composite decking | 137 x 32mm; suitable for docks/pontoons; not for immersion |
| ModWood Mini Board / Screening | Screening | Wood composite screening | 68 x 17mm; not suitable for use as decking |

---

## UOM rules

All Modwood decking products are sold by the **lineal metre** or in **fixed-length packs**. Use `length` as UOM for all decking profiles.

| Product type | UOM | Notes |
|---|---|---|
| Decking boards (all profiles) | `length` | Fixed lengths ~5.4m (decking) or 4.2–4.8m (marina/mini) |
| Fixing clips | `box` | Sold in boxes of 40 |
| Packer strips | `box` | Sold in boxes of 20 |

---

## Colour rules

**Natural Grain Collection — 4 stocked colours:**
- Black Bean (brown/black; contains intermittent black pigment)
- Jarrah (red; contains intermittent black pigment)
- Silver Gum (silver/grey; contains intermittent black pigment)
- Sahara (burnt orange)

Finishes: each colour available in **Smooth** (darker face) and **Brushed** (lighter, sanded face). Both faces have the same emboss/grip. Do not create separate colour rows per finish — note as `"finishes": ["Smooth", "Brushed"]` in `parser_notes`.

**Xtreme Guard Collection — 5 multi-chromatic colours:** Names are not stated in the source document. Set colour names to `null` and note `"sku_source": "not_in_catalogue"` in `parser_notes`. Do not invent colour names.

**Flame Shield® — same colours as NGC:** Black Bean, Jarrah, Silver Gum, Sahara.

**Marina Board & Mini Board — colours not stated in source.** Leave `staged_system_colours` empty; note `"colour_source": "not_in_catalogue"`.

---

## Profile naming convention

Use this pattern consistently:

`[System Name] [width]mm × [thickness]mm — [length]mm`

Examples:
- `ModWood Natural Grain Collection 88mm × 23mm — 5400mm`
- `ModWood Natural Grain Collection 137mm × 23mm — 5400mm`
- `ModWood Xtreme Guard Collection 137mm × 23mm Square — 5400mm`
- `ModWood Xtreme Guard Collection 137mm × 23mm Grooved — 5400mm`
- `ModWood Flame Shield® 137mm × 23mm — 5400mm`
- `ModWood Marina Board 137mm × 32mm — 4200mm`
- `ModWood Mini Board 68mm × 17mm — 4800mm`

---

## Dimensional data (from spec table in source)

| System | Width mm | Thickness mm | Std length mm | Weight kg/lm | Min ground clearance mm | Max joist centres mm |
|---|---|---|---|---|---|---|
| Natural Grain Collection (88mm) | 88 | 23 | 5400 | 2.3 | 300 | 450 |
| Natural Grain Collection / Xtreme Guard (137mm) | 137 | 23 | 5400 | 3.6 | 150 | 450 |
| Flame Shield® | 137 | 23 | 5400 | 3.6 | 300 | 450 |
| Marina Board | 137 | 32 | 4200 | 5.0 | 300 | 600 |
| Mini Board / Screening | 68 | 17 | 4800 | 1.4 | 150 | 800 |

Store `weight_kg_per_lm`, `min_ground_clearance_mm`, and `max_joist_centres_mm` in `parser_notes` on the profile row.

---

## SKU notes

**No product SKUs are available in the source documents.** Do not invent SKU codes. Set `product_code: null` for all board profiles. Note `"sku_source": "not_in_catalogue"` in `parser_notes`. SKUs may be available from distributor ITI on request.

**Fixing accessory SKUs are available** (from SnapLoc/KlevaKlip docs):

| SKU | Name | Box qty | Suitability |
|---|---|---|---|
| KSL137N | ModWood Snap-LOC Clip 137mm | 40 | 137mm NGC and XTG decking |
| KSL88N | ModWood Snap-LOC Clip 88mm | 40 | 88mm NGC decking |
| KPacker | ModWood 4mm Continuous Packer | 20 | All profiles with Snap-LOC |
| KT137G | KlevaKlip Metal Clip 137mm Galvanised | 40 | 137mm Flame Shield and NGC |
| KT137S | KlevaKlip Metal Clip 137mm Stainless | 40 | 137mm Flame Shield and NGC |
| KT88G | KlevaKlip Metal Clip 88mm Galvanised | 40 | 88mm NGC |
| KT88S | KlevaKlip Metal Clip 88mm Stainless | 40 | 88mm NGC |

---

## BAL rating

- **Flame Shield®**: BAL-40 explicitly stated. Also rated for BAL-12.5, BAL-19, BAL-29.
- **All other systems**: BAL rating not stated in source. Set `bal_rating: null`.

---

## Extra spec fields — use parser_notes

| Field | Example |
|---|---|
| `weight_kg_per_lm` | `2.3` |
| `min_ground_clearance_mm` | `300` |
| `max_joist_centres_mm` | `450` |
| `anti_slip_rating` | `"R11"` (137mm profiles) or `"R10"` (88mm) |
| `finishes` | `["Smooth", "Brushed"]` |
| `sku_source` | `"not_in_catalogue"` |
| `source_pages` | `[1, 2, 3]` |
| `confidence` | `0.90` |

---

## Component patterns

Link fixing accessories as components to their compatible systems:

| Component role | Role string |
|---|---|
| Concealed clip (snap-loc) | `concealed_clip` |
| Concealed clip (metal galvanised) | `metal_clip_galvanised` |
| Concealed clip (metal stainless) | `metal_clip_stainless` |
| Continuous packer | `packer` |

**Coverage note:** 1 box of 40 clips covers 9.5–10 sqm at 450mm joist centres. Store as `"coverage_sqm_per_box": 9.5` in `parser_notes` on the component.
