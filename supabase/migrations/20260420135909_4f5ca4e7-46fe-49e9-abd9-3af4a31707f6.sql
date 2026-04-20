DROP POLICY IF EXISTS series_insert_auth ON public.series;

CREATE POLICY series_insert_admin
  ON public.series
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND length(title) > 0);