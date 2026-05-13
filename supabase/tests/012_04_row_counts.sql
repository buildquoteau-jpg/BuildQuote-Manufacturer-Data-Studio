-- Row counts snapshot — run before and after the valid insert test.
-- Uses real seeded IDs so the diff is attributable to the test call.
SELECT
  (SELECT COUNT(*) FROM staged_systems)           AS systems,
  (SELECT COUNT(*) FROM staged_system_profiles)   AS profiles,
  (SELECT COUNT(*) FROM staged_components)        AS components,
  (SELECT COUNT(*) FROM staged_system_colours)    AS colours,
  (SELECT COUNT(*) FROM staged_system_components) AS links,
  (SELECT COUNT(*) FROM field_verifications)      AS field_verifs,
  (SELECT COUNT(*) FROM parser_field_evidence)    AS pfe_rows;
