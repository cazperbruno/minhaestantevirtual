
-- 1) Recriar pg_net no schema extensions
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- 2) Restringir storage.objects para o bucket book-covers
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "book-covers public read" ON storage.objects;
DROP POLICY IF EXISTS "book-covers no list" ON storage.objects;
DROP POLICY IF EXISTS "book-covers admin upload" ON storage.objects;
DROP POLICY IF EXISTS "book-covers admin update" ON storage.objects;
DROP POLICY IF EXISTS "book-covers admin delete" ON storage.objects;
DROP POLICY IF EXISTS "book-covers select" ON storage.objects;

-- Bucket continua público (entrega via CDN por URL), mas removemos policy ampla
-- de SELECT que permitia listing. Sem policy SELECT, listObjects retorna vazio
-- enquanto requests diretos ao asset continuam servidos pela CDN.

CREATE POLICY "book-covers admin upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'book-covers' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "book-covers admin update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'book-covers' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "book-covers admin delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'book-covers' AND public.has_role(auth.uid(), 'admin'::app_role));
