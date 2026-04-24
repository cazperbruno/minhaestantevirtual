CREATE OR REPLACE FUNCTION public.purchase_offers_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status <> 'pending' THEN
    NEW.responded_at = now();
  END IF;
  RETURN NEW;
END $$;