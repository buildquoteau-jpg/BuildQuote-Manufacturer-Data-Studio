UPDATE staged_systems
SET notes = replace(notes, chr(226) || chr(8222) || chr(162), '™')
WHERE notes LIKE '%' || chr(226) || '%';