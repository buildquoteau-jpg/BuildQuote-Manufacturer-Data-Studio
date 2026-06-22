SELECT id, left(description, 100),
  ascii(substring(description from position(chr(226) in description) for 1)) AS char1,
  ascii(substring(description from position(chr(226) in description) + 1 for 1)) AS char2,
  ascii(substring(description from position(chr(226) in description) + 2 for 1)) AS char3
FROM staged_components
WHERE description LIKE '%' || chr(226) || '%'
LIMIT 3;