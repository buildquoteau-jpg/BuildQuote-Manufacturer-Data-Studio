-- Find the JDS manufacturer ID and delete all its staged data
DO $$
DECLARE
  mfr_id uuid;
BEGIN
  SELECT id INTO mfr_id FROM data_studio_manufacturers WHERE slug = 'jds-doors';

  DELETE FROM staged_system_profiles
    WHERE staged_system_id IN (
      SELECT id FROM staged_systems WHERE manufacturer_id = mfr_id
    );

  DELETE FROM staged_system_colours
    WHERE staged_system_id IN (
      SELECT id FROM staged_systems WHERE manufacturer_id = mfr_id
    );

  DELETE FROM staged_system_components
    WHERE staged_system_id IN (
      SELECT id FROM staged_systems WHERE manufacturer_id = mfr_id
    );

  DELETE FROM staged_systems WHERE manufacturer_id = mfr_id;
END $$;