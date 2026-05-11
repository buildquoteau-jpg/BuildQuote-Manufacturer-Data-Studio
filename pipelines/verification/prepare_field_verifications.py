"""
Pipeline stage 7: Verification preparation.

Purpose:
Ensure every extractable field on a staged record has a corresponding
field_verifications row ready for the human verification UI.

This stage is idempotent. It prepares verification state — it does not verify data.
The human reviewer makes all verification decisions in the UI.

Inputs:
- entity_type (str): 'staged_system' | 'staged_component' | 'staged_system_colour' | etc.
- entity_id (uuid str): the staged record to prepare
- extracted_fields (dict): field_name → extracted_value mapping from the AI parser
- source_chunk_id (uuid str, optional): the chunk the value was extracted from
- source_page_id (uuid str, optional): the page the chunk came from
- source_page_number (int, optional): page number for UI display

Outputs:
- field_verifications rows: one per (entity_type, entity_id, field_name)
  with status = 'pending' and extracted_value populated
- verification_events row for the initial 'seeded' event (optional)

Supabase tables written:
- field_verifications
- verification_events

Key rules:
- Do not overwrite field_verifications rows that have already been reviewed
  (status != 'pending'). Only create rows for fields not yet present.
- Set source_page_id and source_chunk_id on each row — the UI needs these
  to display the correct PDF page beside each field being reviewed.
- extracted_value must be stored as text regardless of the original field type.

TODO:
Implement after Supabase client is available.
Define the canonical field list per entity_type so all expected fields are seeded,
even if the AI parser returned null for some of them.
"""

# TODO: implement prepare_field_verifications(entity_type, entity_id, extracted_fields, ...)
