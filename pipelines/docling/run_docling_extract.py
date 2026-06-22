"""
Pipeline stage 3: Docling extraction.

Purpose:
Run Docling against a stored source document to extract text, tables, layout
structure and page-level content. Docling extracts raw structure only — it does
not interpret BuildQuote meaning or generate system-card data.

Inputs:
- source_document_id (uuid str): the source_documents row to process
- file_path (str): local path to the downloaded PDF
  (caller must download from R2 before invoking this stage)

Outputs:
- extraction_runs row (run_type = 'docling_extract', status = 'completed' or 'failed')
- document_pages rows: one per page, carrying page_text and docling_json
- document_chunks rows: raw chunks with raw_text, table_json, docling_json
- source_documents.status updated to 'extracted' or 'failed'

Supabase tables written:
- extraction_runs
- document_pages
- document_chunks
- source_documents (status update)

Key rules:
- Page numbers must be 1-indexed. Convert if Docling returns 0-indexed.
- Tables must be stored as JSON in document_chunks.table_json — do not flatten to text.
- Raw Docling JSON must be stored in document_pages.docling_json and document_chunks.docling_json.
- Page preview image generation (for verification UI) is a separate post-processing step.

TODO:
Implement after Docling is installed and a Supabase client is available.
Docling installation: https://github.com/DS4SD/docling
Consider running Docling in a separate Python service or container to isolate dependencies.
"""

# TODO: implement run_docling_extract(source_document_id, file_path)
