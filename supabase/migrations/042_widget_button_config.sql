-- Migration 042: widget_button_config on data_studio_manufacturers
-- Global per-manufacturer setting for which action buttons appear in the
-- embedded widget. Defaults all ON so existing widgets are unaffected.

ALTER TABLE public.data_studio_manufacturers
  ADD COLUMN IF NOT EXISTS widget_button_config jsonb NOT NULL
    DEFAULT '{"show_request_quote":true,"show_find_stockist":true,"show_general_enquiry":true}'::jsonb;
