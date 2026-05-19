# Extraction hints — ForestOne Designer Groove

## Manufacturer context
- Manufacturer: **ForestOne** (Australian-owned)
- Product line: **Designer Groove** — decorative interior panel, Ultra Moisture-Resistant MDF
- Australian-made: **true** on all systems

## Systems — 3 distinct profiles, each is its own system

| System name | Description |
|---|---|
| Designer Groove VJ100 | Classic V-joint, 100mm centres, 7mm grooves |
| Designer Groove VJ150 | Wider V-joint, 150mm centres, 7mm grooves |
| Designer Groove REGENCY150 | Bold profile, 14mm grooves, 150mm centres |

Each system is sold in 4 sheet lengths — extract these as `system_profiles`, NOT separate systems.

## Profiles (same structure for all 3 systems)

| Length (mm) | Width (mm) | Thickness (mm) | Weight (kg) | VJ100 code | VJ150 code | REGENCY150 code |
|---|---|---|---|---|---|---|
| 2400 | 1200 | 9 | 19.3 | MDCD241209VJP | MDCD241209VJP15 | MDCD241209REGNP |
| 2700 | 1200 | 9 | 21.7 | MDCD271209VJP | MDCD271209VJP15 | MDCD271209REGNP |
| 3000 | 1200 | 9 | 24.2 | MDCD301209VJP | MDCD301209VJP15 | MDCD301209REGNP |
| 3600 | 1200 | 9 | 29.12 | MDCD361209VJP | MDCD361209VJP15 | MDCD361209REGNP |

- Use `product_code` on the profile row for the per-length SKU
- `uom` = `sheet`
- `weight_kg` = per-sheet weight listed above
- `thickness_mm` = 9
- `width_mm` = 1200
- `length_mm` = as above

## Colours
**None.** Product is pre-primed and ready to paint — do not extract any colour rows.

## Components
**None.** The brochure mentions corner/end-join finishing options but explicitly states these are "commonly available from local hardware retailers" — they are not branded ForestOne accessories. Do not extract any components.

## Key system attributes
- `moisture_resistant` = true (Ultra Moisture-Resistant MDF)
- `australian_made` = true
- `sheet_format` = appropriate (these are panel/sheet products)
- Category suggestion: `Interior Panels` or `Wall Panels`
- `double_sided` = false
