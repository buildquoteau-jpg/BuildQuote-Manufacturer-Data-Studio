-- BuildQuote Data Studio — Pipeline job heartbeat + lease recovery
-- Migration: 059_pipeline_job_heartbeat.sql
--
-- The 2026-07-18 audit found that a worker crash strands its job in
-- status='running' forever: claim_job only picks up status='pending', so the
-- job is never retried, and the pipeline UI shows an eternal spinner that
-- reads as "still working". There was no way to distinguish a healthy
-- long-running job from a dead one.
--
-- This adds a heartbeat timestamp that the worker (and standalone scripts via
-- scripts/lib/pipeline_report.py) refresh on every progress update. Consumers:
--   * pipeline_worker.claim_job reclaims 'running' jobs whose heartbeat is
--     older than its lease timeout (default 15 min).
--   * The pipeline UI renders 'running' jobs with a stale heartbeat as
--     "stalled" instead of an active spinner.
--
-- IDEMPOTENT: safe to re-run.
-- Do NOT run against the RFQ/BuildQuote production Supabase project.

ALTER TABLE public.pipeline_jobs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

-- Backfill so existing rows have a sane baseline for staleness checks.
UPDATE public.pipeline_jobs
SET heartbeat_at = COALESCE(started_at, created_at)
WHERE heartbeat_at IS NULL;

-- claim_job filters on status and orders by heartbeat age when reclaiming.
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status_heartbeat
  ON public.pipeline_jobs (status, heartbeat_at);
