UPDATE staged_components
SET description = replace(description, chr(226) || chr(8240) || chr(164), '≤')
WHERE description LIKE '%' || chr(226) || '%';