-- Preview
SELECT id, name, left(description, 80) AS desc_preview
FROM staged_components
WHERE description LIKE '%' || chr(226) || '%'
LIMIT 10;

-- Fix
UPDATE staged_components
SET description = replace(description, chr(226) || chr(8222) || chr(162), '™')
WHERE description LIKE '%' || chr(226) || '%';