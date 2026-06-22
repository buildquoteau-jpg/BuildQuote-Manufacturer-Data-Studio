BEGIN;

DELETE FROM parser_field_evidence
WHERE entity_id IN (
  SELECT id FROM staged_systems    WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56'
  UNION
  SELECT id FROM staged_components WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56'
);

DELETE FROM field_verifications
WHERE entity_id IN (
  SELECT id FROM staged_systems    WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56'
  UNION
  SELECT id FROM staged_components WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56'
);

DELETE FROM verification_events
WHERE entity_id IN (
  SELECT id FROM staged_systems    WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56'
  UNION
  SELECT id FROM staged_components WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56'
);

DELETE FROM staged_system_components
WHERE staged_system_id IN (
  SELECT id FROM staged_systems WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56'
);

DELETE FROM staged_system_colours
WHERE staged_system_id IN (
  SELECT id FROM staged_systems WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56'
);

DELETE FROM staged_system_profiles
WHERE staged_system_id IN (
  SELECT id FROM staged_systems WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56'
);

DELETE FROM parser_field_evidence
WHERE extraction_run_id IN (
  SELECT id FROM extraction_runs WHERE source_document_id IN (
    SELECT id FROM source_documents WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56'
  )
);

DELETE FROM document_chunks    WHERE source_document_id IN (SELECT id FROM source_documents WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56');
DELETE FROM document_pages     WHERE source_document_id IN (SELECT id FROM source_documents WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56');
DELETE FROM extraction_runs    WHERE source_document_id IN (SELECT id FROM source_documents WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56');

DELETE FROM staged_systems     WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56';
DELETE FROM staged_components  WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56';
DELETE FROM source_documents   WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56';

DELETE FROM publish_batch_items WHERE publish_batch_id IN (SELECT id FROM publish_batches WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56');
DELETE FROM publish_batches        WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56';
DELETE FROM manufacturer_users     WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56';
DELETE FROM workspace_invitations  WHERE manufacturer_id = '33964b01-8bdd-4385-b7ed-81936d805b56';

DELETE FROM data_studio_manufacturers WHERE id = '33964b01-8bdd-4385-b7ed-81936d805b56';

COMMIT;