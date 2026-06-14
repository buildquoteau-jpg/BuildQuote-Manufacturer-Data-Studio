-- Migration 027: add procurement_route to staged_components and staged_system_profiles
-- Values: specialist_supplier | trade_merchant
-- Drives the split-RFQ feature: components from different channels generate separate RFQ groups.

ALTER TABLE public.staged_components
  ADD COLUMN procurement_route TEXT;

ALTER TABLE public.staged_system_profiles
  ADD COLUMN procurement_route TEXT;

COMMENT ON COLUMN public.staged_components.procurement_route IS
  'specialist_supplier | trade_merchant — sourcing channel for this component';

COMMENT ON COLUMN public.staged_system_profiles.procurement_route IS
  'specialist_supplier | trade_merchant — sourcing channel for this profile variant';
