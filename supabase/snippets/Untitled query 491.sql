SELECT 'staged_system_profiles.label' AS location, id, label AS before
FROM staged_system_profiles WHERE label LIKE '%â€"%'
UNION ALL
SELECT 'staged_systems.name', id, name FROM staged_systems WHERE name LIKE '%â€"%'
UNION ALL
SELECT 'staged_components.name', id, name FROM staged_components WHERE name LIKE '%â€"%';