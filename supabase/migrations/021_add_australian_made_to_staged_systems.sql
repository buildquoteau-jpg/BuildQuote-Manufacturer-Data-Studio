-- Add australian_made boolean to staged_systems.
-- Null = unknown, true = Australian made, false = not Australian made.

ALTER TABLE public.staged_systems
  ADD COLUMN IF NOT EXISTS australian_made boolean NULL;
