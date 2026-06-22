SELECT 
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'staged_systems',
    'staged_system_profiles',
    'staged_system_colours',
    'staged_system_components',
    'staged_components',
    'data_studio_manufacturers'
  )
ORDER BY table_name, ordinal_position;