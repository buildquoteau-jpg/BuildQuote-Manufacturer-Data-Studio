UPDATE staged_system_profiles
SET name = replace(name, 'â€"', '–')
WHERE name LIKE '%â€"%';

UPDATE staged_systems
SET name = replace(name, 'â€"', '–')
WHERE name LIKE '%â€"%';

UPDATE staged_components
SET name = replace(name, 'â€"', '–')
WHERE name LIKE '%â€"%';