DROP POLICY IF EXISTS "books_update_auth" ON public.books;
CREATE POLICY "books_update_admin" ON public.books FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- INSERT books: somente authenticated, intencional cache global; restringimos com check campo título não vazio
DROP POLICY IF EXISTS "books_insert_auth" ON public.books;
CREATE POLICY "books_insert_auth" ON public.books FOR INSERT TO authenticated
  WITH CHECK (length(title) > 0);