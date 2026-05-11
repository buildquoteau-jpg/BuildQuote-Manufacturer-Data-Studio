"""
Pipeline stage 1: Source document ingest.

Purpose:
Record the uploaded manufacturer source document in the Data Studio Supabase
staging database before any file storage or extraction occurs.

Inputs:
- manufacturer_id (uuid str): the Data Studio manufacturer workspace id
- original_filename (str): filename as uploaded by the manufacturer
- document_name (str): display name for the document
- file_mime_type (str): validated MIME type (e.g. 'application/pdf')
- file_size_bytes (int): file size in bytes
- uploaded_by (uuid str): auth_user_id of the uploading user

Outputs:
- source_document_id (uuid str): the newly created source_documents row id
- source_documents row with status = 'uploading'

Supabase tables written:
- source_documents

TODO:
Implement after Supabase client is initialised in services/api/db/.
Validate that manufacturer_id exists in data_studio_manufacturers before inserting.
Return the new source_document_id to the caller for use in stage 2 (R2 storage).
"""

# TODO: implement ingest_source_document(manufacturer_id, original_filename, ...)
