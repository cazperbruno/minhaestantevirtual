CREATE OR REPLACE FUNCTION public.emit_user_book_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.available_for_trade IS TRUE)
     OR (TG_OP = 'UPDATE' AND COALESCE(OLD.available_for_trade,false) = false AND NEW.available_for_trade = true) THEN
    INSERT INTO public.activities (user_id, kind, book_id, is_public, meta)
    VALUES (NEW.user_id, 'book_available_for_trade', NEW.book_id, true, '{}'::jsonb);
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.status = 'wishlist')
     OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'wishlist'::book_status AND NEW.status = 'wishlist') THEN
    INSERT INTO public.activities (user_id, kind, book_id, is_public, meta)
    VALUES (NEW.user_id, 'wishlist_added', NEW.book_id, true, '{}'::jsonb);
  END IF;

  RETURN NEW;
END;
$function$;