# prompts

Prompt templates used by the AI parsing stage of the Data Studio pipeline.

| File | Purpose |
|---|---|
| `manufacturer_system_extraction.md` | Extract system-level records from classified chunks |
| `component_extraction.md` | Extract component records and dimension data from specification tables |
| `verification_assistant.md` | Assist human reviewers in spotting inconsistencies during verification |

## Usage

These prompts are loaded by the `pipelines/parsing/` module and injected with chunk content at runtime.

## Status

Placeholder content. To be refined once real extraction runs are tested against sample documents.
