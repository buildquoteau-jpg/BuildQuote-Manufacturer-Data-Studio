-- Remove profiles and colours with no parent system
DELETE FROM staged_system_profiles
WHERE staged_system_id NOT IN (SELECT id FROM staged_systems);

DELETE FROM staged_system_colours
WHERE staged_system_id NOT IN (SELECT id FROM staged_systems);

-- Verify
SELECT
  (SELECT COUNT(*) FROM staged_system_profiles) AS profiles_remaining,
  (SELECT COUNT(*) FROM staged_system_colours) AS colours_remaining;