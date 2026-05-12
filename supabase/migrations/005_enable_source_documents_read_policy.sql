ALTER TABLE public.source_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read source documents"
  ON public.source_documents
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "authenticated can read source documents"
  ON public.source_documents
  FOR SELECT
  TO authenticated
  USING (true);
