-- BuildQuote Data Studio — Migration 037
-- Change tracking for the publish/submit flow.
--
-- Problem: submitForPublication() (verification-actions.ts) currently bundles
-- EVERY currently-verified staged_system into a brand-new publish_batches row
-- on every click. Re-opening, editing, and resubmitting one card produces a
-- batch full of duplicates of everything already submitted, with nothing
-- telling BuildQuote which system actually changed, or whether a system is
-- brand new vs an edit to something already live in production.
--
-- staged_systems.last_submitted_at — set to now() whenever a system is
--   included in a publish_batch_items row. submitForPublication only selects
--   systems where updated_at > last_submitted_at (or never submitted), so
--   resubmitting after one edit only re-bundles that one system.
--
-- staged_systems.last_published_at — set when a system's batch item actually
--   reaches production (not wired yet — that's the BuildQuote admin
--   publish/approve flow, still unbuilt). Added now so that flow doesn't need
--   another migration later.
--
-- publish_batch_items.change_type — 'new' if the system has no
--   production_system_id yet, 'update' if it's already live and this batch
--   item is a re-publish. Lets the (future) admin queue distinguish "3 new
--   systems" from "1 update to a live card" instead of an undifferentiated
--   list, and lets the (future) publish job UPDATE the existing production
--   row instead of inserting a duplicate.

ALTER TABLE public.staged_systems
  ADD COLUMN last_submitted_at TIMESTAMPTZ,
  ADD COLUMN last_published_at TIMESTAMPTZ;

ALTER TABLE public.publish_batch_items
  ADD COLUMN change_type TEXT NOT NULL DEFAULT 'new' CHECK (change_type IN ('new', 'update'));
