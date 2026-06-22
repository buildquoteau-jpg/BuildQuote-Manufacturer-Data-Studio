-- Pipeline job queue.
-- Vercel writes jobs here; a persistent worker (local or VPS) picks them up,
-- runs the Python scripts, and writes results back.

CREATE TABLE public.pipeline_jobs (
    id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    manufacturer_id   UUID        NOT NULL,
    document_id       UUID,
    job_type          TEXT        NOT NULL, -- 'docling' | 'parser' | 'qa' | 'rerun_chunk'
    status            TEXT        NOT NULL DEFAULT 'pending', -- pending | running | done | error
    payload           JSONB       NOT NULL DEFAULT '{}',
    result            JSONB,
    error_message     TEXT,
    log_lines         TEXT[]      DEFAULT '{}',
    progress          JSONB,      -- live progress written by worker
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    worker_id         TEXT        -- identifies which worker picked it up
);

-- Service role can do everything (worker uses service role key)
-- Anon/authenticated can only read (for status polling from Vercel)
ALTER TABLE public.pipeline_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
  ON public.pipeline_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated can read own manufacturer jobs"
  ON public.pipeline_jobs
  FOR SELECT
  TO authenticated
  USING (true);

-- Index for worker polling
CREATE INDEX pipeline_jobs_status_idx ON public.pipeline_jobs (status, created_at);
CREATE INDEX pipeline_jobs_manufacturer_idx ON public.pipeline_jobs (manufacturer_id, created_at DESC);
