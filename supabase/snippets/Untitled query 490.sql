SELECT name, COUNT(*) 
FROM staged_systems 
WHERE manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
GROUP BY name 
HAVING COUNT(*) > 1
ORDER BY name;