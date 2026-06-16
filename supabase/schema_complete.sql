-- schema_complete.sql
-- Last refreshed: 2026-05-19
-- Source: information_schema.columns query (see supabase/snippets/)
--
-- REFERENCE ONLY — do not run this to migrate.
-- Authoritative schema lives in supabase/migrations/.
-- To refresh: run the columns query in the Supabase editor, export CSV,
-- save to snippets/, then update this file to match.

-- ============================================================
-- data_studio_manufacturers
-- ============================================================
CREATE TABLE public.data_studio_manufacturers (
    id                         UUID        NOT NULL DEFAULT gen_random_uuid(),
    production_manufacturer_id UUID,
    name                       TEXT        NOT NULL,
    slug                       TEXT        NOT NULL,
    website_url                TEXT,
    logo_url                   TEXT,
    hero_image_url             TEXT,
    hero_image_position_y      SMALLINT    NOT NULL DEFAULT 50,
    hero_wide_image_url        TEXT,
    hero_wide_image_position_y SMALLINT    NOT NULL DEFAULT 50,
    description                TEXT,
    abn                        TEXT,
    phone                      TEXT,
    status                     TEXT        NOT NULL DEFAULT 'draft',
    pending_contact_full_name        TEXT,
    pending_contact_email_primary    TEXT,
    pending_contact_email_secondary  TEXT,
    pending_contact_login_preference TEXT NOT NULL DEFAULT 'primary',
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- data_studio_user_profiles
-- ============================================================
CREATE TABLE public.data_studio_user_profiles (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    auth_user_id UUID        NOT NULL,
    email        TEXT        NOT NULL,
    full_name    TEXT,
    global_role  TEXT        NOT NULL DEFAULT 'manufacturer_user',
    status       TEXT        NOT NULL DEFAULT 'active',
    company_email_primary   TEXT,
    company_email_secondary TEXT,
    login_email_preference  TEXT        NOT NULL DEFAULT 'primary',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- source_documents
-- storage_provider is always 'cloudflare_r2'; binary blobs never stored in Supabase
-- ============================================================
CREATE TABLE public.source_documents (
    id                UUID        NOT NULL DEFAULT gen_random_uuid(),
    manufacturer_id   UUID        NOT NULL,
    original_filename TEXT        NOT NULL,
    document_name     TEXT        NOT NULL,
    document_type     TEXT,
    document_date     TEXT,
    storage_provider  TEXT        NOT NULL DEFAULT 'cloudflare_r2',
    storage_bucket    TEXT,
    storage_key       TEXT,
    public_url        TEXT,
    file_mime_type    TEXT,
    file_size_bytes   BIGINT,
    status            TEXT        NOT NULL DEFAULT 'uploaded',
    uploaded_by       UUID,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes             TEXT
);

-- ============================================================
-- document_pages
-- ============================================================
CREATE TABLE public.document_pages (
    id                      UUID        NOT NULL DEFAULT gen_random_uuid(),
    source_document_id      UUID        NOT NULL,
    page_number             INTEGER     NOT NULL,
    page_image_storage_key  TEXT,
    page_text               TEXT,
    docling_json            JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- document_chunks
-- ============================================================
CREATE TABLE public.document_chunks (
    id                 UUID        NOT NULL DEFAULT gen_random_uuid(),
    source_document_id UUID        NOT NULL,
    document_page_id   UUID,
    extraction_run_id  UUID,
    page_number        INTEGER,
    chunk_index        INTEGER     NOT NULL,
    heading            TEXT,
    chunk_type         TEXT,
    raw_text           TEXT,
    table_json         JSONB,
    docling_json       JSONB,
    confidence         NUMERIC,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- extraction_runs
-- ============================================================
CREATE TABLE public.extraction_runs (
    id                 UUID        NOT NULL DEFAULT gen_random_uuid(),
    source_document_id UUID        NOT NULL,
    run_type           TEXT        NOT NULL,
    status             TEXT        NOT NULL DEFAULT 'queued',
    tool_name          TEXT,
    tool_version       TEXT,
    model_name         TEXT,
    started_at         TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    error_message      TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- staged_systems
-- verification_status values: pending_review | approved | rejected
-- production_system_id set when promoted to production
-- ============================================================
CREATE TABLE public.staged_systems (
    id                    UUID        NOT NULL DEFAULT gen_random_uuid(),
    manufacturer_id       UUID        NOT NULL,
    source_document_id    UUID,
    source_chunk_id       UUID,
    production_system_id  UUID,
    name                  TEXT        NOT NULL,
    product_code          TEXT,
    slug                  TEXT,
    category              TEXT,
    subcategory           TEXT,
    description           TEXT,
    dimensions            TEXT,
    length_m              NUMERIC,
    double_sided          BOOLEAN     NOT NULL DEFAULT false,
    hero_image_url        TEXT,
    website_url           TEXT,
    source_label          TEXT,
    source_url            TEXT,
    sheet_format          TEXT,
    fire_rating           TEXT,
    acoustic_rating       TEXT,
    moisture_resistant    BOOLEAN     NOT NULL DEFAULT false,
    structural_grade      TEXT,
    install_guide_url     TEXT,
    tech_data_url         TEXT,
    sort_order            INTEGER     NOT NULL DEFAULT 0,
    extraction_confidence NUMERIC,
    verification_status   TEXT        NOT NULL DEFAULT 'pending_review',
    verified_by           UUID,
    verified_at           TIMESTAMPTZ,
    reviewer_notes        TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes                 TEXT,
    parser_notes          JSONB,
    bal_rating            TEXT,
    extracted_at          TIMESTAMPTZ,
    australian_made       BOOLEAN
);

-- ============================================================
-- staged_system_colours
-- ============================================================
CREATE TABLE public.staged_system_colours (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    staged_system_id    UUID        NOT NULL,
    colour_name         TEXT        NOT NULL,
    sku                 TEXT,
    image_url           TEXT,
    is_stocked          BOOLEAN     NOT NULL DEFAULT true,
    sort_order          INTEGER     NOT NULL DEFAULT 0,
    verification_status TEXT        NOT NULL DEFAULT 'pending_review',
    reviewer_notes      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    parser_notes        JSONB,
    sku_suffix          TEXT,
    extracted_at        TIMESTAMPTZ
);

-- ============================================================
-- staged_system_profiles
-- size/SKU variants within a system (different lengths, sheet formats, etc.)
-- ============================================================
CREATE TABLE public.staged_system_profiles (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    staged_system_id    UUID        NOT NULL,
    name                TEXT,
    product_code        TEXT,
    dimensions          TEXT,
    length_m            NUMERIC,
    sheet_format        TEXT,
    sort_order          INTEGER     NOT NULL DEFAULT 0,
    verification_status TEXT        NOT NULL DEFAULT 'pending_review',
    reviewer_notes      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    profile_name        TEXT,
    length_mm           NUMERIC,
    width_mm            NUMERIC,
    height_mm           NUMERIC,
    thickness_mm        NUMERIC,
    depth_mm            NUMERIC,
    gauge_mm            NUMERIC,
    diameter_mm         NUMERIC,
    roll_m              NUMERIC,
    weight_kg           NUMERIC,
    pieces              NUMERIC,
    volume_ml           NUMERIC,
    weight_g            NUMERIC,
    pack_format         TEXT,
    supplier_pack_qty   NUMERIC,
    supplier_pack_uom   TEXT,
    supplier_pack_note  TEXT,
    bal_rating          TEXT,
    parser_notes        JSONB,
    uom                 TEXT,
    image_url           TEXT,
    website_url         TEXT,
    extracted_at        TIMESTAMPTZ,
    procurement_route   TEXT
);

-- ============================================================
-- staged_components
-- fixings, trims, clips — production_component_id set when promoted
-- ============================================================
CREATE TABLE public.staged_components (
    id                        UUID        NOT NULL DEFAULT gen_random_uuid(),
    manufacturer_id           UUID        NOT NULL,
    source_document_id        UUID,
    source_chunk_id           UUID,
    production_component_id   UUID,
    sku                       TEXT,
    name                      TEXT        NOT NULL,
    description               TEXT,
    category                  TEXT,
    uom                       TEXT,
    length_mm                 NUMERIC,
    width_mm                  NUMERIC,
    height_mm                 NUMERIC,
    thickness_mm              NUMERIC,
    depth_mm                  NUMERIC,
    gauge_mm                  NUMERIC,
    diameter_mm               NUMERIC,
    roll_m                    NUMERIC,
    weight_kg                 NUMERIC,
    pieces                    INTEGER,
    material                  TEXT,
    finish                    TEXT,
    colour                    TEXT,
    profile                   TEXT,
    texture                   TEXT,
    coverage_m2               NUMERIC,
    sort_order                INTEGER     NOT NULL DEFAULT 0,
    extraction_confidence     NUMERIC,
    verification_status       TEXT        NOT NULL DEFAULT 'pending_review',
    verified_by               UUID,
    verified_at               TIMESTAMPTZ,
    reviewer_notes            TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    volume_ml                 NUMERIC,
    weight_g                  NUMERIC,
    pack_format               TEXT,
    supplier_pack_qty         NUMERIC,
    supplier_pack_uom         TEXT,
    supplier_pack_note        TEXT,
    parser_notes              JSONB,
    image_url                 TEXT,
    website_url               TEXT,
    extracted_at              TIMESTAMPTZ,
    procurement_route         TEXT
);

-- ============================================================
-- staged_system_components
-- join: which staged_components belong to which staged_system
-- role default: 'component'
-- ============================================================
CREATE TABLE public.staged_system_components (
    id                    UUID        NOT NULL DEFAULT gen_random_uuid(),
    staged_system_id      UUID        NOT NULL,
    staged_component_id   UUID        NOT NULL,
    role                  TEXT        NOT NULL DEFAULT 'component',
    notes                 TEXT,
    sort_order            INTEGER     NOT NULL DEFAULT 0,
    extraction_confidence NUMERIC,
    verification_status   TEXT        NOT NULL DEFAULT 'pending_review',
    verified_by           UUID,
    verified_at           TIMESTAMPTZ,
    reviewer_notes        TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    parser_notes          JSONB,
    extracted_at          TIMESTAMPTZ
);

-- ============================================================
-- field_verifications
-- per-field review record; entity_type + entity_id is polymorphic
-- ============================================================
CREATE TABLE public.field_verifications (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    entity_type         TEXT        NOT NULL,
    entity_id           UUID        NOT NULL,
    field_name          TEXT        NOT NULL,
    extracted_value     TEXT,
    verified_value      TEXT,
    source_document_id  UUID,
    source_page_id      UUID,
    source_chunk_id     UUID,
    source_page_number  INTEGER,
    status              TEXT        NOT NULL DEFAULT 'pending',
    confidence          NUMERIC,
    reviewer_id         UUID,
    reviewed_at         TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- parser_field_evidence
-- evidence trail per field per extraction run
-- ============================================================
CREATE TABLE public.parser_field_evidence (
    id                 UUID        NOT NULL DEFAULT gen_random_uuid(),
    extraction_run_id  UUID        NOT NULL,
    entity_type        TEXT        NOT NULL,
    entity_id          UUID        NOT NULL,
    field_name         TEXT        NOT NULL,
    extracted_value    TEXT,
    source_document_id UUID,
    source_page_number INTEGER,
    source_chunk_id    UUID,
    confidence         NUMERIC,
    is_uncertain       BOOLEAN     NOT NULL DEFAULT false,
    parser_note        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- verification_events
-- append-only audit log of reviewer actions
-- ============================================================
CREATE TABLE public.verification_events (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    entity_type TEXT        NOT NULL,
    entity_id   UUID        NOT NULL,
    action      TEXT        NOT NULL,
    field_name  TEXT,
    old_value   TEXT,
    new_value   TEXT,
    reviewer_id UUID,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- publish_batches
-- a batch of staged items to push to production
-- export_type default: 'csv'; production_project_ref = prod Supabase ref
-- ============================================================
CREATE TABLE public.publish_batches (
    id                     UUID        NOT NULL DEFAULT gen_random_uuid(),
    manufacturer_id        UUID,
    status                 TEXT        NOT NULL DEFAULT 'draft',
    export_type            TEXT        NOT NULL DEFAULT 'csv',
    production_project_ref TEXT,
    created_by             UUID,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at            TIMESTAMPTZ,
    published_at           TIMESTAMPTZ,
    notes                  TEXT
);

-- ============================================================
-- publish_batch_items
-- individual entities queued in a publish batch
-- ============================================================
CREATE TABLE public.publish_batch_items (
    id               UUID        NOT NULL DEFAULT gen_random_uuid(),
    publish_batch_id UUID        NOT NULL,
    entity_type      TEXT        NOT NULL,
    entity_id        UUID        NOT NULL,
    production_table TEXT,
    production_id    UUID,
    status           TEXT        NOT NULL DEFAULT 'pending',
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- manufacturer_users
-- links a user to a manufacturer workspace
-- role: 'manufacturer_reviewer' | 'manufacturer_admin'
-- status: 'invited' | 'active' | 'suspended'
-- ============================================================
CREATE TABLE public.manufacturer_users (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    manufacturer_id UUID        NOT NULL,
    auth_user_id    UUID,
    email           TEXT        NOT NULL,
    role            TEXT        NOT NULL DEFAULT 'manufacturer_reviewer',
    status          TEXT        NOT NULL DEFAULT 'invited',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_profile_id UUID,
    invited_by      UUID,
    invited_at      TIMESTAMPTZ          DEFAULT now(),
    accepted_at     TIMESTAMPTZ,
    last_active_at  TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- workspace_invitations
-- pending email invites; token_hash used for accept link
-- ============================================================
CREATE TABLE public.workspace_invitations (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    manufacturer_id UUID        NOT NULL,
    email           TEXT        NOT NULL,
    role            TEXT        NOT NULL DEFAULT 'manufacturer_reviewer',
    token_hash      TEXT,
    status          TEXT        NOT NULL DEFAULT 'pending',
    invited_by      UUID,
    invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ,
    accepted_at     TIMESTAMPTZ
);
