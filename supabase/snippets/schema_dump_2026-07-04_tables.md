# Live staging schema dump — 2026-07-04

Source of truth for what actually exists in the Data Studio Supabase project as of
2026-07-04, provided by Melia from the SQL editor (information_schema.columns /
information_schema.tables). Use this — not the migration history — when checking
current schema state.

## Tables present (public schema)

- data_studio_manufacturers
- data_studio_user_profiles
- document_chunks
- document_pages
- extraction_runs
- field_verifications
- manufacturer_embed_widget_systems
- manufacturer_embed_widgets
- manufacturer_messages
- manufacturer_users
- parser_field_evidence
- pipeline_jobs
- publish_batch_items
- publish_batches
- source_documents
- staged_components
- staged_system_colours
- staged_system_components
- staged_system_profiles
- staged_systems
- verification_events
- widget_quote_requests
- workspace_invitations

**Not present yet** (planned migrations 046/047): `manufacturer_assets`,
`card_packages`, `card_package_items`.

## Notable column facts (vs assumptions in code)

- `staged_systems.slug` EXISTS (nullable text) — package generator should prefer it
  and only fall back to slugified name.
- `staged_systems` has `hero_image_position_x/y` (smallint, default 50),
  `install_guide_urls` (jsonb), `design_guide_url`, `tech_data_url`, `source_url`,
  `website_url`, `last_submitted_at`, `last_published_at`.
- `data_studio_manufacturers` has `widget_button_config` (jsonb, default
  `{"show_find_stockist": true, "show_request_quote": true, "show_general_enquiry": true}`),
  `hero_wide_image_url` + `hero_wide_image_position_y`, `hero_image_position_y`.
  No asset-id columns yet.
- Embed widgets + `widget_quote_requests` live in THIS (staging) project:
  `manufacturer_embed_widgets` / `manufacturer_embed_widget_systems`
  (note: widgets/page.tsx also queries a production `embed_widgets` table by slug —
  two widget stores exist).
- `staged_system_colours` has both `sku` and `sku_suffix`, plus `image_url` and
  `production_colour_id`.
- `staged_system_profiles` has `production_profile_id`; `staged_components` has
  `production_component_id`.
- `staged_systems.verification_status` default 'pending_review' (no CHECK constraint
  visible in dump — values enforced in app code).

Full column-level dump was provided in-session (2026-07-04); refresh
`schema_complete.sql` with the standard query when convenient.
