-- Fix public_token default: 'base64url' is not a valid Postgres encoding.
-- Switch to hex (URL-safe, 48 chars).
ALTER TABLE manufacturer_embed_widgets
  ALTER COLUMN public_token SET DEFAULT encode(gen_random_bytes(24), 'hex');
