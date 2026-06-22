UPDATE staged_systems
SET notes = replace(notes, chr(226) || chr(8364) || chr(8221), '—')
WHERE notes LIKE '%' || chr(226) || '%';
