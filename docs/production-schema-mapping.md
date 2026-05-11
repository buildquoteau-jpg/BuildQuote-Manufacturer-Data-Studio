# Production Schema Mapping

This document tracks how Data Studio staged records will map to production Supabase tables.

**Status: placeholder — to be refined as staging schema is designed.**

---

## Production Tables (reference)

| Table | Purpose |
|---|---|
| `manufacturers` | Manufacturer identity, branding, contact info |
| `systems` | A roofing/cladding system (e.g. "Trimdek 0.42") |
| `system_colours` | Colours available for a system |
| `components` | Individual components/products within a system |
| `system_components` | Junction: which components belong to which system |
| `system_profiles` | Profile/section shapes associated with a system |
| `catalogue_sources` | Source document metadata (traceability back to original PDF) |
| `rfq_draft_items` | (downstream, RFQ repo) — line items referencing components |

---

## Planned Staged → Production Mapping

### `staged_manufacturers` → `manufacturers`

| Staged field | Production field | Notes |
|---|---|---|
| `name` | `name` | |
| `slug` | `slug` | auto-generated if absent |
| `logo_url` | `logo_url` | stored in R2, mapped to public URL |

### `staged_systems` → `systems`

| Staged field | Production field | Notes |
|---|---|---|
| `manufacturer_id` | `manufacturer_id` | foreign key to approved manufacturer |
| `name` | `name` | |
| `description` | `description` | |
| `source_id` | `catalogue_sources.id` | traceability linkage |

### `staged_components` → `components`

| Staged field | Production field | Notes |
|---|---|---|
| `name` | `name` | |
| `uom` | `unit` | **see note below** |
| `sku` | `sku` | |
| `description` | `description` | |

### `staged_system_colours` → `system_colours`

| Staged field | Production field | Notes |
|---|---|---|
| `system_id` | `system_id` | |
| `colour_name` | `colour_name` | |
| `colour_code` | `colour_code` | |

---

## Important Naming Note: `uom` vs `unit`

The production `components` table uses the column name `unit`.
The `rfq_draft_items` table uses `uom`.

Data Studio should treat `uom` as the clean internal concept throughout staging.
The export step must map `uom` → `unit` when writing to the production `components` table.
Document this mapping explicitly in any export script.

---

## RFQ Draft Item Dimension Fields

These fields on `rfq_draft_items` are important downstream consumers of component data.
Data Studio extraction should attempt to capture these where present in source documents:

| Field | Description |
|---|---|
| `length_mm` | Length in millimetres |
| `width_mm` | Width in millimetres |
| `height_mm` | Height in millimetres |
| `thickness_mm` | Thickness in millimetres |
| `depth_mm` | Depth in millimetres |
| `gauge_mm` | Gauge/thickness of sheet material in millimetres |
| `diameter_mm` | Diameter in millimetres |
| `roll_m` | Roll length in metres |
| `weight_kg` | Weight in kilograms |
| `pieces` | Piece count (integer) |

These fields live on `rfq_draft_items`, not directly on `components`, but knowing them at extraction time allows richer system-card data to flow through to RFQ line items.

---

## Source Traceability Rule

Every exported system, component, or colour record must reference a `catalogue_sources` row.
No anonymous data may enter production.
`catalogue_sources.id` links back to the original source document in R2.
