# Prompt: Component Extraction

**Status: placeholder — refine after first real extraction run.**

---

## Purpose

Extract component records and dimension data from a specification table or component list chunk.

## Expected Input

- `manufacturer_name`: string
- `system_name`: string (parent system this chunk belongs to)
- `chunk_text`: the classified text/table content
- `chunk_type`: "component_list" | "specification_table"

## Expected Output

A JSON array of staged component objects:

```json
[
  {
    "name": "Component name",
    "sku": "SKU or product code if present",
    "uom": "unit of measure (e.g. lm, m2, each, roll)",
    "description": "Description if present",
    "length_mm": null,
    "width_mm": null,
    "height_mm": null,
    "thickness_mm": null,
    "depth_mm": null,
    "gauge_mm": null,
    "diameter_mm": null,
    "roll_m": null,
    "weight_kg": null,
    "pieces": null,
    "notes": "Extraction uncertainty or caveats"
  }
]
```

## Dimension Extraction Note

Populate dimension fields only when the source document explicitly states the value.
Do not estimate or calculate dimensions. Leave null if not present.
Use `uom` (unit of measure) not `unit` — the export step handles the rename to production schema.

## Prompt Template

```
You are extracting structured component data from a BuildQuote manufacturer product guide section.

Manufacturer: {{manufacturer_name}}
System: {{system_name}}
Section type: {{chunk_type}}

Content:
{{chunk_text}}

Extract all components listed in this section.
For each component, capture: name, SKU (if present), unit of measure (uom), description, and any dimension values (length_mm, width_mm, height_mm, thickness_mm, depth_mm, gauge_mm, diameter_mm, roll_m, weight_kg, pieces).
Return a JSON array. Do not invent data. If a field is not in the source, set it to null.
```
