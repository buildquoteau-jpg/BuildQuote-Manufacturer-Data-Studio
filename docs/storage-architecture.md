# Storage Architecture

## Core Rule

**Cloudflare R2 stores files.**
**Supabase stores metadata, verification state, extracted text/chunks, staged data, and publish records.**

Supabase never holds raw PDF blobs or binary file content. It holds references (keys, URLs, sizes, mime types) to objects in R2. Every file object in R2 has a corresponding metadata row in Supabase.

---

## What Lives Where

### Cloudflare R2

| Content | Description |
|---|---|
| Original source PDFs / product guides | Uploaded by manufacturer — never modified after upload |
| Page preview images | Rendered PNG per page, generated during extraction |
| Extracted product images | Images pulled from within a PDF during extraction |
| Approved system/component images | Images confirmed for publishing |
| Manufacturer branding (logo, hero) | Managed by Data Studio, used in system cards |

### Supabase (Data Studio staging project)

| Content | Table |
|---|---|
| Source document metadata | `source_documents` |
| Page-level extraction records | `document_pages` |
| Chunk-level extraction records | `document_chunks` |
| Extraction run logs | `extraction_runs` |
| Staged manufacturer records | `data_studio_manufacturers` |
| Staged system cards | `staged_systems` |
| Staged components | `staged_components` |
| Staged colours, profiles, relationships | `staged_system_colours`, `staged_system_profiles`, `staged_system_components` |
| Field-level verification state | `field_verifications` |
| Verification audit log | `verification_events` |
| Publish batches and items | `publish_batches`, `publish_batch_items` |

---

## R2 Key Structure

All objects follow a structured key pattern rooted at the manufacturer slug. This ensures objects are organised, traceable, and scoped per manufacturer.

```
manufacturers/{manufacturer_slug}/source-documents/{source_document_id}/{original_filename}
manufacturers/{manufacturer_slug}/page-previews/{source_document_id}/page-{page_number}.png
manufacturers/{manufacturer_slug}/extracted-images/{source_document_id}/{image_id}.png
manufacturers/{manufacturer_slug}/approved-images/systems/{staged_system_id}/{filename}
manufacturers/{manufacturer_slug}/approved-images/components/{staged_component_id}/{filename}
manufacturers/{manufacturer_slug}/branding/logo.{ext}
manufacturers/{manufacturer_slug}/branding/hero.{ext}
```

### Key design notes

- `manufacturer_slug` at the root makes it easy to see all objects for a manufacturer and to scope access policies per manufacturer.
- `source_document_id` is the Supabase UUID from `source_documents.id`, ensuring every R2 object can be joined back to a Supabase row.
- `original_filename` is preserved in the key for human readability during debugging, but the Supabase row is the authoritative source of truth for the file's metadata.
- Page preview keys use a consistent `page-{page_number}.png` pattern to allow predictable key construction without a separate lookup.

---

## source_documents Metadata Fields

The `source_documents` table holds all metadata needed to locate and describe a file in R2:

| Field | Purpose |
|---|---|
| `storage_provider` | Always `cloudflare_r2` for now; allows future provider changes |
| `storage_bucket` | R2 bucket name (from env var, not hardcoded) |
| `storage_key` | Full R2 object key — the authoritative pointer to the file |
| `public_url` | Only set if the object is intentionally public; otherwise null |
| `file_mime_type` | Validated at upload time (e.g. `application/pdf`) |
| `file_size_bytes` | Validated at upload time |
| `status` | Current lifecycle status (uploaded → extracting → extracted → ...) |
| `uploaded_by` | auth_user_id of the uploading manufacturer user |
| `uploaded_at` | Timestamp of upload |

---

## Access and Privacy

### Source documents (PDFs)

Original source PDFs should **not** be casually public by default.

- R2 objects for source documents should be stored in a private bucket.
- Access during the verification UI should use **signed URLs** generated server-side with a short TTL (e.g. 15–60 minutes).
- The browser never receives long-lived credentials to R2.
- R2 credentials (`CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`) must only exist in server-side environment variables — never exposed to the browser or client bundle.

### Page preview images

Page previews may be served via signed URL during verification, or via a CDN-backed public path if the verification UI is internal-only and access is already gated by auth.

### Approved public images

Approved product images intended for display in the Manufacturer Portal may eventually be served from a public R2 bucket or CDN. This is a publishing-step decision, not an upload-step decision.

### Manufacturer data isolation

- A manufacturer user must only be able to see and upload documents for their own `manufacturer_id`.
- Internal admin users may access all manufacturers' documents.
- Row-level security (RLS) on `source_documents` should enforce `manufacturer_id` scoping once auth is built.

---

## Audit and Retention

- Original source documents must not be deleted casually. They are the traceability root for all extracted and staged data.
- Deleting a source document from R2 without also archiving or removing the Supabase row would leave orphaned references — avoid this.
- Consider a soft-delete status (`archived`) on `source_documents` rather than hard deletes.
- `verification_events` and `field_verifications` must be retained alongside source documents as the proof chain.
