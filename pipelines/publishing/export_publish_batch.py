"""
Pipeline stage 8: Publish / export.

Purpose:
Package human-approved staged records into a publish batch for controlled
export or production migration.

This is the only pipeline stage whose output is destined for the production
Supabase project. It must only run server-side using the service role key.
No browser client may trigger production writes.

Inputs:
- manufacturer_id (uuid str)
- staged_system_ids (list of uuid str): approved systems to include
- staged_component_ids (list of uuid str): approved components to include
- export_type (str): 'csv' | 'direct_migration'
- created_by (uuid str): buildquote_admin auth_user_id authorising the export

Outputs:
- publish_batches row
- publish_batch_items rows (one per staged record included)
- CSV export file written to R2 (future)
- Production Supabase rows created (future — server-side, service role only)
- staged records' production_*_id fields back-populated after successful migration

Supabase tables written (staging):
- publish_batches
- publish_batch_items
- staged_systems.production_system_id (after migration)
- staged_components.production_component_id (after migration)

Safety checks (must be enforced in this module, not only in UI):
- All field_verifications rows for included records must have status IN ('approved', 'edited').
- Any record with a field_verifications row in 'pending' or 'rejected' must be blocked.
- A catalogue_sources row must be created first; its id must be set on all exported records.

Export field mapping reminders:
- staged_components.uom → production components.unit (rename required)
- staged_systems.source_document_id → catalogue_sources.id (create first, then reference)
- See docs/production-schema-mapping.md for full field mapping.

TODO:
Implement after staging and production Supabase clients are available.
CSV export: write rows in production schema field order, with uom renamed to unit.
Direct migration: use production service role key stored in server env only.
Back-populate production_*_id fields in staging after successful migration.
"""

# TODO: implement create_publish_batch(manufacturer_id, staged_system_ids, staged_component_ids, ...)
# TODO: implement validate_records_for_export(entity_ids)  — enforce field_verifications check
# TODO: implement export_to_csv(publish_batch_id)
# TODO: implement migrate_to_production(publish_batch_id)  — server-side, service role only
