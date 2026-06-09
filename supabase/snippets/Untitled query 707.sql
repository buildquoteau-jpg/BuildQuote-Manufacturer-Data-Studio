BEGIN;

-- 1. Polymorphic verification/evidence records tied to this manufacturer's staged entities
DELETE FROM parser_field_evidence
WHERE entity_id IN (
  SELECT id FROM staged_systems    WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
  UNION
  SELECT id FROM staged_components WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
);

DELETE FROM field_verifications
WHERE entity_id IN (
  SELECT id FROM staged_systems    WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
  UNION
  SELECT id FROM staged_components WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
);

DELETE FROM verification_events
WHERE entity_id IN (
  SELECT id FROM staged_systems    WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
  UNION
  SELECT id FROM staged_components WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
);

-- 2. Staged system children
DELETE FROM staged_system_components
WHERE staged_system_id IN (
  SELECT id FROM staged_systems WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
);

DELETE FROM staged_system_colours
WHERE staged_system_id IN (
  SELECT id FROM staged_systems WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
);

DELETE FROM staged_system_profiles
WHERE staged_system_id IN (
  SELECT id FROM staged_systems WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
);

-- 3. Document pipeline records
DELETE FROM parser_field_evidence
WHERE extraction_run_id IN (
  SELECT id FROM extraction_runs WHERE source_document_id IN (
    SELECT id FROM source_documents WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
  )
);

DELETE FROM document_chunks
WHERE source_document_id IN (
  SELECT id FROM source_documents WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
);

DELETE FROM document_pages
WHERE source_document_id IN (
  SELECT id FROM source_documents WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
);

DELETE FROM extraction_runs
WHERE source_document_id IN (
  SELECT id FROM source_documents WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
);

-- 4. Staged entities
DELETE FROM staged_systems     WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034';
DELETE FROM staged_components  WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034';
DELETE FROM source_documents   WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034';

-- 5. Publish batches
DELETE FROM publish_batch_items
WHERE publish_batch_id IN (
  SELECT id FROM publish_batches WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
);
DELETE FROM publish_batches WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034';

-- 6. Users and invites
DELETE FROM manufacturer_users     WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034';
DELETE FROM workspace_invitations  WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034';

-- 7. The manufacturer itself
DELETE FROM data_studio_manufacturers WHERE id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034';

-- Verify row counts before committing:
-- SELECT 'staged_systems' AS t, count(*) FROM staged_systems WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
-- UNION ALL SELECT 'staged_components', count(*) FROM staged_components WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034'
-- UNION ALL SELECT 'source_documents', count(*) FROM source_documents WHERE manufacturer_id = '07f2349c-2dfd-4f81-abd9-6b0bdac2a034';

COMMIT;