-- BuildQuote Data Studio — Relax staged_system_components.role default
-- Migration: 017_relax_system_component_role_default.sql
--
-- Previously the role column defaulted to 'required' with a comment suggesting
-- it was constrained to required | optional | accessory. This classification
-- was removed — role is now a free-text description of what the component does
-- (e.g. 'timber fix clip', 'edge board', 'starter clip', 'window flashing').
-- Builders select the components they need; the parser does not classify intent.
--
-- Additive change only: alters the column default. No rows modified.
-- No data loss. Safe to run against staging; do not run against production Supabase.

ALTER TABLE staged_system_components
  ALTER COLUMN role SET DEFAULT 'component';

COMMENT ON COLUMN staged_system_components.role IS
  'Free-text description of what this component does in the context of the system — e.g. timber fix clip, edge board, starter clip, window flashing. No constrained value set.';
