-- Migration 043: widget_quote_requests table
-- Stores direct RFQ submissions from the embedded manufacturer widget.
-- system_id is a production Supabase ID (not staged).

CREATE TABLE IF NOT EXISTS public.widget_quote_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id uuid        NOT NULL REFERENCES public.data_studio_manufacturers(id) ON DELETE CASCADE,
  widget_id       uuid        REFERENCES public.manufacturer_embed_widgets(id) ON DELETE SET NULL,
  system_id       text        NOT NULL,
  system_name     text,
  selected_items  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  name            text        NOT NULL,
  email           text        NOT NULL,
  phone           text,
  postcode        text,
  project_type    text        CHECK (project_type IN ('residential', 'commercial', 'other')),
  timeline        text        CHECK (timeline IN ('asap', '1-3months', 'planning')),
  message         text,
  status          text        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'viewed', 'responded')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.widget_quote_requests ENABLE ROW LEVEL SECURITY;

-- Manufacturer users can read their own workspace's requests
CREATE POLICY "manufacturer read own quote requests"
ON public.widget_quote_requests FOR SELECT
USING (
  manufacturer_id IN (
    SELECT manufacturer_id FROM public.manufacturer_users
    WHERE auth_user_id = auth.uid() AND status = 'active'
  )
);

-- Manufacturer users can update status (mark viewed / responded)
CREATE POLICY "manufacturer update own quote request status"
ON public.widget_quote_requests FOR UPDATE
USING (
  manufacturer_id IN (
    SELECT manufacturer_id FROM public.manufacturer_users
    WHERE auth_user_id = auth.uid() AND status = 'active'
  )
);

-- buildquote_admin can read all
CREATE POLICY "admin read all quote requests"
ON public.widget_quote_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.data_studio_user_profiles
    WHERE auth_user_id = auth.uid() AND global_role = 'buildquote_admin'
  )
);
