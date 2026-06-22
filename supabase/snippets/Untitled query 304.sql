INSERT INTO data_studio_manufacturers (id, name, slug, status) VALUES
  ('6092e3a5-a542-4869-a2b2-6fc34cc82c83', 'James Hardie', 'james-hardie', 'active'),
  ('07f2349c-2dfd-4f81-abd9-6b0bdac2a034', 'Designer Groove', 'designer-groove', 'active'),
  (gen_random_uuid(),                       'JDS',            'jds',            'active')
RETURNING id, name;