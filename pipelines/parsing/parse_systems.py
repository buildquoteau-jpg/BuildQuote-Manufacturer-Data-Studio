"""
Pipeline stage 5: AI parse — systems.

Purpose:
Send classified document chunks to the Claude API using the system extraction
prompt and generate draft staged_systems records.

All output is AI-suggested. Records are created with verification_status = 'pending_review'.
No staged record enters production without human approval.

Inputs:
- source_document_id (uuid str)
- manufacturer_id (uuid str)
- chunk_types to include: ['system_description', 'product_table', 'specification_table']

Outputs:
- extraction_runs row (run_type = 'parse_systems')
- staged_systems rows (verification_status = 'pending_review')
- field_verifications rows seeded per extracted field (status = 'pending')

Supabase tables written:
- extraction_runs
- staged_systems
- field_verifications

Prompt:
- prompts/manufacturer_system_extraction.md

AI model:
- Anthropic Claude (model TBD — use claude-sonnet-4-6 or latest as default)

Environment variables required:
- ANTHROPIC_API_KEY (server-side only)

TODO:
Implement after Supabase client, Anthropic SDK, and prompt loader are available.
Chunk batching strategy TBD — large documents may need chunked API calls.
Parse AI JSON response carefully — validate schema before writing to Supabase.
"""

# TODO: implement parse_systems(source_document_id, manufacturer_id)
