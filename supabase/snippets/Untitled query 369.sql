SELECT COUNT(*) FROM staged_components WHERE description LIKE '%' || chr(226) || '%';
SELECT COUNT(*) FROM staged_systems WHERE description LIKE '%' || chr(226) || '%';