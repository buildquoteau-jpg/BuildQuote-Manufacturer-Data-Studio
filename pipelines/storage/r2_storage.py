"""
Pipeline stage 2: Cloudflare R2 storage.

Purpose:
Upload the source document file to Cloudflare R2 using a structured key,
then update the source_documents row in Supabase with storage metadata.

Inputs:
- source_document_id (uuid str): from stage 1 (ingest)
- manufacturer_slug (str): used to construct the R2 key prefix
- file_bytes (bytes) or file stream: the raw file content
- original_filename (str): used in the R2 key and for display

R2 key pattern:
  manufacturers/{manufacturer_slug}/source-documents/{source_document_id}/{original_filename}

Outputs:
- R2 object stored at constructed key
- source_documents row updated with:
    storage_provider = 'cloudflare_r2'
    storage_bucket   = <from env CLOUDFLARE_R2_BUCKET_SOURCE_DOCUMENTS>
    storage_key      = constructed R2 key
    public_url       = None (private by default)
    status           = 'uploaded'

Supabase tables written:
- source_documents

Environment variables required (server-side only — never expose to browser):
- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_R2_ACCESS_KEY_ID
- CLOUDFLARE_R2_SECRET_ACCESS_KEY
- CLOUDFLARE_R2_BUCKET_SOURCE_DOCUMENTS

TODO:
Implement using boto3 with Cloudflare R2 endpoint, or the cloudflare-python SDK.
R2 is S3-compatible; boto3 client with endpoint_url is the simplest approach.
Signed URL generation for private access should be a separate helper in this module.
"""

# TODO: implement upload_to_r2(source_document_id, manufacturer_slug, file_bytes, original_filename)
# TODO: implement generate_signed_url(storage_key, expires_in_seconds=900)
