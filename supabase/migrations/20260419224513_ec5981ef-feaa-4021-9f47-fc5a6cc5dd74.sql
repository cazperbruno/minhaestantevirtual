-- Create public bucket for user-uploaded / manually edited book covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "book_covers_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'book-covers');

-- Authenticated users can upload (any path under their uid folder)
CREATE POLICY "book_covers_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'book-covers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "book_covers_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'book-covers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "book_covers_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'book-covers' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow any authenticated user to UPDATE books metadata (edit/correct).
-- This is collaborative-wiki style, similar to Letterboxd/Goodreads contributions.
DROP POLICY IF EXISTS books_update_admin ON public.books;
CREATE POLICY "books_update_authenticated"
ON public.books FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (length(title) > 0);