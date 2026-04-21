
CREATE OR REPLACE FUNCTION public.sync_books_authors_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.authors_text := array_to_string(coalesce(NEW.authors, ARRAY[]::text[]), ' ');
  RETURN NEW;
END;
$$;
