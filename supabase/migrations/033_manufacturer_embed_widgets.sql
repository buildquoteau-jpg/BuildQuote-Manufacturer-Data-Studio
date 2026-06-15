-- Manufacturer embed widgets
-- A manufacturer can create one or more embeddable product widgets
-- served from studio.buildquote.com.au/widget/[token].
-- Only verified/published staged systems may be added.

CREATE TABLE manufacturer_embed_widgets (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id uuid      NOT NULL REFERENCES data_studio_manufacturers(id) ON DELETE CASCADE,
  public_token  text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64url'),
  status        text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE manufacturer_embed_widget_systems (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embed_widget_id uuid NOT NULL REFERENCES manufacturer_embed_widgets(id) ON DELETE CASCADE,
  staged_system_id uuid NOT NULL REFERENCES staged_systems(id) ON DELETE CASCADE,
  sort_order     int  NOT NULL DEFAULT 0,
  UNIQUE (embed_widget_id, staged_system_id)
);

-- Read: manufacturer users can read their own widgets
CREATE POLICY "manufacturer_embed_widgets_read"
  ON manufacturer_embed_widgets FOR SELECT
  USING (
    manufacturer_id IN (
      SELECT manufacturer_id FROM manufacturer_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- Public read for the widget page (anon token lookup)
CREATE POLICY "manufacturer_embed_widgets_public_read"
  ON manufacturer_embed_widgets FOR SELECT
  USING (status = 'active');

-- Read policy for widget systems join table
CREATE POLICY "manufacturer_embed_widget_systems_read"
  ON manufacturer_embed_widget_systems FOR SELECT
  USING (true);

-- Write: manufacturer users can insert/update/delete their own widgets
CREATE POLICY "manufacturer_embed_widgets_write"
  ON manufacturer_embed_widgets FOR ALL
  USING (
    manufacturer_id IN (
      SELECT manufacturer_id FROM manufacturer_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "manufacturer_embed_widget_systems_write"
  ON manufacturer_embed_widget_systems FOR ALL
  USING (
    embed_widget_id IN (
      SELECT id FROM manufacturer_embed_widgets
      WHERE manufacturer_id IN (
        SELECT manufacturer_id FROM manufacturer_users
        WHERE auth_user_id = auth.uid() AND status = 'active'
      )
    )
  );

ALTER TABLE manufacturer_embed_widgets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE manufacturer_embed_widget_systems ENABLE ROW LEVEL SECURITY;
