-- Migration 070: Public manufacturer contact email & support contact name/desk
-- Additive only. Gives manufacturers dedicated public contact fields in Brand
-- Profile (alongside existing `phone`) so builders and homeowners can call or
-- email someone at the brand directly from Decks WA / BuildQuote without
-- leaving the site.

ALTER TABLE public.data_studio_manufacturers
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_email text;
