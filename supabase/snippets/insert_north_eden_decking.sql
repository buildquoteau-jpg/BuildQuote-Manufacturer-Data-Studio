-- Manual insert: North Eden Timber decking range
-- Manufacturer: North Eden Timber (id 13a6f72c-d3de-4ed2-95ce-95c9a02cf2b1) — confirmed live in data_studio_manufacturers
-- Source: "north eden - Sheet1.csv" (user-supplied spec sheet)
-- Systems are grouped by TIMBER SPECIES (e.g. "Blackbutt Decking"). Each decking profile/spec that species is
-- available in (e.g. "135x32mm Decking - Heavy-duty premium") is stored as a staged_system_profiles row
-- ("available in"). Species-level attributes (BAL rating, hardwood/softwood classification) are stored once
-- per system via staged_systems.custom_technical_attributes jsonb.
-- Skips the docling/parser pipeline — direct staged_* inserts, verification_status defaults to 'pending_review'.
-- Run manually against the Data Studio project (ovndokzwkxpfjfobewaq). Do NOT run on RFQ/production project.

DO $$
DECLARE
  v_mfr_id uuid := '13a6f72c-d3de-4ed2-95ce-95c9a02cf2b1';
  v_sys_id uuid;
BEGIN

  -- =========================================================
  -- 1. Blackbutt Decking
  --    Available in: 135x32mm (Heavy-duty premium), 64x19mm (Extra narrow),
  --                  40x30mm, 40x19mm
  -- =========================================================
  INSERT INTO staged_systems (
    manufacturer_id, name, category, subcategory, description, notes,
    custom_technical_attributes
  )
  VALUES (
    v_mfr_id, 'Blackbutt Decking', 'Decking', 'Timber species',
    'Blackbutt decking, available across multiple profiles.',
    'UOM: lineal mtr. Source: north eden - Sheet1.csv.',
    '[
      {"label": "BAL rating", "value": "Bal 29"},
      {"label": "Classification", "value": "Australian Hardwood"}
    ]'::jsonb
  )
  RETURNING id INTO v_sys_id;

  INSERT INTO staged_system_profiles (staged_system_id, name, profile_name, dimensions, uom, sort_order)
  VALUES
    (v_sys_id, '135x32mm Decking', 'Heavy-duty premium', '135 x 32 mm', 'lineal mtr', 1),
    (v_sys_id, '64x19mm Decking', 'Extra narrow', '64 x 19 mm', 'lineal mtr', 2),
    (v_sys_id, '40x30mm Decking', '40x30', '40 x 30 mm', 'lineal mtr', 3),
    (v_sys_id, '40x19mm Decking', '40x19', '40 x 19 mm', 'lineal mtr', 4);

  -- =========================================================
  -- 2. Spotted Gum Decking
  --    Available in: 135x32mm, 135x19, 86x19mm, 64x19mm, 40x30mm, 40x19mm (all profiles)
  -- =========================================================
  INSERT INTO staged_systems (
    manufacturer_id, name, category, subcategory, description, notes,
    custom_technical_attributes
  )
  VALUES (
    v_mfr_id, 'Spotted Gum Decking', 'Decking', 'Timber species',
    'Spotted Gum decking, available across multiple profiles.',
    'UOM: lineal mtr. Source: north eden - Sheet1.csv.',
    '[
      {"label": "BAL rating", "value": "Bal 29"},
      {"label": "Classification", "value": "Australian Hardwood"}
    ]'::jsonb
  )
  RETURNING id INTO v_sys_id;

  INSERT INTO staged_system_profiles (staged_system_id, name, profile_name, dimensions, uom, sort_order)
  VALUES
    (v_sys_id, '135x32mm Decking', 'Heavy-duty premium', '135 x 32 mm', 'lineal mtr', 1),
    (v_sys_id, '135x19 Decking', 'Premium Residential', '135 x 19 mm', 'lineal mtr', 2),
    (v_sys_id, '86x19mm Decking', 'Traditional Residential Narrow', '86 x 19 mm', 'lineal mtr', 3),
    (v_sys_id, '64x19mm Decking', 'Extra narrow', '64 x 19 mm', 'lineal mtr', 4),
    (v_sys_id, '40x30mm Decking', '40x30', '40 x 30 mm', 'lineal mtr', 5),
    (v_sys_id, '40x19mm Decking', '40x19', '40 x 19 mm', 'lineal mtr', 6);

  -- =========================================================
  -- 3. Ironbark Decking
  --    Available in: 135x32mm, 135x19, 86x19mm, 64x19mm, 40x30mm, 40x19mm (all profiles)
  -- =========================================================
  INSERT INTO staged_systems (
    manufacturer_id, name, category, subcategory, description, notes,
    custom_technical_attributes
  )
  VALUES (
    v_mfr_id, 'Ironbark Decking', 'Decking', 'Timber species',
    'Ironbark decking, available across multiple profiles.',
    'UOM: lineal mtr. Source: north eden - Sheet1.csv.',
    '[
      {"label": "BAL rating", "value": "Bal 29"},
      {"label": "Classification", "value": "Australian Hardwood"}
    ]'::jsonb
  )
  RETURNING id INTO v_sys_id;

  INSERT INTO staged_system_profiles (staged_system_id, name, profile_name, dimensions, uom, sort_order)
  VALUES
    (v_sys_id, '135x32mm Decking', 'Heavy-duty premium', '135 x 32 mm', 'lineal mtr', 1),
    (v_sys_id, '135x19 Decking', 'Premium Residential', '135 x 19 mm', 'lineal mtr', 2),
    (v_sys_id, '86x19mm Decking', 'Traditional Residential Narrow', '86 x 19 mm', 'lineal mtr', 3),
    (v_sys_id, '64x19mm Decking', 'Extra narrow', '64 x 19 mm', 'lineal mtr', 4),
    (v_sys_id, '40x30mm Decking', '40x30', '40 x 30 mm', 'lineal mtr', 5),
    (v_sys_id, '40x19mm Decking', '40x19', '40 x 19 mm', 'lineal mtr', 6);

  -- =========================================================
  -- 4. Silvertop Ash Decking
  --    Available in: 135x19, 64x19mm, 40x30mm, 40x19mm
  -- =========================================================
  INSERT INTO staged_systems (
    manufacturer_id, name, category, subcategory, description, notes,
    custom_technical_attributes
  )
  VALUES (
    v_mfr_id, 'Silvertop Ash Decking', 'Decking', 'Timber species',
    'Silvertop Ash decking, available across multiple profiles.',
    'UOM: lineal mtr. Source: north eden - Sheet1.csv.',
    '[
      {"label": "BAL rating", "value": "Bal 29"},
      {"label": "Classification", "value": "Australian Hardwood"}
    ]'::jsonb
  )
  RETURNING id INTO v_sys_id;

  INSERT INTO staged_system_profiles (staged_system_id, name, profile_name, dimensions, uom, sort_order)
  VALUES
    (v_sys_id, '135x19 Decking', 'Premium Residential', '135 x 19 mm', 'lineal mtr', 1),
    (v_sys_id, '64x19mm Decking', 'Extra narrow', '64 x 19 mm', 'lineal mtr', 2),
    (v_sys_id, '40x30mm Decking', '40x30', '40 x 30 mm', 'lineal mtr', 3),
    (v_sys_id, '40x19mm Decking', '40x19', '40 x 19 mm', 'lineal mtr', 4);

  -- =========================================================
  -- 5. Red Gum Decking
  --    Available in: 64x19mm, 40x30mm, 40x19mm
  -- =========================================================
  INSERT INTO staged_systems (
    manufacturer_id, name, category, subcategory, description, notes,
    custom_technical_attributes
  )
  VALUES (
    v_mfr_id, 'Red Gum Decking', 'Decking', 'Timber species',
    'Red Gum decking, available across multiple profiles.',
    'UOM: lineal mtr. Source: north eden - Sheet1.csv.',
    '[
      {"label": "Classification", "value": "Australian Hardwood"},
      {"label": "BAL rating", "value": "Bal 12.5, Bal 19"}
    ]'::jsonb
  )
  RETURNING id INTO v_sys_id;

  INSERT INTO staged_system_profiles (staged_system_id, name, profile_name, dimensions, uom, sort_order)
  VALUES
    (v_sys_id, '64x19mm Decking', 'Extra narrow', '64 x 19 mm', 'lineal mtr', 1),
    (v_sys_id, '40x30mm Decking', '40x30', '40 x 30 mm', 'lineal mtr', 2),
    (v_sys_id, '40x19mm Decking', '40x19', '40 x 19 mm', 'lineal mtr', 3);

  -- =========================================================
  -- 6. White Mahogany Decking
  --    Available in: 64x19mm, 40x30mm, 40x19mm
  -- =========================================================
  INSERT INTO staged_systems (
    manufacturer_id, name, category, subcategory, description, notes,
    custom_technical_attributes
  )
  VALUES (
    v_mfr_id, 'White Mahogany Decking', 'Decking', 'Timber species',
    'White Mahogany decking, available across multiple profiles.',
    'UOM: lineal mtr. Source: north eden - Sheet1.csv.',
    '[
      {"label": "BAL rating", "value": "Bal 12.5, Bal 19"},
      {"label": "Classification", "value": "Australian Hardwood"}
    ]'::jsonb
  )
  RETURNING id INTO v_sys_id;

  INSERT INTO staged_system_profiles (staged_system_id, name, profile_name, dimensions, uom, sort_order)
  VALUES
    (v_sys_id, '64x19mm Decking', 'Extra narrow', '64 x 19 mm', 'lineal mtr', 1),
    (v_sys_id, '40x30mm Decking', '40x30', '40 x 30 mm', 'lineal mtr', 2),
    (v_sys_id, '40x19mm Decking', '40x19', '40 x 19 mm', 'lineal mtr', 3);

  -- =========================================================
  -- 7. Cypress Decking
  --    Available in: 64x19mm, 40x30mm, 40x19mm
  -- =========================================================
  INSERT INTO staged_systems (
    manufacturer_id, name, category, subcategory, description, notes,
    custom_technical_attributes
  )
  VALUES (
    v_mfr_id, 'Cypress Decking', 'Decking', 'Timber species',
    'Cypress decking, available across multiple profiles.',
    'UOM: lineal mtr. Source: north eden - Sheet1.csv.',
    '[
      {"label": "BAL rating", "value": "Bal 12.5"},
      {"label": "Classification", "value": "Australian Softwood"}
    ]'::jsonb
  )
  RETURNING id INTO v_sys_id;

  INSERT INTO staged_system_profiles (staged_system_id, name, profile_name, dimensions, uom, sort_order)
  VALUES
    (v_sys_id, '64x19mm Decking', 'Extra narrow', '64 x 19 mm', 'lineal mtr', 1),
    (v_sys_id, '40x30mm Decking', '40x30', '40 x 30 mm', 'lineal mtr', 2),
    (v_sys_id, '40x19mm Decking', '40x19', '40 x 19 mm', 'lineal mtr', 3);

  RAISE NOTICE 'Inserted 7 North Eden Timber decking systems (by species) for manufacturer %', v_mfr_id;
END $$;
