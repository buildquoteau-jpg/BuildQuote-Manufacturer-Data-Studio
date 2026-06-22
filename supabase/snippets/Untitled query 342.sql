SELECT id, profile_name
FROM system_profiles
WHERE profile_name LIKE '%' || chr(226) || '%'
LIMIT 5;