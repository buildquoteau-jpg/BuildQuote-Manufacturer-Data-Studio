UPDATE staged_system_profiles
SET name = replace(name, chr(226) || chr(8364) || chr(8221), '—')
WHERE name LIKE '%' || chr(226) || '%';

UPDATE staged_systems
SET name = replace(name, chr(226) || chr(8364) || chr(8221), '—')
WHERE name LIKE '%' || chr(226) || '%';

UPDATE staged_components
SET name = replace(name, chr(226) || chr(8364) || chr(8221), '—')
WHERE name LIKE '%' || chr(226) || '%';