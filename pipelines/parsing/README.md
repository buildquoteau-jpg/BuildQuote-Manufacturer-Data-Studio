# pipelines/parsing

Stages 5 and 6 of the Data Studio extraction pipeline.

**Purpose:** Send classified chunks to the Claude API and generate draft staged records. All output is AI-suggested and carries `verification_status = 'pending_review'`. No AI output enters production without human approval.

**Modules:**
- `parse_systems.py` — Stage 5: generate `staged_systems` from system-description chunks
- `parse_components.py` — Stage 6: generate `staged_components`, `staged_system_components`, `staged_system_colours`, `staged_system_profiles`

**Prompts used:**
- `prompts/manufacturer_system_extraction.md`
- `prompts/component_extraction.md`

**Writes (systems):**
- `extraction_runs` (run_type = `parse_systems`)
- `staged_systems`
- `field_verifications` seeded per field

**Writes (components):**
- `extraction_runs` (run_type = `parse_components`)
- `staged_components`
- `staged_system_components`
- `staged_system_colours`
- `staged_system_profiles`
- `field_verifications` seeded per field

## Contract Validation

Parser modules must validate AI output against the defined contracts **before** inserting any staged rows into Supabase.

Validation rules (from `docs/parser-contracts.md`):
1. Reject records missing a required `name` field.
2. Reject records where a numeric field contains a non-numeric value.
3. Reject records where `extraction_confidence` is absent or outside 0.0–1.0.
4. Strip unknown fields before insert — do not pass unrecognised keys to Supabase.
5. If the AI returns prose instead of JSON, log to `extraction_runs.error_message` and set status to `failed`.
6. Warn (do not reject) if `field_sources` is empty — flag the record as low-confidence.

See `docs/parser-contracts.md` for full contracts and example outputs in `samples/expected-outputs/`.

**Status:** Contracts defined. Implementation pending.
