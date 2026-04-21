
-- Permite leitura individual de objetos no bucket (via path conhecido),
-- mas listagem ampla retorna vazio porque o bucket não é mais público.
CREATE POLICY "book-covers public download"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'book-covers');
