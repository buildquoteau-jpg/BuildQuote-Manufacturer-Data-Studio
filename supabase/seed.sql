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
