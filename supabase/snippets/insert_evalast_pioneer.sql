-- Manual insert: Eva-Last "Pioneer" decking system
-- Manufacturer: Evalast (id c4958e13-e233-49f9-9a82-07b2575ed999) — confirmed live in data_studio_manufacturers
-- Source: AU-Pioneer-Brochure.pdf (Eva-Last ITEM: PIONEER BROCHURE 0525 V1)
-- Skips the docling/parser pipeline — direct staged_* inserts, verification_status defaults to 'pending_review'.
-- Run manually in Supabase SQL editor against the Data Studio project (ovndokzwkxpfjfobewaq). Do NOT run on RFQ prod.

DO $$
DECLARE
  v_mfr_id  uuid := 'c4958e13-e233-49f9-9a82-07b2575ed999';
  v_sys_id  uuid;
BEGIN

  -- 1. System
  INSERT INTO staged_systems (
    manufacturer_id,
    name,
    category,
    subcategory,
    description,
    double_sided,
    moisture_resistant,
    sheet_format,
    bal_rating,
    notes
  )
  VALUES (
    v_mfr_id,
    'Pioneer',
    'Decking',
    'Composite decking',
    'Real wood replicated in a reinforced PVC composite. High-resolution digital print replication of real timbers over a foamed-PVC, glass fibre-reinforced (GFR) core, with a clear outer wear layer protecting colour and resiliency. Increased strength/span capability, reduced expansion & contraction, decay/insect/moisture resistant, slip resistant (P4), low maintenance. Made with recycled plastic and solar energy in manufacture.',
    false,
    true,
    NULL,
    NULL,
    '30 year limited warranty. Grooved board install via HULK hidden fastener clips (S-Series or Chain collated). Starter board (square outside edge) via HULK hidden fastener clips on grooved edge + HULK colour-matched top-fixing screws on the square edge — used for picture-frame edges/stair nosings. Colours available vary by region — confirm regional brochure. Source: AU-Pioneer-Brochure.pdf.'
  )
  RETURNING id INTO v_sys_id;

  -- 2. Profiles (board types)
  -- Recommended joist spacing is 450mm centre-to-centre for both profiles (per brochure);
  -- stored in parser_notes since staged_system_profiles has no dedicated span/spacing column.
  INSERT INTO staged_system_profiles (
    staged_system_id, name, profile_name, dimensions,
    length_m, length_mm, width_mm, thickness_mm, weight_kg, uom, sort_order, parser_notes
  )
  VALUES
    (v_sys_id, 'Grooved Board', 'Grooved both sides', '145 x 21 mm', 5.45, 5450, 145, 21, 2.68, 'kg/lm', 1,
      '{"joist_spacing_mm": 450, "joist_spacing_note": "centre to centre, indicative - refer technical data sheet for spans/loads", "fasteners": "HULK hidden fastener clips - S-Series or Chain collated"}'::jsonb),
    (v_sys_id, 'Starter Board', 'Starter profile (square outside edge)', '145 x 21 mm', 5.45, 5450, 145, 21, 2.72, 'kg/lm', 2,
      '{"joist_spacing_mm": 450, "joist_spacing_note": "centre to centre, indicative - refer technical data sheet for spans/loads", "fasteners": "HULK hidden fastener clips on grooved edge; HULK colour-matched top-fixing screws on square edge"}'::jsonb);

  -- 3. Colours
  INSERT INTO staged_system_colours (
    staged_system_id, colour_name, sort_order
  )
  VALUES
    (v_sys_id, 'Blackbutt Natural', 1),
    (v_sys_id, 'Blackbutt', 2),
    (v_sys_id, 'Spotted Gum', 3),
    (v_sys_id, 'Weathered Blackbutt', 4);

  RAISE NOTICE 'Inserted staged_system % (Pioneer)', v_sys_id;

END $$;
