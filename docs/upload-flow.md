# Upload Flow

## Overview

The upload flow is the entry point for all manufacturer data into Data Studio. It results in a source document record in Supabase and a file object in Cloudflare R2, ready for extraction.

---

## First Vertical Slice Upload Flow

### Step-by-step

```
1. Manufacturer logs in
   └── Supabase Auth session established

2. Manufacturer selects their workspace / manufacturer account
   └── manufacturer_id resolved from session or workspace selection

3. Manufacturer selects a product guide PDF to upload
   └── File selected in browser UI

4. App validates the file (client-side pre-check)
   ├── Allowed types: application/pdf (initial slice — expand later)
   ├── Max file size: TBD (suggest 50MB for first slice)
   └── Reject and show error if invalid

5. App creates a source_documents row in Supabase
   ├── status = 'uploading'
   ├── manufacturer_id = current manufacturer
   ├── original_filename = file.name
   ├── document_name = file.name (editable later)
   ├── file_mime_type = file.type
   ├── file_size_bytes = file.size
   └── uploaded_by = auth_user_id

6. App uploads file to Cloudflare R2 via server route
   ├── Server constructs R2 key:
   │     manufacturers/{slug}/source-documents/{source_document_id}/{original_filename}
   ├── Server streams file to R2 using server-side R2 credentials
   ├── R2 credentials are NEVER sent to the browser
   └── Option: use presigned upload URL if streaming through server is too slow for large files

7. App updates source_documents row in Supabase
   ├── status = 'uploaded'
   ├── storage_provider = 'cloudflare_r2'
   ├── storage_bucket = env.CLOUDFLARE_R2_BUCKET_SOURCE_DOCUMENTS
   ├── storage_key = constructed R2 key
   └── public_url = null (private by default)

8. App prepares for extraction
   ├── Creates an extraction_runs row with status = 'queued' and run_type = 'docling_extract'
   └── For first slice: no automatic queue — manual "Run Extraction" button in dashboard

9. Document appears in dashboard
   ├── Status: Uploaded — Ready for extraction
   └── Manufacturer can see filename, upload date, and document status
```

---

## Server vs Browser Responsibilities

| Responsibility | Where |
|---|---|
| File type and size validation | Browser (pre-check) + Server (enforce) |
| R2 credentials | Server only — never browser |
| R2 object key construction | Server |
| Writing to R2 | Server |
| Writing to Supabase | Server (via service role key) |
| Reading document status | Browser (via Supabase anon key + RLS) |
| Generating signed URLs for verification | Server |

---

## Upload API Route (planned)

A server-side API route will handle the upload. Suggested shape:

```
POST /api/documents/upload

Request: multipart/form-data
  - file: the PDF binary
  - manufacturer_id: uuid

Response:
  - source_document_id: uuid
  - status: 'uploaded'
  - storage_key: string
```

The route will:
1. Validate the file server-side.
2. Create the `source_documents` row.
3. Upload to R2.
4. Update the `source_documents` row with storage metadata.
5. Return the new document record.

---

## Presigned Upload Option (future)

For large files, an alternative flow avoids streaming the binary through the server:

```
1. Browser requests a presigned upload URL from the server.
2. Server generates a presigned R2 PUT URL with a short TTL.
3. Browser uploads directly to R2 using the presigned URL (no R2 credentials exposed — the URL itself is the credential).
4. Browser notifies server that upload is complete.
5. Server verifies the upload and updates Supabase.
```

This avoids the server becoming a bottleneck for large PDFs, but adds complexity. Use direct server upload for the first slice.

---

## Validation Rules

| Rule | Detail |
|---|---|
| Accepted file types | `application/pdf` (first slice) |
| Max file size | 50MB (adjust after first real test) |
| Filename | Preserve original filename in R2 key and `original_filename` field |
| Duplicate detection | Not enforced in first slice — same file can be uploaded twice |
| Manufacturer isolation | `manufacturer_id` must match the authenticated user's manufacturer — enforced server-side |

---

## Status Lifecycle

```
uploading  →  uploaded  →  extracting  →  extracted
                                              │
                                         parsing  →  parsed
                                                        │
                                               needs_review
                                                        │
                                           approved / rejected / failed
```

All status transitions are recorded on the `source_documents.status` field. Future work may add an explicit status history table.

---

## First Slice Scope

For the first vertical slice, the following are explicitly out of scope:

- Background job queue for extraction (manual button is fine)
- Multiple file upload in one session
- Drag-and-drop UI
- Duplicate file detection
- Progress indicators beyond basic loading state
- Presigned upload URLs

The goal of the first slice is: one file uploaded, stored, and visible in the dashboard. Nothing more.
