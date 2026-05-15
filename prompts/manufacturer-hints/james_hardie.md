# Manufacturer Hint File — James Hardie

**Injected into the parser system prompt for all James Hardie extraction runs.**  
**Do not treat known_systems as a closed list — flag unexpected systems rather than ignoring them.**

---

## Known systems

| System name | Category | Subcategory | Notes |
|---|---|---|---|
| Axon™ Cladding | Exterior cladding | Vertically grooved fibre cement panel | Large-format panel, 1200mm wide, 9mm thick |
| HardiePlank® Lap Siding | Exterior cladding | Fibre cement lap siding | Fixed-length boards, various face widths |
| Linea® Weatherboard | Exterior cladding | Fibre cement weatherboard | Rebated bottom edge |
| HardiePanel® Vertical Cladding | Exterior cladding | Fibre cement sheet panel | Sheet format, vertical orientation |
| HardieFlex® Sheet | General purpose | Fibre cement sheet | Utility/wet area applications |
| HardieSoffit® | Soffit | Fibre cement soffit panel | Vented and non-vented options |
| Stria® Cladding | Exterior cladding | Horizontal groove fibre cement panel | Similar format to Axon but horizontal groove |
| HardieGroove® | Interior lining | Fibre cement lining panel | Interior use |

---

## UOM rules

James Hardie products split into two clear UOM types:

| Product type | UOM | Reasoning |
|---|---|---|
| Large-format panels (Axon, HardiePanel, HardieFlex, HardieSoffit, Stria) | `sheet` | Sold per sheet; builders order by sheet count |
| Lap/weatherboards (HardiePlank, Linea) | `length` | Discrete fixed-length boards; ordered per board |
| Aluminium trims and jointers | `pack` | Sold in packs (typically 5 per pack) |
| Sealing tape | `each` | Sold per roll |

---

## Colour rules

James Hardie products come in two finish types — handle them differently:

**Pre-primed / site-painted (no stocked colours):**  
Axon™ Cladding, HardiePlank® (pre-primed), HardiePanel®, HardieFlex®, HardieSoffit®.  
Do not extract colours for these. Note in `staged_systems.notes`: `"Pre-primed/site-painted — no stocked colours."` Leave `staged_system_colours` empty for this system.

**ColorPlus® Technology (stocked colours):**  
Products with "ColorPlus" in the name or explicitly listed with named colour options. Extract one colour row per colour. Common colour names: Axent Grey, Paperbark, Autumn Leaf, Deep Ocean, Nocturnal, Arctic White, Surf Mist, Shoji White, Woodlands Grey.  
If colour-specific SKU suffixes are listed (e.g. `-AG`, `-PB`), capture them in `sku_suffix`.

---

## Profile naming convention

Use this pattern consistently:

`[System Name] [variant descriptor] — [length]mm`

Examples:
- `Axon™ Cladding 133mm Smooth — 2450mm`
- `Axon™ Cladding 400mm Smooth — 3000mm`
- `HardiePlank® Lap Siding 180mm — 3600mm`
- `Linea® Weatherboard 300mm — 3600mm`

The variant descriptor for Axon is: `[groove_spacing]mm [texture]` (e.g. `133mm Smooth`, `133mm Grained`, `400mm Smooth`).  
The variant descriptor for lap boards is: face width in mm (e.g. `180mm`, `230mm`).

---

## Extra spec fields — use parser_notes

These are confirmed real product fields that do not have dedicated staging columns. Store them as structured JSON inside `parser_notes` on the profile row:

| Field | Source | Example |
|---|---|---|
| `groove_spacing_mm` | Axon spec table | `133` or `400` |
| `surface_texture` | Axon spec table | `"Smooth"` or `"Grained"` |
| `weight_kg` | Product table | `38.1` |
| `coverage_m2` | Product table | `2.94` |
| `face_width_mm` | Lap board spec | `180` |

Example `parser_notes` for an Axon profile:
```json
{
  "source_pages": [24],
  "surface_texture": "Smooth",
  "groove_spacing_mm": 133,
  "weight_kg": 38.1,
  "coverage_m2": 2.94,
  "confidence": 0.98
}
```

---

## Component patterns

### Aluminium trim system
James Hardie aluminium trims and jointers come in pairs: a main extrusion and a connector. Always link both when the connector is listed.

Document connector pairing in `parser_notes`:
- On the main extrusion: `"paired_connector": "<connector_sku>"`
- On the connector: `"paired_jointer": "<main_sku>"`

Known component roles for Axon (use these exact role strings in `staged_system_components.role`):

| Component type | Role string |
|---|---|
| External square corner | `external_corner` |
| Internal corner | `internal_corner` |
| Snap-on corner (2-piece) | `snap_on_corner` |
| Recessed horizontal jointer | `horizontal_jointer` |
| Jointer connector | `horizontal_jointer_connector` |
| Base slimline starter | `base_slimline_starter` |
| Starter connector | `base_slimline_starter_connector` |
| Horizontal h flashing | `horizontal_h_flashing` |
| Horizontal h jointer | `horizontal_h_jointer` |
| Base trim | `base_trim` |
| Base trim connector | `base_trim_connector` |
| Sealing tape | `foam_back_sealing_tape` |

### Sealing tape
SKU 304560 — Hardie™ 50mm Foam Back Sealing Tape 25m roll. UOM: `each`. Pack: 1 roll per unit. Roll length: 25m → `roll_m: 25`.

---

## BAL rating

- Axon™ Cladding: BAL rating is **not stated** on the product pages reviewed (pages 24–25). Do not invent a rating. Set `bal_rating: null` and note in `parser_notes` if the source is silent.
- Other James Hardie systems may state BAL ratings in the technical specification section — extract when explicitly stated.

---

## Worked example — Axon™ Cladding (condensed)

Source: James Hardie Product Catalogue 2026, pages 24–25.

**staged_systems:**

| name | category | subcategory | description | uom | notes |
|---|---|---|---|---|---|
| Axon™ Cladding | Exterior cladding | Vertically grooved fibre cement panel | Vertically grooved fibre cement panel system with stepped shiplap long edge. Available in 133mm Smooth, 133mm Grained, and 400mm Smooth groove spacing. 1200mm wide panels, 9mm thick. | sheet | Pre-primed/site-painted — no stocked colours. |

**staged_system_profiles (sample rows):**

| profile_name | product_code | length_mm | width_mm | thickness_mm | uom | supplier_pack_qty |
|---|---|---:|---:|---:|---|---:|
| Axon™ Cladding 133mm Smooth — 2450mm | 403931 | 2450 | 1200 | 9 | sheet | 30 |
| Axon™ Cladding 400mm Smooth — 2450mm | 404417 | 2450 | 1200 | 9 | sheet | 30 |
| Axon™ Cladding 133mm Smooth — 3000mm | 403933 | 3000 | 1200 | 9 | sheet | 30 |
| Axon™ Cladding 133mm Grained — 3000mm | 404512 | 3000 | 1200 | 9 | sheet | 30 |

**staged_components (sample rows):**

| sku | name | category | uom | pack_qty | role |
|---|---|---|---|---|---|
| 306100 | Hardie™ 9mm Aluminium External Square Corner 3,000mm | Axon accessory | pack | 5 | external_corner |
| 306190 | Hardie™ 9mm Aluminium Recessed Horizontal Jointer | Axon accessory | pack | 5 | horizontal_jointer |
| 306191 | Hardie™ 9mm Aluminium Recessed Horizontal Jointer Connector | Axon accessory | pack | 5 | horizontal_jointer_connector |
| 304560 | Hardie™ 50mm Foam Back Sealing Tape 25m roll | Axon accessory | each | 1 | foam_back_sealing_tape |

**staged_system_colours:** empty — pre-primed/site-painted product, no stocked colours.
