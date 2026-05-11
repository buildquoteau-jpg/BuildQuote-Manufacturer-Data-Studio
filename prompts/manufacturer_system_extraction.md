# Prompt: Manufacturer System Extraction

**Status: placeholder — refine after first real extraction run.**

---

## Purpose

Extract one or more BuildQuote system records from a classified chunk of manufacturer product guide content.

## Expected Input

- `manufacturer_name`: string
- `source_document`: filename or catalogue_source_id
- `chunk_text`: the classified text/table content for this section
- `chunk_type`: "system_description" | "specification_table" | "colour_chart" | "component_list"

## Expected Output

A JSON array of staged system objects:

```json
[
  {
    "name": "System name as stated in document",
    "description": "Brief description if present",
    "notes": "Any caveats, conditions, or extraction uncertainty"
  }
]
```

## Prompt Template

```
You are extracting structured manufacturer system data from a BuildQuote product guide section.

Manufacturer: {{manufacturer_name}}
Source: {{source_document}}
Section type: {{chunk_type}}

Content:
{{chunk_text}}

Extract all roofing/cladding systems described in this section.
Return a JSON array. Each object should include: name, description (if present), and notes (flag any uncertainty).
Do not invent data. If a field is not present in the source, omit it.
```
