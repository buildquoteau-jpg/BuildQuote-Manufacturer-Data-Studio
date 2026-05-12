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
