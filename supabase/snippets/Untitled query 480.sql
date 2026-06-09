SELECT 
  id,
  name,
  replace(name, chr(226) || chr(8364) || chr(8221), '—') AS fixed,
  encode(convert_to(substring(name from position(chr(226) in name) for 5), 'UTF8'), 'hex') AS hex_bytes
FROM staged_system_profiles
WHERE name LIKE '%' || chr(226) || '%'
LIMIT 3;