-- See all James Hardie systems and how many rows of each
SELECT 
  name,
  product_code,
  COUNT(*) AS row_count,
  array_agg(id ORDER BY created_at) AS ids,
  array_agg(created_at ORDER BY created_at) AS created_times
FROM staged_systems
WHERE manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
GROUP BY name, product_code
ORDER BY name;