# Production Schema Mapping

This document tracks how Data Studio staged records map to production Supabase tables.

**Status: first draft — aligned with `001_initial_extraction_schema.sql`.**

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

## Staged → Production Mapping

### `data_studio_manufacturers` → `manufacturers`

| Data Studio field | Production field | Notes |
|---|---|---|
| `id` | — | Data Studio internal only |
| `production_manufacturer_id` | `manufacturers.id` | Written back after export |
| `name` | `name` | |
| `slug` | `slug` | Auto-generated if absent |
| `website_url` | `website_url` | |
| `logo_url` | `logo_url` | R2 URL mapped to public CDN URL |
| `hero_image_url` | `hero_image_url` | |
| `description` | `description` | |
| `abn` | `abn` | |
| `phone` | `phone` | |

---

### `source_documents` → `catalogue_sources`

| Data Studio field | Production field | Notes |
|---|---|---|
| `id` | — | Data Studio internal only |
| `manufacturer_id` | `manufacturer_id` | |
| `document_name` | `name` | |
| `document_type` | `source_type` | |
| `document_date` | `document_date` | |
| `public_url` | `file_url` | |
| `storage_key` | — | Data Studio internal, not exported |

Every exported system, component, or colour must carry a `catalogue_sources` reference. No anonymous data may enter production.

---

### `staged_systems` → `systems`

| Data Studio field | Production field | Notes |
|---|---|---|
| `production_system_id` | `systems.id` | Written back after export |
| `manufacturer_id` | `manufacturer_id` | Mapped to production manufacturer id |
| `name` | `name` | |
| `product_code` | `product_code` | |
| `slug` | `slug` | |
| `category` | `category` | |
| `subcategory` | `subcategory` | |
| `description` | `description` | |
| `dimensions` | `dimensions` | |
| `length_m` | `length_m` | |
| `double_sided` | `double_sided` | |
| `hero_image_url` | `hero_image_url` | |
| `website_url` | `website_url` | |
| `source_label` | `source_label` | |
| `source_url` | `source_url` | |
| `sheet_format` | `sheet_format` | |
| `fire_rating` | `fire_rating` | |
| `acoustic_rating` | `acoustic_rating` | |
| `moisture_resistant` | `moisture_resistant` | |
| `structural_grade` | `structural_grade` | |
| `install_guide_url` | `install_guide_url` | |
| `tech_data_url` | `tech_data_url` | |
| `sort_order` | `sort_order` | |
| `source_document_id` | `catalogue_sources.id` | Traceability linkage |

---

### `staged_components` → `components`

| Data Studio field | Production field | Notes |
|---|---|---|
| `production_component_id` | `components.id` | Written back after export |
| `manufacturer_id` | `manufacturer_id` | Mapped to production manufacturer id |
| `sku` | `sku` | |
| `name` | `name` | |
| `description` | `description` | |
| `category` | `category` | |
| `uom` | `unit` | **See critical naming note below** |
| `length_mm` | `length_mm` | |
| `width_mm` | `width_mm` | |
| `height_mm` | `height_mm` | |
| `thickness_mm` | `thickness_mm` | |
| `depth_mm` | `depth_mm` | |
| `gauge_mm` | `gauge_mm` | |
| `diameter_mm` | `diameter_mm` | |
| `roll_m` | `roll_m` | |
| `weight_kg` | `weight_kg` | |
| `pieces` | `pieces` | |
| `material` | `material` | |
| `finish` | `finish` | |
| `colour` | `colour` | |
| `profile` | `profile` | |
| `texture` | `texture` | |
| `coverage_m2` | `coverage_m2` | |
| `sort_order` | `sort_order` | |

---

### `staged_system_components` → `system_components`

| Data Studio field | Production field | Notes |
|---|---|---|
| `staged_system_id` | `system_id` | Mapped to production system id |
| `staged_component_id` | `component_id` | Mapped to production component id |
| `role` | `role` | |
| `sort_order` | `sort_order` | |

---

### `staged_system_colours` → `system_colours`

| Data Studio field | Production field | Notes |
|---|---|---|
| `staged_system_id` | `system_id` | Mapped to production system id |
| `colour_name` | `colour_name` | |
| `sku` | `sku` | |
| `image_url` | `image_url` | |
| `is_stocked` | `is_stocked` | |
| `sort_order` | `sort_order` | |

---

### `staged_system_profiles` → `system_profiles`

| Data Studio field | Production field | Notes |
|---|---|---|
| `staged_system_id` | `system_id` | Mapped to production system id |
| `name` | `name` | |
| `product_code` | `product_code` | |
| `dimensions` | `dimensions` | |
| `length_m` | `length_m` | |
| `sheet_format` | `sheet_format` | |
| `sort_order` | `sort_order` | |

---

## Critical Naming Note: `uom` vs `unit`

| Location | Column name |
|---|---|
| Data Studio `staged_components` | `uom` |
| Production `components` | `unit` |
| Production `rfq_draft_items` | `uom` |

Data Studio uses `uom` throughout as the clean internal concept.
The export step must rename `uom` → `unit` when writing to production `components`.
`rfq_draft_items.uom` already matches Data Studio's naming — no rename needed on that path.
Every export script must document this mapping explicitly.

---

## Dimension Fields

These fields are stored on `staged_components` and map to production `components`. They are preserved from extraction because `rfq_draft_items` references them downstream when a builder adds a component to a quote.

| Field | Unit | Maps to |
|---|---|---|
| `length_mm` | millimetres | `components.length_mm` |
| `width_mm` | millimetres | `components.width_mm` |
| `height_mm` | millimetres | `components.height_mm` |
| `thickness_mm` | millimetres | `components.thickness_mm` |
| `depth_mm` | millimetres | `components.depth_mm` |
| `gauge_mm` | millimetres | `components.gauge_mm` |
| `diameter_mm` | millimetres | `components.diameter_mm` |
| `roll_m` | metres | `components.roll_m` |
| `weight_kg` | kilograms | `components.weight_kg` |
| `pieces` | integer count | `components.pieces` |

---

## Source Traceability Rule

Every exported system, component, colour, or profile record must reference a `catalogue_sources` row in production.
No anonymous data may enter production.
`source_documents.id` in Data Studio → `catalogue_sources.id` in production.
The export script is responsible for creating the `catalogue_sources` row first, then using its id as the foreign key on all other exported records.
