ALTER TABLE public.data_studio_manufacturers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read manufacturers"
  ON public.data_studio_manufacturers
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "authenticated can read manufacturers"
  ON public.data_studio_manufacturers
  FOR SELECT
  TO authenticated
  USING (true);
