-- Local dev seed — do NOT apply to production.
-- Safe to re-run: ON CONFLICT DO NOTHING on the unique slug column.
--
-- Staged systems, profiles, components and colours are NOT seeded here.
-- Import real data with: pnpm import:csv (see scripts/import-csv-to-staged.ts)

INSERT INTO data_studio_manufacturers (name, slug, status, website_url, description)
VALUES
  (
    'James Hardie',
    'james-hardie',
    'active',
    'https://www.jameshardie.com.au',
    'Fibre cement cladding, weatherboard and soffit systems.'
  ),
  (
    'Hume Doors',
    'hume-doors',
    'active',
    'https://www.humedoors.com.au',
    'Timber and MDF interior and entrance door systems.'
  ),
  (
    'JDS Doors',
    'jds-doors',
    'active',
    'https://www.jdsmetaldoorframes.com.au',
    'Welded metal doorframes for brick and stud construction.'
  ),
  (
    'Designer Groove',
    'designer-groove',
    'active',
    'https://www.forest.one',
    'Decorative MDF wall and ceiling lining panels.'
  )
ON CONFLICT (slug) DO NOTHING;
