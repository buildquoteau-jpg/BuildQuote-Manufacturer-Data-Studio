-- Local dev seed — do NOT apply to production.
-- Safe to re-run: ON CONFLICT DO NOTHING on the unique slug column.

INSERT INTO data_studio_manufacturers (name, slug, status, website_url, description)
VALUES
  (
    'NewTechWood',
    'newtechwood',
    'active',
    'https://www.newtechwood.com',
    'Composite decking and cladding manufacturer.'
  ),
  (
    'James Hardie',
    'james-hardie',
    'active',
    'https://www.jameshardie.com.au',
    'Fibre cement building products and cladding.'
  ),
  (
    'ModWood',
    'modwood',
    'draft',
    'https://www.modwood.com.au',
    'Recycled composite decking and screening.'
  )
ON CONFLICT (slug) DO NOTHING;

-- Local dev seed — source_documents linked to seeded manufacturers.
-- Uses placeholder storage values; no real keys or URLs.
INSERT INTO source_documents (
  manufacturer_id,
  original_filename,
  document_name,
  document_type,
  document_date,
  storage_provider,
  storage_bucket,
  storage_key,
  file_mime_type,
  file_size_bytes,
  status
)
VALUES
  (
    (SELECT id FROM data_studio_manufacturers WHERE slug = 'newtechwood'),
    'newtechwood-product-guide-2026.pdf',
    'NewTechWood Product Guide 2026',
    'product_guide',
    '2026',
    'cloudflare_r2',
    'dev-placeholder',
    'dev/newtechwood/newtechwood-product-guide-2026.pdf',
    'application/pdf',
    4200000,
    'uploaded'
  ),
  (
    (SELECT id FROM data_studio_manufacturers WHERE slug = 'james-hardie'),
    'james-hardie-installation-guide-2026.pdf',
    'James Hardie Installation Guide 2026',
    'installation_guide',
    '2026',
    'cloudflare_r2',
    'dev-placeholder',
    'dev/james-hardie/james-hardie-installation-guide-2026.pdf',
    'application/pdf',
    8100000,
    'uploaded'
  ),
  (
    (SELECT id FROM data_studio_manufacturers WHERE slug = 'modwood'),
    'modwood-brochure-2026.pdf',
    'ModWood Brochure 2026',
    'brochure',
    '2026',
    'cloudflare_r2',
    'dev-placeholder',
    'dev/modwood/modwood-brochure-2026.pdf',
    'application/pdf',
    1900000,
    'uploaded'
  );

-- ============================================================
-- Local dev seed — staged extraction data
-- UUIDs are stable so ON CONFLICT guards work after db reset.
-- Does not seed storage fields, secrets, or raw model output.
-- chunk raw_text is short, clearly sample-only copy.
--
-- UUID legend:
--   Extraction runs:   a0000000-0000-0000-0000-00000000000{1..3}
--   Document chunks:   d0000000-0000-0000-0000-00000000000{1..9}
--   Staged systems:    b0000000-0000-0000-0000-00000000000{1..7}
--   Staged components: c0000000-0000-0000-0000-00000000000{1..14}
-- ============================================================

-- ============================================================
-- EXTRACTION RUNS
-- run_type: parse_systems  status: completed
-- ============================================================

WITH docs AS (
  SELECT
    (SELECT sd.id FROM source_documents sd
       JOIN data_studio_manufacturers m ON m.id = sd.manufacturer_id
      WHERE m.slug = 'newtechwood'
        AND sd.document_name = 'NewTechWood Product Guide 2026')        AS ntw,
    (SELECT sd.id FROM source_documents sd
       JOIN data_studio_manufacturers m ON m.id = sd.manufacturer_id
      WHERE m.slug = 'james-hardie'
        AND sd.document_name = 'James Hardie Installation Guide 2026') AS jh,
    (SELECT sd.id FROM source_documents sd
       JOIN data_studio_manufacturers m ON m.id = sd.manufacturer_id
      WHERE m.slug = 'modwood'
        AND sd.document_name = 'ModWood Brochure 2026')                AS mw
)
INSERT INTO extraction_runs
  (id, source_document_id, run_type, status, tool_name, model_name, started_at, completed_at)
SELECT
  'a0000000-0000-0000-0000-000000000001'::uuid,
  ntw, 'parse_systems', 'completed',
  'buildquote-extractor', 'claude-3-5-sonnet-20241022',
  now() - interval '3 hours', now() - interval '2 hours'
FROM docs
UNION ALL
SELECT
  'a0000000-0000-0000-0000-000000000002'::uuid,
  jh, 'parse_systems', 'completed',
  'buildquote-extractor', 'claude-3-5-sonnet-20241022',
  now() - interval '2 hours', now() - interval '90 minutes'
FROM docs
UNION ALL
SELECT
  'a0000000-0000-0000-0000-000000000003'::uuid,
  mw, 'parse_systems', 'completed',
  'buildquote-extractor', 'claude-3-5-sonnet-20241022',
  now() - interval '90 minutes', now() - interval '1 hour'
FROM docs
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DOCUMENT CHUNKS
-- 3 chunks per document. raw_text is short sample-only copy.
-- chunk_type: system_description | product_table | accessory_list
--           | installation_notes | specification_table
-- ============================================================

WITH docs AS (
  SELECT
    (SELECT sd.id FROM source_documents sd
       JOIN data_studio_manufacturers m ON m.id = sd.manufacturer_id
      WHERE m.slug = 'newtechwood'
        AND sd.document_name = 'NewTechWood Product Guide 2026')        AS ntw,
    (SELECT sd.id FROM source_documents sd
       JOIN data_studio_manufacturers m ON m.id = sd.manufacturer_id
      WHERE m.slug = 'james-hardie'
        AND sd.document_name = 'James Hardie Installation Guide 2026') AS jh,
    (SELECT sd.id FROM source_documents sd
       JOIN data_studio_manufacturers m ON m.id = sd.manufacturer_id
      WHERE m.slug = 'modwood'
        AND sd.document_name = 'ModWood Brochure 2026')                AS mw
)
INSERT INTO document_chunks
  (id, source_document_id, extraction_run_id, chunk_index,
   heading, chunk_type, raw_text, confidence)
-- NTW chunks
SELECT 'd0000000-0000-0000-0000-000000000001'::uuid, ntw,
  'a0000000-0000-0000-0000-000000000001'::uuid, 1,
  'Decking Systems Overview', 'system_description',
  'Sample: Avenue, Terrace and Coastal composite decking ranges. UV-stable composite boards.',
  0.94
FROM docs
UNION ALL
SELECT 'd0000000-0000-0000-0000-000000000002'::uuid, ntw,
  'a0000000-0000-0000-0000-000000000001'::uuid, 2,
  'Product Specifications', 'product_table',
  'Sample: Avenue 138×29mm grooved. Terrace 138×29mm grooved. Coastal 138×29mm grooved.',
  0.91
FROM docs
UNION ALL
SELECT 'd0000000-0000-0000-0000-000000000003'::uuid, ntw,
  'a0000000-0000-0000-0000-000000000001'::uuid, 3,
  'Accessories and Fixings', 'accessory_list',
  'Sample: TC28 Timber Fix Decking Clip. TC45 Composite Joist Clip. End Trim Profile.',
  0.88
FROM docs
-- JH chunks
UNION ALL
SELECT 'd0000000-0000-0000-0000-000000000004'::uuid, jh,
  'a0000000-0000-0000-0000-000000000002'::uuid, 1,
  'System Descriptions', 'system_description',
  'Sample: Linea Weatherboard — horizontal lapped fibre cement. Axon — vertical channel panels.',
  0.96
FROM docs
UNION ALL
SELECT 'd0000000-0000-0000-0000-000000000005'::uuid, jh,
  'a0000000-0000-0000-0000-000000000002'::uuid, 2,
  'Installation Requirements', 'installation_notes',
  'Sample: Install over cavity battens. Fix with HardieDrive screws. Maintain 10mm base clearance.',
  0.92
FROM docs
UNION ALL
SELECT 'd0000000-0000-0000-0000-000000000006'::uuid, jh,
  'a0000000-0000-0000-0000-000000000002'::uuid, 3,
  'Technical Specifications', 'specification_table',
  'Sample: Linea 180mm exposure. Linea 230mm exposure. Axon 133mm reveal panel.',
  0.89
FROM docs
-- MW chunks
UNION ALL
SELECT 'd0000000-0000-0000-0000-000000000007'::uuid, mw,
  'a0000000-0000-0000-0000-000000000003'::uuid, 1,
  'Decking Product Range', 'system_description',
  'Sample: Xtreme Guard high-impact composite decking. Flame Shield fire-resistant composite decking.',
  0.93
FROM docs
UNION ALL
SELECT 'd0000000-0000-0000-0000-000000000008'::uuid, mw,
  'a0000000-0000-0000-0000-000000000003'::uuid, 2,
  'Colour Options', 'product_table',
  'Sample: Available in Teak, Ebony and Silver finishes across Xtreme and Flame ranges.',
  0.87
FROM docs
UNION ALL
SELECT 'd0000000-0000-0000-0000-000000000009'::uuid, mw,
  'a0000000-0000-0000-0000-000000000003'::uuid, 3,
  'Fixings and Accessories', 'accessory_list',
  'Sample: Grooved concealed clip. Fascia board available to match decking colour.',
  0.85
FROM docs
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STAGED SYSTEMS
-- verification_status mix to demonstrate badge colours:
--   approved | in_review | pending_review | needs_source_check
-- ============================================================

WITH mfrs AS (
  SELECT
    (SELECT id FROM data_studio_manufacturers WHERE slug = 'newtechwood')  AS ntw_mfr,
    (SELECT id FROM data_studio_manufacturers WHERE slug = 'james-hardie') AS jh_mfr,
    (SELECT id FROM data_studio_manufacturers WHERE slug = 'modwood')      AS mw_mfr
),
docs AS (
  SELECT
    (SELECT sd.id FROM source_documents sd
       JOIN data_studio_manufacturers m ON m.id = sd.manufacturer_id
      WHERE m.slug = 'newtechwood'
        AND sd.document_name = 'NewTechWood Product Guide 2026')        AS ntw_doc,
    (SELECT sd.id FROM source_documents sd
       JOIN data_studio_manufacturers m ON m.id = sd.manufacturer_id
      WHERE m.slug = 'james-hardie'
        AND sd.document_name = 'James Hardie Installation Guide 2026') AS jh_doc,
    (SELECT sd.id FROM source_documents sd
       JOIN data_studio_manufacturers m ON m.id = sd.manufacturer_id
      WHERE m.slug = 'modwood'
        AND sd.document_name = 'ModWood Brochure 2026')                AS mw_doc
)
INSERT INTO staged_systems
  (id, manufacturer_id, source_document_id, name, product_code,
   category, subcategory, description,
   verification_status, extraction_confidence, sort_order)
-- NTW systems
SELECT 'b0000000-0000-0000-0000-000000000001'::uuid, ntw_mfr, ntw_doc,
  'Avenue Range', 'NTW-AVE', 'Decking', 'Composite Decking',
  'Grooved-profile composite decking with UV-stable finish.',
  'approved', 0.91, 1
FROM mfrs, docs
UNION ALL
SELECT 'b0000000-0000-0000-0000-000000000002'::uuid, ntw_mfr, ntw_doc,
  'Terrace Range', 'NTW-TER', 'Decking', 'Composite Decking',
  'Wide-board grooved composite decking for open terraces.',
  'in_review', 0.88, 2
FROM mfrs, docs
UNION ALL
SELECT 'b0000000-0000-0000-0000-000000000003'::uuid, ntw_mfr, ntw_doc,
  'Coastal Range', 'NTW-CST', 'Decking', 'Composite Decking',
  'Salt-resistant composite decking for coastal environments.',
  'pending_review', 0.84, 3
FROM mfrs, docs
-- JH systems
UNION ALL
SELECT 'b0000000-0000-0000-0000-000000000004'::uuid, jh_mfr, jh_doc,
  'Linea Weatherboard System', 'JH-LIN', 'Cladding', 'Fibre Cement Weatherboard',
  'Horizontal lapped fibre cement weatherboard cladding system.',
  'approved', 0.94, 1
FROM mfrs, docs
UNION ALL
SELECT 'b0000000-0000-0000-0000-000000000005'::uuid, jh_mfr, jh_doc,
  'Axon Cladding System', 'JH-AXN', 'Cladding', 'Fibre Cement Panel',
  'Vertical channel fibre cement panel cladding system.',
  'pending_review', 0.89, 2
FROM mfrs, docs
-- MW systems
UNION ALL
SELECT 'b0000000-0000-0000-0000-000000000006'::uuid, mw_mfr, mw_doc,
  'Xtreme Guard Decking', 'MW-XTR', 'Decking', 'Composite Decking',
  'High-impact composite decking with concealed fixing system.',
  'pending_review', 0.86, 1
FROM mfrs, docs
UNION ALL
SELECT 'b0000000-0000-0000-0000-000000000007'::uuid, mw_mfr, mw_doc,
  'Flame Shield Decking', 'MW-FLM', 'Decking', 'Composite Decking',
  'Fire-resistant composite decking for bushfire-prone areas.',
  'needs_source_check', 0.78, 2
FROM mfrs, docs
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STAGED COMPONENTS
-- uom values: lm (linear metre) | pk50/pk100/pk250 (packs) | each
-- ============================================================

WITH mfrs AS (
  SELECT
    (SELECT id FROM data_studio_manufacturers WHERE slug = 'newtechwood')  AS ntw_mfr,
    (SELECT id FROM data_studio_manufacturers WHERE slug = 'james-hardie') AS jh_mfr,
    (SELECT id FROM data_studio_manufacturers WHERE slug = 'modwood')      AS mw_mfr
),
docs AS (
  SELECT
    (SELECT sd.id FROM source_documents sd
       JOIN data_studio_manufacturers m ON m.id = sd.manufacturer_id
      WHERE m.slug = 'newtechwood'
        AND sd.document_name = 'NewTechWood Product Guide 2026')        AS ntw_doc,
    (SELECT sd.id FROM source_documents sd
       JOIN data_studio_manufacturers m ON m.id = sd.manufacturer_id
      WHERE m.slug = 'james-hardie'
        AND sd.document_name = 'James Hardie Installation Guide 2026') AS jh_doc,
    (SELECT sd.id FROM source_documents sd
       JOIN data_studio_manufacturers m ON m.id = sd.manufacturer_id
      WHERE m.slug = 'modwood'
        AND sd.document_name = 'ModWood Brochure 2026')                AS mw_doc
)
INSERT INTO staged_components
  (id, manufacturer_id, source_document_id, name, sku, description,
   category, uom, material,
   verification_status, extraction_confidence, sort_order)
-- NTW components
SELECT 'c0000000-0000-0000-0000-000000000001'::uuid, ntw_mfr, ntw_doc,
  'Avenue Decking Board', 'NTW-AVE-138',
  'Grooved composite decking board 138×29mm.',
  'Decking Board', 'lm', 'Composite',
  'approved', 0.93, 1
FROM mfrs, docs
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000002'::uuid, ntw_mfr, ntw_doc,
  'Terrace Decking Board', 'NTW-TER-138',
  'Wide-board grooved composite decking board 138×29mm.',
  'Decking Board', 'lm', 'Composite',
  'in_review', 0.89, 2
FROM mfrs, docs
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000003'::uuid, ntw_mfr, ntw_doc,
  'Coastal Decking Board', 'NTW-CST-138',
  'Salt-resistant composite decking board 138×29mm.',
  'Decking Board', 'lm', 'Composite',
  'pending_review', 0.85, 3
FROM mfrs, docs
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000004'::uuid, ntw_mfr, ntw_doc,
  'TC28 Timber Fix Decking Clip', 'NTW-TC28',
  'Decking clip for timber joist installation.',
  'Fixing', 'pk100', 'Stainless Steel',
  'approved', 0.91, 4
FROM mfrs, docs
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000005'::uuid, ntw_mfr, ntw_doc,
  'TC45 Composite Joist Clip', 'NTW-TC45',
  'Decking clip for composite joist installation.',
  'Fixing', 'pk100', 'Stainless Steel',
  'pending_review', 0.87, 5
FROM mfrs, docs
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000006'::uuid, ntw_mfr, ntw_doc,
  'End Trim Profile', 'NTW-TRIM',
  'Composite end trim to finish decking edges.',
  'Trim', 'lm', 'Composite',
  'pending_review', 0.82, 6
FROM mfrs, docs
-- JH components
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000007'::uuid, jh_mfr, jh_doc,
  'Linea Weatherboard', 'JH-LIN-WB',
  'Fibre cement weatherboard for horizontal lapped cladding.',
  'Cladding Panel', 'lm', 'Fibre Cement',
  'approved', 0.95, 1
FROM mfrs, docs
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000008'::uuid, jh_mfr, jh_doc,
  'Axon Cladding Panel', 'JH-AXN-P',
  'Vertical channel fibre cement cladding panel.',
  'Cladding Panel', 'lm', 'Fibre Cement',
  'pending_review', 0.90, 2
FROM mfrs, docs
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000009'::uuid, jh_mfr, jh_doc,
  'Cavity Batten', 'JH-BATT',
  'Treated timber cavity batten for cladding substrate.',
  'Installation Accessory', 'lm', 'Treated Timber',
  'approved', 0.88, 3
FROM mfrs, docs
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000010'::uuid, jh_mfr, jh_doc,
  'HardieDrive Screw', 'JH-SCRW',
  'Corrosion-resistant screw for fibre cement fixing.',
  'Fixing', 'pk250', 'Stainless Steel',
  'pending_review', 0.84, 4
FROM mfrs, docs
-- MW components
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000011'::uuid, mw_mfr, mw_doc,
  'Xtreme Guard Decking Board', 'MW-XTR-DB',
  'High-impact composite decking board with grooved profile.',
  'Decking Board', 'lm', 'Composite',
  'pending_review', 0.87, 1
FROM mfrs, docs
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000012'::uuid, mw_mfr, mw_doc,
  'Flame Shield Decking Board', 'MW-FLM-DB',
  'Fire-resistant composite decking board.',
  'Decking Board', 'lm', 'Composite',
  'needs_source_check', 0.79, 2
FROM mfrs, docs
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000013'::uuid, mw_mfr, mw_doc,
  'Grooved Concealed Clip', 'MW-CLIP',
  'Stainless steel concealed clip for grooved decking boards.',
  'Fixing', 'pk50', 'Stainless Steel',
  'pending_review', 0.83, 3
FROM mfrs, docs
UNION ALL
SELECT 'c0000000-0000-0000-0000-000000000014'::uuid, mw_mfr, mw_doc,
  'Fascia Board', 'MW-FSC',
  'Matching composite fascia board for decking edge finish.',
  'Trim', 'lm', 'Composite',
  'pending_review', 0.80, 4
FROM mfrs, docs
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STAGED SYSTEM COMPONENTS (system → component relationships)
-- role: required | optional | accessory
-- ============================================================

INSERT INTO staged_system_components
  (staged_system_id, staged_component_id, role, sort_order,
   verification_status, extraction_confidence)
VALUES
  -- NTW Avenue (b001): board + clips + trim
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'required',  1, 'approved',       0.93),
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 'required',  2, 'approved',       0.91),
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005', 'optional',  3, 'pending_review', 0.84),
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000006', 'accessory', 4, 'pending_review', 0.80),
  -- NTW Terrace (b002): board + clip + trim
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'required',  1, 'in_review',      0.89),
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'required',  2, 'pending_review', 0.86),
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000006', 'accessory', 3, 'pending_review', 0.78),
  -- NTW Coastal (b003): board + clip + trim
  ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'required',  1, 'pending_review', 0.85),
  ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000005', 'required',  2, 'pending_review', 0.82),
  ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000006', 'accessory', 3, 'pending_review', 0.76),
  -- JH Linea (b004): board + batten + screw
  ('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000007', 'required',  1, 'approved',       0.95),
  ('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000009', 'required',  2, 'approved',       0.90),
  ('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000010', 'required',  3, 'pending_review', 0.86),
  -- JH Axon (b005): panel + batten + screw
  ('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000008', 'required',  1, 'pending_review', 0.90),
  ('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000009', 'required',  2, 'pending_review', 0.87),
  ('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000010', 'required',  3, 'pending_review', 0.83),
  -- MW Xtreme (b006): board + clip + fascia
  ('b0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000011', 'required',  1, 'pending_review', 0.87),
  ('b0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000013', 'required',  2, 'pending_review', 0.83),
  ('b0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000014', 'accessory', 3, 'pending_review', 0.78),
  -- MW Flame (b007): board + clip + fascia
  ('b0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000012', 'required',  1, 'needs_source_check', 0.79),
  ('b0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000013', 'required',  2, 'pending_review', 0.81),
  ('b0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000014', 'accessory', 3, 'pending_review', 0.75)
ON CONFLICT (staged_system_id, staged_component_id) DO NOTHING;

-- ============================================================
-- STAGED SYSTEM COLOURS
-- NTW decking and MW decking only (JH colours are factory-painted).
-- ============================================================

INSERT INTO staged_system_colours
  (staged_system_id, colour_name, is_stocked, sort_order, verification_status)
VALUES
  -- NTW Avenue (b001)
  ('b0000000-0000-0000-0000-000000000001', 'Teak',    true,  1, 'approved'),
  ('b0000000-0000-0000-0000-000000000001', 'Antique', true,  2, 'approved'),
  ('b0000000-0000-0000-0000-000000000001', 'Ipe',     true,  3, 'pending_review'),
  -- NTW Terrace (b002)
  ('b0000000-0000-0000-0000-000000000002', 'Teak',    true,  1, 'in_review'),
  ('b0000000-0000-0000-0000-000000000002', 'Silver',  true,  2, 'pending_review'),
  ('b0000000-0000-0000-0000-000000000002', 'Antique', true,  3, 'pending_review'),
  -- NTW Coastal (b003)
  ('b0000000-0000-0000-0000-000000000003', 'Teak',    true,  1, 'pending_review'),
  ('b0000000-0000-0000-0000-000000000003', 'Silver',  true,  2, 'pending_review'),
  -- MW Xtreme (b006)
  ('b0000000-0000-0000-0000-000000000006', 'Teak',    true,  1, 'pending_review'),
  ('b0000000-0000-0000-0000-000000000006', 'Ebony',   true,  2, 'pending_review'),
  ('b0000000-0000-0000-0000-000000000006', 'Silver',  false, 3, 'pending_review'),
  -- MW Flame (b007)
  ('b0000000-0000-0000-0000-000000000007', 'Teak',    true,  1, 'pending_review'),
  ('b0000000-0000-0000-0000-000000000007', 'Ebony',   true,  2, 'needs_source_check')
ON CONFLICT (staged_system_id, colour_name) DO NOTHING;

-- ============================================================
-- STAGED SYSTEM PROFILES
-- NTW grooved board dimensions. JH Linea exposure options.
-- (no unique constraint — plain INSERT; safe after db reset)
-- ============================================================

INSERT INTO staged_system_profiles
  (staged_system_id, name, dimensions, sort_order, verification_status)
VALUES
  -- NTW Avenue (b001)
  ('b0000000-0000-0000-0000-000000000001', '138 × 29mm Grooved', '138mm wide, 29mm thick', 1, 'approved'),
  -- NTW Terrace (b002)
  ('b0000000-0000-0000-0000-000000000002', '138 × 29mm Grooved', '138mm wide, 29mm thick', 1, 'in_review'),
  -- NTW Coastal (b003)
  ('b0000000-0000-0000-0000-000000000003', '138 × 29mm Grooved', '138mm wide, 29mm thick', 1, 'pending_review'),
  -- JH Linea (b004)
  ('b0000000-0000-0000-0000-000000000004', '180mm Exposure', '180mm face exposure', 1, 'approved'),
  ('b0000000-0000-0000-0000-000000000004', '230mm Exposure', '230mm face exposure', 2, 'pending_review');
