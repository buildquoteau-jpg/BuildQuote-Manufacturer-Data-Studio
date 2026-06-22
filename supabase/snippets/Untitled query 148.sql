-- Strip mojibake trademark/registered symbols and normalise spaces
UPDATE staged_systems
SET name = trim(regexp_replace(
    replace(replace(replace(name, 'â„¢', ''), 'Â®', ''), '®', ''),
    '\s+', ' ', 'g'
))
WHERE manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83';