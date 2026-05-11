"""
Pipeline stage 6: AI parse — components, colours, profiles, relationships.

Purpose:
Send classified document chunks to the Claude API using the component extraction
prompt and generate draft staged_components, staged_system_components,
staged_system_colours, and staged_system_profiles records.

All output is AI-suggested. Records are created with verification_status = 'pending_review'.
No staged record enters production without human approval.

Inputs:
- source_document_id (uuid str)
- manufacturer_id (uuid str)
- staged_system_id (uuid str, optional): link components to a known system
- chunk_types to include: ['product_table', 'specification_table', 'accessory_list', 'colour_chart']

Outputs:
- extraction_runs row (run_type = 'parse_components')
- staged_components rows
- staged_system_components rows (if staged_system_id provided)
- staged_system_colours rows
- staged_system_profiles rows
- field_verifications rows seeded per extracted field (status = 'pending')

Supabase tables written:
- extraction_runs
- staged_components
- staged_system_components
- staged_system_colours
- staged_system_profiles
- field_verifications

Prompt:
- prompts/component_extraction.md

AI model:
- Anthropic Claude (model TBD — use claude-sonnet-4-6 or latest as default)

Key field: uom
- Store unit of measure as 'uom' in staged_components.
- Do NOT rename to 'unit' here — the export step handles that mapping.
- See docs/production-schema-mapping.md for the uom → unit export mapping.

Dimension fields to extract where present:
- length_mm, width_mm, height_mm, thickness_mm, depth_mm,
  gauge_mm, diameter_mm, roll_m, weight_kg, pieces

Environment variables required:
- ANTHROPIC_API_KEY (server-side only)

TODO:
Implement after Supabase client, Anthropic SDK, and prompt loader are available.
Validate that dimension fields are numeric before writing — reject strings.
Handle null gracefully — many components will have partial dimension data.
"""

# TODO: implement parse_components(source_document_id, manufacturer_id, staged_system_id=None)
