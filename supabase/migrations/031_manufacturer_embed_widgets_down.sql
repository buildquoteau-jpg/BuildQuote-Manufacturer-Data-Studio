-- Rollback for 031_manufacturer_embed_widgets.sql
-- Run this to fully remove the embed widget tables and their RLS policies.

DROP TABLE IF EXISTS manufacturer_embed_widget_systems CASCADE;
DROP TABLE IF EXISTS manufacturer_embed_widgets CASCADE;
