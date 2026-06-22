-- BuildQuote Data Studio — Migration 039
-- (Originally numbered 038; renumbered after another session's
-- 038_hero_wide_image.sql landed on master first — same collision pattern
-- they themselves resolved for 034. Content unchanged, already applied to
-- Data Studio production under the old "038_publish_target_tracking" label
-- via the Supabase MCP apply_migration tool before this rename.)
-- Production-id tracking for the remaining catalogue child tables.
--
-- data_studio_manufacturers.production_manufacturer_id, staged_systems.production_system_id,
-- and staged_components.production_component_id already exist (set NULL until promoted,
-- then written back after export — see CLAUDE.md "Key conventions"). The publish job
-- (apps/web/lib/studio-admin/publish.ts) needs the same pattern on the three remaining
-- catalogue tables that map to production, so a re-publish can tell "already live, update
-- this row" from "never published, insert a new one" without re-querying production by name.

ALTER TABLE public.source_documents
  ADD COLUMN production_catalogue_source_id UUID;

ALTER TABLE public.staged_system_profiles
  ADD COLUMN production_profile_id UUID;

ALTER TABLE public.staged_system_colours
  ADD COLUMN production_colour_id UUID;
