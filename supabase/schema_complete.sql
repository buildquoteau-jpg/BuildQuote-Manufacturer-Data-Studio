-- schema_complete.sql — GENERATED FILE, do not hand-edit.
-- Last refreshed: 2026-07-27 from live project ovndokzwkxpfjfobewaq (PostgREST OpenAPI).
-- Regenerate after every applied migration:
--     node scripts/refresh_schema_reference.mjs
--
-- REFERENCE ONLY — do not run this to migrate.
-- Authoritative DDL lives in supabase/migrations/.
-- NOT NULL is derived from the OpenAPI required list; defaults and
-- constraints are shown where PostgREST exposes them.

-- ============================================================
-- card_embeddings
-- ============================================================
CREATE TABLE public.card_embeddings (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    card_id                      uuid NOT NULL,
    version                      integer NOT NULL,
    chunk_index                  integer NOT NULL,
    source_role                  text,
    page_start                   integer,
    page_end                     integer,
    content                      text NOT NULL,
    embedding                    vector(1024) NOT NULL,
    content_hash                 text NOT NULL,
    created_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- card_events
-- ============================================================
CREATE TABLE public.card_events (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    card_id                      uuid,
    card_slug                    text NOT NULL,
    version                      integer,
    event_type                   text NOT NULL,
    channel                      text,
    sender_tag                   text,
    share_token                  text,
    host_domain                  text,
    doc_label                    text,
    doc_url                      text,
    device_hash                  text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- card_package_items
-- ============================================================
CREATE TABLE public.card_package_items (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    package_id                   uuid NOT NULL,
    card_id                      uuid NOT NULL,
    package_slug                 text NOT NULL,
    generated_card_path          text,
    generated_json_path          text,
    qr_code_path                 text,
    status                       text NOT NULL DEFAULT included,
    error_message                text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- card_packages
-- ============================================================
CREATE TABLE public.card_packages (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    package_version              integer NOT NULL DEFAULT 1,
    status                       text NOT NULL DEFAULT generating,
    intended_install_path        text NOT NULL DEFAULT /system-cards/,
    zip_storage_key              text,
    zip_url                      text,
    manifest_url                 text,
    feed_url                     text,
    preview_url                  text,
    checksum                     text,
    file_size_bytes              bigint,
    card_count                   integer NOT NULL DEFAULT 0,
    error_message                text,
    build_log                    text,
    generated_at                 timestamp with time zone,
    generated_by                 uuid,
    downloaded_at                timestamp with time zone,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- card_publish_events
-- ============================================================
CREATE TABLE public.card_publish_events (
    id                           bigint NOT NULL,  -- PK
    card_id                      uuid NOT NULL,
    event_type                   text NOT NULL,
    occurred_at                  timestamp with time zone NOT NULL DEFAULT now(),
    meta                         jsonb
);

-- ============================================================
-- card_share_links
-- ============================================================
CREATE TABLE public.card_share_links (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    card_id                      uuid,
    card_slug                    text NOT NULL,
    token                        text NOT NULL,
    channel                      text NOT NULL DEFAULT copy,
    sender_tag                   text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- card_versions
-- ============================================================
CREATE TABLE public.card_versions (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    card_id                      uuid NOT NULL,
    package_id                   uuid,
    version                      integer NOT NULL,
    slug                         text NOT NULL,
    name                         text NOT NULL,
    card_json                    jsonb NOT NULL,
    stockists_json               jsonb,
    validated_by                 text,
    validated_at                 timestamp with time zone,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    content_md                   text,
    content_hash                 text,
    sources_json                 jsonb
);

-- ============================================================
-- data_studio_manufacturers
-- ============================================================
CREATE TABLE public.data_studio_manufacturers (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    production_manufacturer_id   uuid,
    name                         text NOT NULL,
    slug                         text NOT NULL,
    website_url                  text,
    logo_url                     text,
    hero_image_url               text,
    description                  text,
    abn                          text,
    phone                        text,
    status                       text NOT NULL DEFAULT draft,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at                   timestamp with time zone NOT NULL DEFAULT now(),
    hero_image_position_y        smallint NOT NULL DEFAULT 50,
    pending_contact_full_name    text,
    pending_contact_email_primary text,
    pending_contact_email_secondary text,
    pending_contact_login_preference text NOT NULL DEFAULT primary,
    hero_wide_image_url          text,
    hero_wide_image_position_y   smallint NOT NULL DEFAULT 50,
    widget_button_config         jsonb NOT NULL,
    logo_asset_id                uuid,
    hero_image_asset_id          uuid,
    hero_wide_image_asset_id     uuid
);

-- ============================================================
-- data_studio_user_profiles
-- ============================================================
CREATE TABLE public.data_studio_user_profiles (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    auth_user_id                 uuid NOT NULL,
    email                        text NOT NULL,
    full_name                    text,
    global_role                  text NOT NULL DEFAULT manufacturer_user,
    status                       text NOT NULL DEFAULT active,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at                   timestamp with time zone NOT NULL DEFAULT now(),
    company_email_primary        text,
    company_email_secondary      text,
    login_email_preference       text NOT NULL DEFAULT primary
);

-- ============================================================
-- document_chunks
-- ============================================================
CREATE TABLE public.document_chunks (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    source_document_id           uuid NOT NULL,
    document_page_id             uuid,
    extraction_run_id            uuid,
    page_number                  integer,
    chunk_index                  integer NOT NULL,
    heading                      text,
    chunk_type                   text,
    raw_text                     text,
    table_json                   jsonb,
    docling_json                 jsonb,
    confidence                   numeric,
    created_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- document_pages
-- ============================================================
CREATE TABLE public.document_pages (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    source_document_id           uuid NOT NULL,
    page_number                  integer NOT NULL,
    page_image_storage_key       text,
    page_text                    text,
    docling_json                 jsonb,
    created_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- extraction_runs
-- ============================================================
CREATE TABLE public.extraction_runs (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    source_document_id           uuid NOT NULL,
    run_type                     text NOT NULL,
    status                       text NOT NULL DEFAULT queued,
    tool_name                    text,
    tool_version                 text,
    model_name                   text,
    started_at                   timestamp with time zone,
    completed_at                 timestamp with time zone,
    error_message                text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- field_verifications
-- ============================================================
CREATE TABLE public.field_verifications (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    entity_type                  text NOT NULL,
    entity_id                    uuid NOT NULL,
    field_name                   text NOT NULL,
    extracted_value              text,
    verified_value               text,
    source_document_id           uuid,
    source_page_id               uuid,
    source_chunk_id              uuid,
    source_page_number           integer,
    status                       text NOT NULL DEFAULT pending,
    confidence                   numeric,
    reviewer_id                  uuid,
    reviewed_at                  timestamp with time zone,
    notes                        text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- manufacturer_assets
-- ============================================================
CREATE TABLE public.manufacturer_assets (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    asset_type                   text NOT NULL,
    title                        text,
    alt_text                     text,
    caption                      text,
    storage_key                  text,
    source_url                   text,
    public_url                   text,
    mime_type                    text,
    file_size_bytes              bigint,
    width                        integer,
    height                       integer,
    focal_x                      smallint NOT NULL DEFAULT 50,
    focal_y                      smallint NOT NULL DEFAULT 50,
    approved_for_publication     boolean NOT NULL DEFAULT false,
    archived                     boolean NOT NULL DEFAULT false,
    created_by                   uuid,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- manufacturer_embed_widget_systems
-- ============================================================
CREATE TABLE public.manufacturer_embed_widget_systems (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    embed_widget_id              uuid NOT NULL,
    staged_system_id             uuid NOT NULL,
    sort_order                   integer NOT NULL DEFAULT 0
);

-- ============================================================
-- manufacturer_embed_widgets
-- ============================================================
CREATE TABLE public.manufacturer_embed_widgets (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    public_token                 text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text),
    status                       text NOT NULL DEFAULT active,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- manufacturer_link_library
-- ============================================================
CREATE TABLE public.manufacturer_link_library (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    label                        text NOT NULL,
    url                          text NOT NULL,
    created_by                   uuid,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- manufacturer_messages
-- ============================================================
CREATE TABLE public.manufacturer_messages (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    sender_type                  text NOT NULL,
    sender_user_id               uuid,
    sender_label                 text,
    body                         text NOT NULL,
    message_type                 text NOT NULL DEFAULT general,
    related_publish_batch_id     uuid,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    acknowledged_at              timestamp with time zone
);

-- ============================================================
-- manufacturer_stockist_cards
-- ============================================================
CREATE TABLE public.manufacturer_stockist_cards (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    stockist_id                  uuid NOT NULL,
    card_id                      uuid NOT NULL,
    created_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- manufacturer_stockists
-- ============================================================
CREATE TABLE public.manufacturer_stockists (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    business_name                text NOT NULL,
    suburb                       text,
    state                        text,
    phone                        text,
    website_url                  text,
    trade_desk_email             text,
    all_cards                    boolean NOT NULL DEFAULT true,
    confirm_token                uuid NOT NULL DEFAULT gen_random_uuid(),
    confirm_status               text NOT NULL DEFAULT unconfirmed,
    confirmed_at                 timestamp with time zone,
    archived                     boolean NOT NULL DEFAULT false,
    sort_order                   integer NOT NULL DEFAULT 0,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- manufacturer_users
-- ============================================================
CREATE TABLE public.manufacturer_users (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    auth_user_id                 uuid,
    email                        text NOT NULL,
    role                         text NOT NULL DEFAULT manufacturer_reviewer,
    status                       text NOT NULL DEFAULT invited,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    user_profile_id              uuid,
    invited_by                   uuid,
    invited_at                   timestamp with time zone DEFAULT now(),
    accepted_at                  timestamp with time zone,
    last_active_at               timestamp with time zone,
    updated_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- parser_field_evidence
-- ============================================================
CREATE TABLE public.parser_field_evidence (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    extraction_run_id            uuid NOT NULL,
    entity_type                  text NOT NULL,
    entity_id                    uuid NOT NULL,
    field_name                   text NOT NULL,
    extracted_value              text,
    source_document_id           uuid,
    source_page_number           integer,
    source_chunk_id              uuid,
    confidence                   numeric,
    is_uncertain                 boolean NOT NULL DEFAULT false,
    parser_note                  text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- pipeline_jobs
-- ============================================================
CREATE TABLE public.pipeline_jobs (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    document_id                  uuid,
    job_type                     text NOT NULL,
    status                       text NOT NULL DEFAULT pending,
    payload                      jsonb NOT NULL,
    result                       jsonb,
    error_message                text,
    log_lines                    text[],
    progress                     jsonb,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    started_at                   timestamp with time zone,
    completed_at                 timestamp with time zone,
    worker_id                    text,
    heartbeat_at                 timestamp with time zone
);

-- ============================================================
-- publish_batch_items
-- ============================================================
CREATE TABLE public.publish_batch_items (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    publish_batch_id             uuid NOT NULL,
    entity_type                  text NOT NULL,
    entity_id                    uuid NOT NULL,
    production_table             text,
    production_id                uuid,
    status                       text NOT NULL DEFAULT pending,
    error_message                text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    change_type                  text NOT NULL DEFAULT new
);

-- ============================================================
-- publish_batches
-- ============================================================
CREATE TABLE public.publish_batches (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid,
    status                       text NOT NULL DEFAULT draft,
    export_type                  text NOT NULL DEFAULT csv,
    production_project_ref       text,
    created_by                   uuid,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    approved_at                  timestamp with time zone,
    published_at                 timestamp with time zone,
    notes                        text
);

-- ============================================================
-- source_documents
-- ============================================================
CREATE TABLE public.source_documents (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    original_filename            text NOT NULL,
    document_name                text NOT NULL,
    document_type                text,
    document_date                text,
    storage_provider             text NOT NULL DEFAULT cloudflare_r2,
    storage_bucket               text,
    storage_key                  text,
    public_url                   text,
    file_mime_type               text,
    file_size_bytes              bigint,
    status                       text NOT NULL DEFAULT uploaded,
    uploaded_by                  uuid,
    uploaded_at                  timestamp with time zone NOT NULL DEFAULT now(),
    notes                        text,
    production_catalogue_source_id uuid,
    source_url                   text,
    ingest_kind                  text NOT NULL DEFAULT upload
);

-- ============================================================
-- staged_components
-- ============================================================
CREATE TABLE public.staged_components (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    source_document_id           uuid,
    source_chunk_id              uuid,
    production_component_id      uuid,
    sku                          text,
    name                         text NOT NULL,
    description                  text,
    category                     text,
    uom                          text,
    length_mm                    numeric,
    width_mm                     numeric,
    height_mm                    numeric,
    thickness_mm                 numeric,
    depth_mm                     numeric,
    gauge_mm                     numeric,
    diameter_mm                  numeric,
    roll_m                       numeric,
    weight_kg                    numeric,
    pieces                       integer,
    material                     text,
    finish                       text,
    colour                       text,
    profile                      text,
    texture                      text,
    coverage_m2                  numeric,
    sort_order                   integer NOT NULL DEFAULT 0,
    extraction_confidence        numeric,
    verification_status          text NOT NULL DEFAULT pending_review,
    verified_by                  uuid,
    verified_at                  timestamp with time zone,
    reviewer_notes               text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at                   timestamp with time zone NOT NULL DEFAULT now(),
    volume_ml                    numeric,
    weight_g                     numeric,
    pack_format                  text,
    supplier_pack_qty            numeric,
    supplier_pack_uom            text,
    supplier_pack_note           text,
    parser_notes                 jsonb,
    image_url                    text,
    website_url                  text,
    extracted_at                 timestamp with time zone,
    procurement_route            text
);

-- ============================================================
-- staged_system_colours
-- ============================================================
CREATE TABLE public.staged_system_colours (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    staged_system_id             uuid NOT NULL,
    colour_name                  text NOT NULL,
    sku                          text,
    image_url                    text,
    is_stocked                   boolean NOT NULL DEFAULT true,
    sort_order                   integer NOT NULL DEFAULT 0,
    verification_status          text NOT NULL DEFAULT pending_review,
    reviewer_notes               text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    parser_notes                 jsonb,
    sku_suffix                   text,
    extracted_at                 timestamp with time zone,
    production_colour_id         uuid,
    image_asset_id               uuid
);

-- ============================================================
-- staged_system_components
-- ============================================================
CREATE TABLE public.staged_system_components (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    staged_system_id             uuid NOT NULL,
    staged_component_id          uuid NOT NULL,
    role                         text NOT NULL DEFAULT component,
    notes                        text,
    sort_order                   integer NOT NULL DEFAULT 0,
    extraction_confidence        numeric,
    verification_status          text NOT NULL DEFAULT pending_review,
    verified_by                  uuid,
    verified_at                  timestamp with time zone,
    reviewer_notes               text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    parser_notes                 jsonb,
    extracted_at                 timestamp with time zone
);

-- ============================================================
-- staged_system_profiles
-- ============================================================
CREATE TABLE public.staged_system_profiles (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    staged_system_id             uuid NOT NULL,
    name                         text,
    product_code                 text,
    dimensions                   text,
    length_m                     numeric,
    sheet_format                 text,
    sort_order                   integer NOT NULL DEFAULT 0,
    verification_status          text NOT NULL DEFAULT pending_review,
    reviewer_notes               text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    profile_name                 text,
    length_mm                    numeric,
    width_mm                     numeric,
    height_mm                    numeric,
    thickness_mm                 numeric,
    depth_mm                     numeric,
    gauge_mm                     numeric,
    diameter_mm                  numeric,
    roll_m                       numeric,
    weight_kg                    numeric,
    pieces                       numeric,
    volume_ml                    numeric,
    weight_g                     numeric,
    pack_format                  text,
    supplier_pack_qty            numeric,
    supplier_pack_uom            text,
    supplier_pack_note           text,
    bal_rating                   text,
    parser_notes                 jsonb,
    uom                          text,
    image_url                    text,
    website_url                  text,
    extracted_at                 timestamp with time zone,
    procurement_route            text,
    production_profile_id        uuid,
    description                  text
);

-- ============================================================
-- staged_systems
-- ============================================================
CREATE TABLE public.staged_systems (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    source_document_id           uuid,
    source_chunk_id              uuid,
    production_system_id         uuid,
    name                         text NOT NULL,
    product_code                 text,
    slug                         text,
    category                     text,
    subcategory                  text,
    description                  text,
    dimensions                   text,
    length_m                     numeric,
    double_sided                 boolean NOT NULL DEFAULT false,
    hero_image_url               text,
    website_url                  text,
    source_label                 text,
    source_url                   text,
    sheet_format                 text,
    fire_rating                  text,
    acoustic_rating              text,
    moisture_resistant           boolean NOT NULL DEFAULT false,
    structural_grade             text,
    tech_data_url                text,
    sort_order                   integer NOT NULL DEFAULT 0,
    extraction_confidence        numeric,
    verification_status          text NOT NULL DEFAULT pending_review,
    verified_by                  uuid,
    verified_at                  timestamp with time zone,
    reviewer_notes               text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at                   timestamp with time zone NOT NULL DEFAULT now(),
    notes                        text,
    parser_notes                 jsonb,
    bal_rating                   text,
    extracted_at                 timestamp with time zone,
    australian_made              boolean,
    install_guide_urls           jsonb,
    design_guide_url             text,
    last_submitted_at            timestamp with time zone,
    last_published_at            timestamp with time zone,
    hero_image_position_x        smallint NOT NULL DEFAULT 50,
    hero_image_position_y        smallint NOT NULL DEFAULT 50,
    hero_image_asset_id          uuid,
    gallery_images               jsonb NOT NULL,
    publish_status               text NOT NULL DEFAULT draft,
    published_version            text,
    owner_account_id             uuid,
    custom_document_links        jsonb,
    hero_image_zoom              numeric NOT NULL DEFAULT 1,
    custom_technical_attributes  jsonb
);

-- ============================================================
-- system_sources
-- ============================================================
CREATE TABLE public.system_sources (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    staged_system_id             uuid NOT NULL,
    role                         text NOT NULL,
    label                        text,
    url                          text NOT NULL,
    source_document_id           uuid,
    ingest_status                text NOT NULL DEFAULT linked,
    include_in_container         boolean NOT NULL DEFAULT true,
    error_message                text,
    sort_order                   integer NOT NULL DEFAULT 0,
    created_at                   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- verification_events
-- ============================================================
CREATE TABLE public.verification_events (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    entity_type                  text NOT NULL,
    entity_id                    uuid NOT NULL,
    action                       text NOT NULL,
    field_name                   text,
    old_value                    text,
    new_value                    text,
    reviewer_id                  uuid,
    notes                        text,
    created_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- widget_quote_requests
-- ============================================================
CREATE TABLE public.widget_quote_requests (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    widget_id                    uuid,
    system_id                    text NOT NULL,
    system_name                  text,
    selected_items               jsonb NOT NULL,
    name                         text NOT NULL,
    email                        text NOT NULL,
    phone                        text,
    postcode                     text,
    project_type                 text,
    timeline                     text,
    message                      text,
    status                       text NOT NULL DEFAULT new,
    created_at                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- workspace_invitations
-- ============================================================
CREATE TABLE public.workspace_invitations (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),  -- PK
    manufacturer_id              uuid NOT NULL,
    email                        text NOT NULL,
    role                         text NOT NULL DEFAULT manufacturer_reviewer,
    token_hash                   text,
    status                       text NOT NULL DEFAULT pending,
    invited_by                   uuid,
    invited_at                   timestamp with time zone NOT NULL DEFAULT now(),
    expires_at                   timestamp with time zone,
    accepted_at                  timestamp with time zone
);

-- ============================================================
-- RPC endpoints exposed by PostgREST at refresh time
-- ============================================================
-- /rpc/get_my_global_role
-- /rpc/insert_parser_output_plan_v1
-- /rpc/match_card_sources
-- /rpc/purge_staged_for_document_v1
-- /rpc/rls_auto_enable
