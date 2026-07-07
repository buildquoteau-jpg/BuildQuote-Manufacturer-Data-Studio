-- BuildQuote Data Studio — Migration 052
-- Card embeddings + semantic retrieval (Step 7 of
-- docs/sourced-system-card-architecture.md).
--
-- Stores pgvector embeddings of each published card version's container
-- (card_versions.content_md, assembled in Step 5), so AI can search across
-- system cards and cite them as sources. Embeddings are a pure function of the
-- container: keyed by content_hash, so we re-embed only when the container
-- changes.
--
-- Provider: Voyage AI (voyage-3.5), output dimension 1024. If you switch models,
-- change vector(1024) here and VOYAGE_* in the worker to match — the dimension
-- must agree.
--
-- IDEMPOTENT: safe to re-run (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS).
-- Do NOT run against the production Supabase project.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.card_embeddings (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    manufacturer_id UUID        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
    card_id         UUID        NOT NULL REFERENCES public.staged_systems(id) ON DELETE CASCADE,
    version         INTEGER     NOT NULL,           -- card_versions.version this was built from
    chunk_index     INTEGER     NOT NULL,           -- window ordinal within content_md
    source_role     TEXT,                           -- 'fields' | install_guide | design_guide | ... (best-effort)
    page_start      INTEGER,
    page_end        INTEGER,
    content         TEXT        NOT NULL,           -- the embedded text span (for citation display)
    embedding       vector(1024) NOT NULL,
    content_hash    TEXT        NOT NULL,           -- = card_versions.content_hash it was built from
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (card_id, version, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_card_embeddings_card
  ON public.card_embeddings (card_id, version);
CREATE INDEX IF NOT EXISTS idx_card_embeddings_manufacturer
  ON public.card_embeddings (manufacturer_id);

-- Approximate-nearest-neighbour index (cosine). HNSW = good recall without
-- tuning lists; fine for this corpus size.
CREATE INDEX IF NOT EXISTS idx_card_embeddings_vec
  ON public.card_embeddings USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.card_embeddings ENABLE ROW LEVEL SECURITY;

-- Reads: manufacturer own + BuildQuote staff. Writes: service role only (the
-- embed worker) — no INSERT/UPDATE/DELETE policy on purpose.
DROP POLICY IF EXISTS "manufacturer_user can read own card embeddings" ON public.card_embeddings;
CREATE POLICY "manufacturer_user can read own card embeddings"
  ON public.card_embeddings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manufacturer_users mu
      WHERE mu.auth_user_id = auth.uid()
        AND mu.manufacturer_id = card_embeddings.manufacturer_id
        AND mu.status = 'active'
    )
  );

DROP POLICY IF EXISTS "buildquote staff can read all card embeddings" ON public.card_embeddings;
CREATE POLICY "buildquote staff can read all card embeddings"
  ON public.card_embeddings
  FOR SELECT
  TO authenticated
  USING (public.get_my_global_role() IN ('buildquote_admin', 'buildquote_reviewer'));

-- ── Retrieval RPC ───────────────────────────────────────────────────────────
-- Cosine similarity search over embeddings. Caller embeds the query text with
-- the SAME model (voyage-3.5, input_type='query') and passes the vector in.
-- SECURITY INVOKER (default) so RLS above still scopes what a caller can see.

CREATE OR REPLACE FUNCTION public.match_card_sources(
  query_embedding vector(1024),
  match_count INT DEFAULT 8,
  filter_manufacturer UUID DEFAULT NULL
)
RETURNS TABLE (
  card_id UUID,
  manufacturer_id UUID,
  version INTEGER,
  source_role TEXT,
  page_start INTEGER,
  page_end INTEGER,
  content TEXT,
  similarity REAL
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ce.card_id,
    ce.manufacturer_id,
    ce.version,
    ce.source_role,
    ce.page_start,
    ce.page_end,
    ce.content,
    (1 - (ce.embedding <=> query_embedding))::real AS similarity
  FROM public.card_embeddings ce
  WHERE filter_manufacturer IS NULL OR ce.manufacturer_id = filter_manufacturer
  ORDER BY ce.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1)
$$;
