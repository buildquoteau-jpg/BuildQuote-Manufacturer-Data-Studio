-- ============================================================
-- Stria Fine Cladding (305547) — James Hardie
-- Creates system, inserts components, links via junction table
-- Run in Supabase SQL editor
-- ============================================================

-- Step 1: Create the system
INSERT INTO staged_systems (
  manufacturer_id,
  name,
  product_code,
  slug,
  category,
  description,
  install_guide_url,
  verification_status
)
VALUES (
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  'HardieTexture Fine Texture Cladding',
  '305547',
  'hardietexture-fine-texture-cladding',
  'Cladding',
  'Fibre cement fine texture cladding panel system.',
  'https://www.jameshardie.com.au/sites/default/files/2022-07/Hardie_Fine_Texture_and_Hardie_Brushed_Concrete_Cladding_Installation_Guide.pdf',
  'pending_review'
);

-- Step 2: Insert components (skip duplicates by SKU + manufacturer)
INSERT INTO staged_components (manufacturer_id, sku, name, category, uom, verification_status)
VALUES
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', '305664', 'HardieWrap Weather Resistant Barrier',  'Accessories', 'roll',   'pending_review'),
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', '305534', 'Joint Sealant',                          'Accessories', 'tube',   'pending_review'),
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', '305672', 'Joint Sealant (Coloured)',               'Accessories', 'tube',   'pending_review'),
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', '305555', 'PVC Vent Strip',                         'Accessories', 'length', 'pending_review'),
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', '305911', 'Edge Base Trim 6mm',                     'Accessories', 'length', 'pending_review'),
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', '305912', 'Edge Base Trim 10mm',                    'Accessories', 'length', 'pending_review'),
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', '305913', 'Edge Base Trim 15mm',                    'Accessories', 'length', 'pending_review'),
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', '305914', 'Edge Base Trim 20mm',                    'Accessories', 'length', 'pending_review'),
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', '304560', 'Flashing Tape',                          'Accessories', 'roll',   'pending_review'),
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', '305612', 'Thermal Strip',                          'Accessories', 'length', 'pending_review'),
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', '300660', 'Poly-Diamond Blade',                     'Tools',       'each',   'pending_review'),
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', NULL,     'Dust Reducing Saw',                      'Tools',       'each',   'pending_review'),
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', NULL,     'Gun Nails',                              'Fixings',     'box',    'pending_review')
ON CONFLICT DO NOTHING;

-- Step 3: Link components to the system
INSERT INTO staged_system_components (staged_system_id, staged_component_id, role, sort_order)
SELECT
  s.id AS staged_system_id,
  c.id AS staged_component_id,
  'required' AS role,
  ROW_NUMBER() OVER (ORDER BY c.sku NULLS LAST) AS sort_order
FROM staged_systems s
CROSS JOIN staged_components c
WHERE s.manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
  AND s.product_code = '305547'
  AND c.manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
  AND c.name IN (
    'HardieWrap Weather Resistant Barrier',
    'Joint Sealant',
    'Joint Sealant (Coloured)',
    'PVC Vent Strip',
    'Edge Base Trim 6mm',
    'Edge Base Trim 10mm',
    'Edge Base Trim 15mm',
    'Edge Base Trim 20mm',
    'Flashing Tape',
    'Thermal Strip',
    'Poly-Diamond Blade',
    'Dust Reducing Saw',
    'Gun Nails'
  )
ON CONFLICT DO NOTHING;

-- Verify
SELECT ss.name AS system, ss.product_code, COUNT(ssc.id) AS linked_components
FROM staged_systems ss
LEFT JOIN staged_system_components ssc ON ssc.staged_system_id = ss.id
WHERE ss.manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
  AND ss.product_code = '305547'
GROUP BY ss.id, ss.name, ss.product_code;