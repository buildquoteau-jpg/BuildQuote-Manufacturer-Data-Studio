SELECT id,
  left(notes, 100) AS notes_preview,
  ascii(substring(notes from position(chr(226) in notes) for 1)) AS char1,
  ascii(substring(notes from position(chr(226) in notes) + 1 for 1)) AS char2,
  ascii(substring(notes from position(chr(226) in notes) + 2 for 1)) AS char3
FROM staged_systems
WHERE notes LIKE '%' || chr(226) || '%'
LIMIT 3;