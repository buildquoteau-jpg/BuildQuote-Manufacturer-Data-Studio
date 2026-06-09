INSERT INTO data_studio_manufacturers (name, slug, status)
VALUES ('Proclima', 'proclima', 'active')
RETURNING id, name;