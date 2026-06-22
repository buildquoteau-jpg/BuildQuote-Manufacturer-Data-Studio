"""
Pipeline stage 4: Chunk classification.

Purpose:
Classify raw Docling-extracted document chunks by content type.
The chunk_type assigned here determines which AI parsing prompt will be used
in stages 5 and 6.

Inputs:
- source_document_id (uuid str)
- extraction_run_id (uuid str): the docling_extract run that produced the chunks

Outputs:
- document_chunks rows updated with:
    chunk_type  — one of the defined types below
    heading     — section heading if detectable
    confidence  — classifier confidence score (0.0 – 1.0)
- extraction_runs row (run_type = 'chunk_document')

Chunk types:
- product_table       : structured product/component data table
- system_description  : prose description of a roofing/cladding system
- accessory_list      : list of accessories or add-ons
- specification_table : technical specification table (dimensions, ratings)
- installation_notes  : installation or fixing instructions
- colour_chart        : colour or finish options
- marketing_text      : promotional or descriptive marketing copy
- irrelevant          : content not useful for extraction (logos, headers, footers)

Supabase tables written:
- document_chunks (chunk_type, heading, confidence)
- extraction_runs

TODO:
Implement classification logic. Initial approach may use a simple heuristic
(keyword matching, table detection) before upgrading to an LLM-based classifier.
The classifier should be cheap to run — do not use a large model for this step.
"""

# TODO: implement classify_chunks(source_document_id, extraction_run_id)
