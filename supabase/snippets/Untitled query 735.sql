UPDATE staged_components
SET description = replace(description, chr(226) || chr(8222) || chr(162), '™')
WHERE description LIKE '%' || chr(226) || '%';

UPDATE staged_systems
SET description = replace(description, chr(226) || chr(8222) || chr(162), '™')
WHERE description LIKE '%' || chr(226) || '%';