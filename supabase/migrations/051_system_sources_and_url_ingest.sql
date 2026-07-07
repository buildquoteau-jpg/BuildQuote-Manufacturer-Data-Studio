-- BuildQuote Data Studio — Migration 051
-- Sourced System Card foundations: typed source associations + URL ingestion
-- + container-snapshot columns.
--
-- See docs/sourced-system-card-architecture.md. This is Step 1 (schema
-- foundations) of the sourced-container build. It adds:
--
--   1. system_sources        — a typed link on a system (install guide, design
--                              guide, website, tech data, source catalogue).
--                              The `url` doubles as the card's LIVE LINK and as
--                              the fetch target for ingestion. `source_document_id`
--                              fills in once the worker fetches + chunks the file.
--   2. source_documents.*    — `source_url` + `ingest_kind` so a document can be
--                              ingested from a URL (worker fetch → R2) instead of
--                              a manual download-and-reupload.
--   3. card_versions.*       — `content_md` / `content_hash` / `sources_json` so a
--                              published version can carry the frozen full-text
--                              container (structured fields + linked-doc text) and
--                              a change-detection hash for re-embedding.
--
-- IDEMPOTENT: safe to re-run. Uses IF NOT EXISTS and DROP POLICY IF EXISTS so a
-- partial prior application doesn't wedge the script (migrations here are applied
-- by hand in the Supabase SQL editor).
--
-- Do NOT run against the production Supabase project.

-- ============================================================
-- 1. system_sources
-- ============================================================

CREATE TABLE IF NOT EXISTS public.system_sources (
    id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    manufacturer_id      UUID        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
    staged_system_id     UUID        NOT NULL REFERENCES public.staged_systems(id) ON DELETE CASCADE,
    role                 TEXT        NOT NULL,   -- install_guide | design_guide | website | tech_data | source_catalogue
    label                TEXT,                   -- display label (e.g. install_guide_urls[].label)
    url                  TEXT        NOT NULL,    -- the LIVE LINK, rendered on the card immediately
    source_document_id   UUID        REFERENCES public.source_documents(id) ON DELETE SET NULL, -- filled once ingested
    ingest_status        TEXT        NOT NULL DEFAULT 'linked',  -- linked | queued | fetching | extracted | failed | skipped
    include_in_container BOOLEAN     NOT NULL DEFAULT true,      -- false = show link but don't chunk (e.g. website)
    error_message        TEXT,
    sort_order           INTEGER     NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enumerations. Dropped-then-added so re-runs converge.
ALTER TABLE public.system_sources DROP CONSTRAINT IF EXISTS chk_system_sources_role;
ALTER TABLE public.system_sources
  ADD CONSTRAINT chk_system_sources_role
    CHECK (role IN ('install_guide', 'design_guide', 'website', 'tech_data', 'source_catalogue'));

ALTER TABLE public.system_sources DROP CONSTRAINT IF EXISTS chk_system_sources_ingest_status;
ALTER TABLE public.system_sources
  ADD CONSTRAINT chk_system_sources_ingest_status
    CHECK (ingest_status IN ('linked', 'queued', 'fetching', 'extracted', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_system_sources_system
  ON public.system_sources (staged_system_id, role, sort_order);
CREATE INDEX IF NOT EXISTS idx_system_sources_manufacturer
  ON public.system_sources (manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_system_sources_document
  ON public.system_sources (source_document_id);

-- One row per (system, role, url) — prevents duplicate links on re-sync.
CREATE UNIQUE INDEX IF NOT EXISTS uix_system_sources_system_role_url
  ON public.system_sources (staged_system_id, role, url);

ALTER TABLE public.system_sources ENABLE ROW LEVEL SECURITY;

-- RLS mirrors manufacturer_stockists (048): manufacturer users manage their own
-- workspace's sources; BuildQuote staff manage all. Worker writes via service
-- role (bypasses RLS).

-- ── manufacturer_user ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "manufacturer_user can read own system sources" ON public.system_sources;
CREATE POLICY "manufacturer_user can read own system sources"
  ON public.system_sources
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = system_sources.manufacturer_id
        AND mu.status = 'active'
    )
  );

DROP POLICY IF EXISTS "manufacturer_user can create own system sources" ON public.system_sources;
CREATE POLICY "manufacturer_user can create own system sources"
  ON public.system_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = system_sources.manufacturer_id
        AND mu.status = 'active'
    )
  );

DROP POLICY IF EXISTS "manufacturer_user can update own system sources" ON public.system_sources;
CREATE POLICY "manufacturer_user can update own system sources"
  ON public.system_sources
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = system_sources.manufacturer_id
        AND mu.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = system_sources.manufacturer_id
        AND mu.status = 'active'
    )
  );

DROP POLICY IF EXISTS "manufacturer_user can delete own system sources" ON public.system_sources;
CREATE POLICY "manufacturer_user can delete own system sources"
  ON public.system_sources
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = system_sources.manufacturer_id
        AND mu.status = 'active'
    )
  );

-- ── buildquote staff ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "buildquote staff can read all system sources" ON public.system_sources;
CREATE POLICY "buildquote staff can read all system sources"
  ON public.system_sources
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

DROP POLICY IF EXISTS "buildquote staff can create system sources" ON public.system_sources;
CREATE POLICY "buildquote staff can create system sources"
  ON public.system_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

DROP POLICY IF EXISTS "buildquote staff can update system sources" ON public.system_sources;
CREATE POLICY "buildquote staff can update system sources"
  ON public.system_sources
  FOR UPDATE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'))
  WITH CHECK (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

DROP POLICY IF EXISTS "buildquote staff can delete system sources" ON public.system_sources;
CREATE POLICY "buildquote staff can delete system sources"
  ON public.system_sources
  FOR DELETE
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

-- ============================================================
-- 2. source_documents — URL ingestion
-- ============================================================

ALTER TABLE public.source_documents
  ADD COLUMN IF NOT EXISTS source_url  TEXT,
  ADD COLUMN IF NOT EXISTS ingest_kind TEXT NOT NULL DEFAULT 'upload';

ALTER TABLE public.source_documents DROP CONSTRAINT IF EXISTS chk_source_documents_ingest_kind;
ALTER TABLE public.source_documents
  ADD CONSTRAINT chk_source_documents_ingest_kind
    CHECK (ingest_kind IN ('upload', 'url_fetch'));

-- No RLS change: migrations 023 already grant manufacturer_user + buildquote_admin
-- INSERT on source_documents; open SELECT already exists.

-- ============================================================
-- 3. card_versions — frozen full-text container
-- ============================================================

ALTER TABLE public.card_versions
  ADD COLUMN IF NOT EXISTS content_md   TEXT,   -- serialized fields + linked-source text, frozen at publish
  ADD COLUMN IF NOT EXISTS content_hash TEXT,   -- sha256(content_md) — re-embed trigger
  ADD COLUMN IF NOT EXISTS sources_json JSONB;  -- [{role,label,url,source_document_id,pages}] provenance manifest

-- card_versions stays insert-only (migration 049); no policy changes.
