-- ================================================================
-- Missing components: Stria Fine Cladding (product_code: 305547)
-- Manufacturer: James Hardie
-- manufacturer_id: 6092e3a5-a542-4869-a2b2-6fc34cc82c83
-- Each INSERT skips if the SKU already exists for this manufacturer.
-- ================================================================

-- 1. HardieWrap Weather Barrier
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, roll_m, coverage_m2, pack_format, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  '305664',
  'HardieWrap Weather Barrier',
  'Water barrier and vapour permeable membrane. Unit size: 2.75 x 30m.',
  'Membrane', 'roll', 30, 85.5, '1 per pack', 10
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE sku = '305664' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

-- 2. Hardie Joint Sealant 300ml Cartridge
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, volume_ml, pack_format, supplier_pack_qty, supplier_pack_uom, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  '305534',
  'Hardie Joint Sealant 300ml Cartridge',
  'General purpose polyurethane exterior grade joint sealant. Coverage: 2.67m per 100ml at 5mm dia bead.',
  'Adhesive', 'tube', 300, '20 per box', 20, 'box', 20
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE sku = '305534' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

-- 3. Hardie Joint Sealant 600ml Sausage
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, volume_ml, pack_format, supplier_pack_qty, supplier_pack_uom, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  '305672',
  'Hardie Joint Sealant 600ml Sausage',
  'General purpose polyurethane exterior grade joint sealant. Coverage: 2.67m per 100ml at 5mm dia bead.',
  'Adhesive', 'sausage', 600, '20 per box', 20, 'box', 30
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE sku = '305672' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

-- 4. Hardie PVC Cavity Vent Strip
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, pack_format, supplier_pack_qty, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  '305555',
  'Hardie PVC Cavity Vent Strip',
  'Perforated PVC extrusion used at the bottom of walls behind cladding.',
  'Other', 'pack', '25 per pack', 25, 40
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE sku = '305555' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

-- 5. Hardie Edge Base Trim
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, material, pack_format, supplier_pack_qty, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  '305911',
  'Hardie Edge Base Trim',
  'Powder coated aluminium extrusion used at slab edges.',
  'Trims', 'pack', 'Aluminium', '25 per pack', 25, 50
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE sku = '305911' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

-- 6. Hardie Edge Base Trim Connector
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, material, pack_format, supplier_pack_qty, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  '305912',
  'Hardie Edge Base Trim Connector',
  'Powder coated aluminium extrusion connector for use with Hardie Edge Base Trim.',
  'Trims', 'pack', 'Aluminium', '12 per pack', 12, 60
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE sku = '305912' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

-- 7. Hardie Edge Base Trim Internal Corner
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, material, pack_format, supplier_pack_qty, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  '305913',
  'Hardie Edge Base Trim Internal Corner',
  'Powder coated aluminium extrusion for internal corner junctions with Hardie Edge Base Trim.',
  'Trims', 'pack', 'Aluminium', '4 per pack', 4, 70
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE sku = '305913' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

-- 8. Hardie Edge Base Trim External Corner
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, material, pack_format, supplier_pack_qty, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  '305914',
  'Hardie Edge Base Trim External Corner',
  'Powder coated aluminium extrusion for external corner junctions with Hardie Edge Base Trim.',
  'Trims', 'pack', 'Aluminium', '4 per pack', 4, 80
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE sku = '305914' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

-- 9. Joint Flashing Tape
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, width_mm, roll_m, pack_format, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  '304560',
  'Hardie Joint Flashing Tape',
  'Installed under sheet vertical joints to improve water tightness. 50mm wide x 25m roll.',
  'Membrane', 'roll', 50, 25, '1 per pack', 90
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE sku = '304560' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

-- 10. Hardie Break Thermal Strip
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, pack_format, supplier_pack_qty, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  '305612',
  'Hardie Break Thermal Strip',
  'Hard, dual layer density self-adhesive strip installed directly over a vapour permeable membrane and framing members.',
  'Insulation', 'pack', '45 per pack', 45, 100
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE sku = '305612' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

-- 11. Poly-Diamond Blade
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, pack_format, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  '300660',
  'Hardie Poly-Diamond Blade',
  'Poly-diamond blade for cutting Hardie fibre cement products.',
  'Other', 'each', '1 per pack', 110
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE sku = '300660' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

-- 12. Dust Reducing Saw (tool recommendation — no SKU)
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  NULL,
  'Dust Reducing Saw',
  'Dust reducing saw fitted with a Hardie Blade. E.g. Makita 5057KB or Hitachi C7YA.',
  'Other', 'each', 120
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE name = 'Dust Reducing Saw' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);

-- 13. Gun Nails
INSERT INTO staged_components
  (manufacturer_id, sku, name, description, category, uom, sort_order)
SELECT
  '6092e3a5-a542-4869-a2b2-6fc34cc82c83',
  NULL,
  'Gun Nails',
  'Suitable gun nails for face fixing to timber framing only. Minimum nail length 50mm. Minimum class 3.',
  'Screws', 'pack', 130
WHERE NOT EXISTS (
  SELECT 1 FROM staged_components
  WHERE name = 'Gun Nails' AND manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
);


-- ================================================================
-- Link all components to Stria Fine Cladding (product_code: 305547)
-- Skips any already linked.
-- ================================================================

INSERT INTO staged_system_components (staged_system_id, staged_component_id, role, sort_order)
SELECT
  s.id,
  c.id,
  'required',
  c.sort_order
FROM staged_systems s
CROSS JOIN staged_components c
WHERE s.manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
  AND s.product_code = '305547'
  AND c.manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
  AND c.sku IN ('305664','305534','305672','305555','305911','305912','305913','305914','304560','305612','300660')
  AND NOT EXISTS (
    SELECT 1 FROM staged_system_components sc
    WHERE sc.staged_system_id = s.id AND sc.staged_component_id = c.id
  );

-- Link no-SKU items as recommended
INSERT INTO staged_system_components (staged_system_id, staged_component_id, role, sort_order)
SELECT
  s.id,
  c.id,
  'recommended',
  c.sort_order
FROM staged_systems s
CROSS JOIN staged_components c
WHERE s.manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
  AND s.product_code = '305547'
  AND c.manufacturer_id = '6092e3a5-a542-4869-a2b2-6fc34cc82c83'
  AND c.name IN ('Dust Reducing Saw', 'Gun Nails')
  AND NOT EXISTS (
    SELECT 1 FROM staged_system_components sc
    WHERE sc.staged_system_id = s.id AND sc.staged_component_id = c.id
  );