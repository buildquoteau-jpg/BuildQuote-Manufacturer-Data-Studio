-- Delete all James Hardie staging data (destructive — confirm first)
DELETE FROM staged_system_components
WHERE staged_system_id IN (
  SELECT id FROM staged_systems
  WHERE manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

DELETE FROM staged_system_colours
WHERE staged_system_id IN (
  SELECT id FROM staged_systems
  WHERE manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

DELETE FROM staged_system_profiles
WHERE staged_system_id IN (
  SELECT id FROM staged_systems
  WHERE manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

DELETE FROM staged_systems
WHERE manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83';

DELETE FROM staged_components
WHERE manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83';

-- Verify
SELECT 
  (SELECT COUNT(*) FROM staged_systems WHERE manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83') AS systems,
  (SELECT COUNT(*) FROM staged_components WHERE manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83') AS components;