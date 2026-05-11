# supabase

Supabase configuration for the Data Studio **staging** project.

**This is NOT the production Supabase project.**

The staging project holds:
- Source document metadata (catalogue_sources equivalent)
- Extracted page and chunk records
- AI-suggested staged records (staged_systems, staged_components, etc.)
- Verification state per record
- Manufacturer accounts (Supabase Auth)

## Folders

```
migrations/   Supabase migration SQL files (staging schema only)
seeds/        Seed data for local development and testing
```

## What Supabase Does NOT Store

Supabase does not store raw PDF blobs or any binary file content. All file objects (source PDFs, page preview images, extracted images, approved product images, manufacturer branding) are stored in **Cloudflare R2**.

Supabase stores only metadata and references to R2 objects:
- `source_documents.storage_key` — the full R2 object key
- `source_documents.storage_bucket` — the R2 bucket name
- `source_documents.public_url` — only set if the object is intentionally public
- `document_pages.page_image_storage_key` — R2 key for the rendered page preview image

Signed URLs for private file access are generated server-side using R2 credentials. These credentials must never be stored in Supabase or exposed to the browser.

## Row-Level Security Intent

RLS policies will be designed around two axes:

1. **Manufacturer workspace ownership** — all manufacturer-scoped tables (`source_documents`, `staged_systems`, `staged_components`, etc.) will restrict access to users who have an active `manufacturer_users` membership for that `manufacturer_id`. Write access within a workspace is further scoped by `manufacturer_users.role` (admin vs reviewer).

2. **BuildQuote global roles** — users with `global_role = 'buildquote_reviewer'` or `buildquote_admin'` on their `data_studio_user_profiles` row may read across all workspaces. Only `buildquote_admin` may approve publish batches and trigger production migration.

Production migration (`publish_batches` status → `migrated_to_production`) is server-side only using the Supabase service role key. No RLS policy will grant a browser client the ability to trigger a production write.

Full RLS policies will be written in a future migration once the auth model is confirmed in implementation.

## Safety Rule

No migration in this folder should touch the production Supabase project.
Production exports are handled by the `pipelines/publishing/` module, not by migrations.

## Status

Initial schema committed. See `migrations/` for current state.
