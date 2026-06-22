SELECT id, name,
  ascii(substring(name from position('â' in name) for 1)) AS char1,
  ascii(substring(name from position('â' in name) + 1 for 1)) AS char2,
  ascii(substring(name from position('â' in name) + 2 for 1)) AS char3
FROM staged_system_profiles
WHERE name LIKE '%â%'
LIMIT 5;
