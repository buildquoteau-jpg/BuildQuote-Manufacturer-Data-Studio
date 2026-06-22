UPDATE staged_system_profiles
SET profile_name = replace(profile_name, chr(226) || chr(8364) || chr(8221), '—')
WHERE profile_name LIKE '%' || chr(226) || '%';