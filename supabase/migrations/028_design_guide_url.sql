-- Migration 028: add design_guide_url to staged_systems
-- Single URL pointing to a manufacturer design / climate zone selector guide

ALTER TABLE public.staged_systems
  ADD COLUMN design_guide_url TEXT;
