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

**Status:** Placeholder only. See `docs/extraction-pipeline.md` and `prompts/`.
