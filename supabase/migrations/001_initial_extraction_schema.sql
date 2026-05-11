-- BuildQuote Data Studio — Initial Extraction Schema
-- Migration: 001_initial_extraction_schema.sql
--
-- This is the Data Studio STAGING database. It is NOT the production Supabase project.
-- AI can suggest manufacturer data. Humans must verify it.
-- Only approved data may be exported into production.
--
-- Do not run this against the production Supabase project.

-- ============================================================
-- 1. data_studio_manufacturers
-- Manufacturer records inside Data Studio.
-- Maps to production: manufacturers
-- ============================================================

CREATE TABLE IF NOT EXISTS data_studio_manufacturers (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_manufacturer_id  uuid,                         -- nullable: may not exist in production yet
  name                        text NOT NULL,
  slug                        text NOT NULL UNIQUE,
  website_url                 text,
  logo_url                    text,
  hero_image_url              text,
  description                 text,
  abn                         text,
  phone                       text,
  status                      text NOT NULL DEFAULT 'draft', -- draft | active | archived
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. manufacturer_users
-- Manufacturer-side login/ownership. Auth not built yet —
-- this table is the future data model only.
-- ============================================================

CREATE TABLE IF NOT EXISTS manufacturer_users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id  uuid NOT NULL REFERENCES data_studio_manufacturers(id) ON DELETE CASCADE,
  auth_user_id     uuid,                                     -- nullable: wired up when auth is built
  email            text NOT NULL,
  role             text NOT NULL DEFAULT 'manufacturer_reviewer',
  status           text NOT NULL DEFAULT 'invited',          -- invited | active | suspended
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. source_documents
-- Uploaded manufacturer PDFs / product guides.
-- Original files stored in Cloudflare R2; metadata stored here.
-- ============================================================

CREATE TABLE IF NOT EXISTS source_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id   uuid NOT NULL REFERENCES data_studio_manufacturers(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  document_name     text NOT NULL,
  document_type     text,                  -- product_guide | installation_guide | brochure | spec_sheet | other
  document_date     text,                  -- as stated on the document (not parsed into date)
  storage_provider  text NOT NULL DEFAULT 'cloudflare_r2',
  storage_bucket    text,
  storage_key       text,
  public_url        text,
  file_mime_type    text,
  file_size_bytes   bigint,
  status            text NOT NULL DEFAULT 'uploaded',
  -- uploaded | extracting | extracted | parsing | parsed | needs_review | approved | rejected | failed
  uploaded_by       uuid,                  -- nullable: auth_user_id of uploader
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  notes             text
);

-- ============================================================
-- 4. extraction_runs
-- Each run of the extraction or parsing pipeline against a source document.
-- ============================================================

CREATE TABLE IF NOT EXISTS extraction_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id  uuid NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  run_type            text NOT NULL,
  -- docling_extract | chunk_document | parse_systems | parse_components | verification_assist
  status              text NOT NULL DEFAULT 'queued',
  -- queued | running | completed | failed
  tool_name           text,
  tool_version        text,
  model_name          text,
  started_at          timestamptz,
  completed_at        timestamptz,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. document_pages
-- Page-level source references used for visual verification.
-- ============================================================

CREATE TABLE IF NOT EXISTS document_pages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id    uuid NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  page_number           integer NOT NULL,
  page_image_storage_key text,             -- R2 key for rendered page image
  page_text             text,
  docling_json          jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_document_id, page_number)
);

-- ============================================================
-- 6. document_chunks
-- Extracted text / table chunks with page references.
-- chunk_type drives which AI parsing prompt is used.
-- ============================================================

CREATE TABLE IF NOT EXISTS document_chunks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id  uuid NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  document_page_id    uuid REFERENCES document_pages(id) ON DELETE SET NULL,
  extraction_run_id   uuid REFERENCES extraction_runs(id) ON DELETE SET NULL,
  page_number         integer,
  chunk_index         integer NOT NULL,
  heading             text,
  chunk_type          text,
  -- product_table | system_description | accessory_list | installation_notes
  -- specification_table | marketing_text | irrelevant
  raw_text            text,
  table_json          jsonb,
  docling_json        jsonb,
  confidence          numeric,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. staged_systems
-- AI/agent-generated draft system cards.
-- verification_status gates whether a record can be exported.
-- Maps to production: systems
-- ============================================================

CREATE TABLE IF NOT EXISTS staged_systems (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id          uuid NOT NULL REFERENCES data_studio_manufacturers(id) ON DELETE CASCADE,
  source_document_id       uuid REFERENCES source_documents(id) ON DELETE SET NULL,
  source_chunk_id          uuid REFERENCES document_chunks(id) ON DELETE SET NULL,
  production_system_id     uuid,           -- nullable: populated after export to production
  name                     text NOT NULL,
  product_code             text,
  slug                     text,
  category                 text,
  subcategory              text,
  description              text,
  dimensions               text,
  length_m                 numeric,
  double_sided             boolean NOT NULL DEFAULT false,
  hero_image_url           text,
  website_url              text,
  source_label             text,
  source_url               text,
  sheet_format             text,
  fire_rating              text,
  acoustic_rating          text,
  moisture_resistant       boolean NOT NULL DEFAULT false,
  structural_grade         text,
  install_guide_url        text,
  tech_data_url            text,
  sort_order               integer NOT NULL DEFAULT 0,
  extraction_confidence    numeric,
  verification_status      text NOT NULL DEFAULT 'pending_review',
  -- pending_review | in_review | approved | rejected | needs_source_check | exported
  verified_by              uuid,           -- auth_user_id of reviewer
  verified_at              timestamptz,
  reviewer_notes           text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 8. staged_components
-- AI/agent-generated component rows before human approval.
-- uom is used internally; export maps uom → components.unit in production.
-- Dimension fields preserved to support rfq_draft_items downstream.
-- Maps to production: components
-- ============================================================

CREATE TABLE IF NOT EXISTS staged_components (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id          uuid NOT NULL REFERENCES data_studio_manufacturers(id) ON DELETE CASCADE,
  source_document_id       uuid REFERENCES source_documents(id) ON DELETE SET NULL,
  source_chunk_id          uuid REFERENCES document_chunks(id) ON DELETE SET NULL,
  production_component_id  uuid,           -- nullable: populated after export to production
  sku                      text,
  name                     text NOT NULL,
  description              text,
  category                 text,
  uom                      text,           -- export maps this to components.unit in production
  -- dimension fields — preserved for rfq_draft_items downstream
  length_mm                numeric,
  width_mm                 numeric,
  height_mm                numeric,
  thickness_mm             numeric,
  depth_mm                 numeric,
  gauge_mm                 numeric,
  diameter_mm              numeric,
  roll_m                   numeric,
  weight_kg                numeric,
  pieces                   integer,
  -- physical/visual attributes
  material                 text,
  finish                   text,
  colour                   text,
  profile                  text,
  texture                  text,
  coverage_m2              numeric,
  sort_order               integer NOT NULL DEFAULT 0,
  extraction_confidence    numeric,
  verification_status      text NOT NULL DEFAULT 'pending_review',
  -- pending_review | in_review | approved | rejected | needs_source_check | exported
  verified_by              uuid,
  verified_at              timestamptz,
  reviewer_notes           text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. staged_system_components
-- Draft relationship between staged systems and staged components.
-- Maps to production: system_components
-- ============================================================

CREATE TABLE IF NOT EXISTS staged_system_components (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staged_system_id      uuid NOT NULL REFERENCES staged_systems(id) ON DELETE CASCADE,
  staged_component_id   uuid NOT NULL REFERENCES staged_components(id) ON DELETE CASCADE,
  role                  text NOT NULL DEFAULT 'required',    -- required | optional | accessory
  notes                 text,
  sort_order            integer NOT NULL DEFAULT 0,
  extraction_confidence numeric,
  verification_status   text NOT NULL DEFAULT 'pending_review',
  verified_by           uuid,
  verified_at           timestamptz,
  reviewer_notes        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staged_system_id, staged_component_id)
);

-- ============================================================
-- 10. staged_system_colours
-- Draft colours / finish options for staged systems.
-- Maps to production: system_colours
-- ============================================================

CREATE TABLE IF NOT EXISTS staged_system_colours (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staged_system_id     uuid NOT NULL REFERENCES staged_systems(id) ON DELETE CASCADE,
  colour_name          text NOT NULL,
  sku                  text,
  image_url            text,
  is_stocked           boolean NOT NULL DEFAULT true,
  sort_order           integer NOT NULL DEFAULT 0,
  verification_status  text NOT NULL DEFAULT 'pending_review',
  reviewer_notes       text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staged_system_id, colour_name)
);

-- ============================================================
-- 11. staged_system_profiles
-- Draft product profile / size variants for staged systems.
-- Maps to production: system_profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS staged_system_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staged_system_id     uuid NOT NULL REFERENCES staged_systems(id) ON DELETE CASCADE,
  name                 text,
  product_code         text,
  dimensions           text,
  length_m             numeric,
  sheet_format         text,
  sort_order           integer NOT NULL DEFAULT 0,
  verification_status  text NOT NULL DEFAULT 'pending_review',
  reviewer_notes       text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 12. verification_events
-- Audit log of every human verification action.
-- Append-only — do not update or delete rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS verification_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL,
  -- staged_system | staged_component | staged_system_component
  -- staged_system_colour | staged_system_profile | source_document
  entity_id    uuid NOT NULL,
  action       text NOT NULL,
  -- approved_field | rejected_field | edited_field
  -- approved_record | rejected_record | flagged_for_review | exported
  field_name   text,
  old_value    text,
  new_value    text,
  reviewer_id  uuid,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 13. publish_batches
-- Tracks controlled exports / migrations from Data Studio to production.
-- No record should be exported without an approved publish_batch.
-- ============================================================

CREATE TABLE IF NOT EXISTS publish_batches (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id         uuid REFERENCES data_studio_manufacturers(id) ON DELETE SET NULL,
  status                  text NOT NULL DEFAULT 'draft',
  -- draft | ready_for_export | exported_csv | migrated_to_production | failed
  export_type             text NOT NULL DEFAULT 'csv',       -- csv | direct_migration
  production_project_ref  text,
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  approved_at             timestamptz,
  published_at            timestamptz,
  notes                   text
);

-- ============================================================
-- 14. publish_batch_items
-- Tracks which staged records are included in an export batch.
-- ============================================================

CREATE TABLE IF NOT EXISTS publish_batch_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publish_batch_id uuid NOT NULL REFERENCES publish_batches(id) ON DELETE CASCADE,
  entity_type      text NOT NULL,    -- staged_system | staged_component | staged_system_colour | etc.
  entity_id        uuid NOT NULL,
  production_table text,             -- the production table this maps to
  production_id    uuid,             -- populated after successful export
  status           text NOT NULL DEFAULT 'pending',  -- pending | exported | failed
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_source_documents_manufacturer_id
  ON source_documents (manufacturer_id);

CREATE INDEX IF NOT EXISTS idx_extraction_runs_source_document_id
  ON extraction_runs (source_document_id);

CREATE INDEX IF NOT EXISTS idx_document_pages_source_document_id
  ON document_pages (source_document_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_source_document_id
  ON document_chunks (source_document_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_page_id
  ON document_chunks (document_page_id);

CREATE INDEX IF NOT EXISTS idx_staged_systems_manufacturer_id
  ON staged_systems (manufacturer_id);

CREATE INDEX IF NOT EXISTS idx_staged_components_manufacturer_id
  ON staged_components (manufacturer_id);

CREATE INDEX IF NOT EXISTS idx_staged_system_components_staged_system_id
  ON staged_system_components (staged_system_id);

CREATE INDEX IF NOT EXISTS idx_staged_system_components_staged_component_id
  ON staged_system_components (staged_component_id);

CREATE INDEX IF NOT EXISTS idx_verification_events_entity
  ON verification_events (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_publish_batches_manufacturer_id
  ON publish_batches (manufacturer_id);

CREATE INDEX IF NOT EXISTS idx_publish_batch_items_publish_batch_id
  ON publish_batch_items (publish_batch_id);
