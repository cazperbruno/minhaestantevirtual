-- Tabela de ofertas de compra
CREATE TABLE IF NOT EXISTS public.purchase_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offerer_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'BRL',
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (offerer_id <> receiver_id)
);

CREATE INDEX IF NOT EXISTS purchase_offers_receiver_idx ON public.purchase_offers(receiver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_offers_offerer_idx ON public.purchase_offers(offerer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_offers_book_idx ON public.purchase_offers(book_id);

ALTER TABLE public.purchase_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_select_involved" ON public.purchase_offers
FOR SELECT TO authenticated
USING (auth.uid() = offerer_id OR auth.uid() = receiver_id);

CREATE POLICY "po_insert_offerer" ON public.purchase_offers
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = offerer_id AND status = 'pending');

CREATE POLICY "po_update_involved" ON public.purchase_offers
FOR UPDATE TO authenticated
USING (auth.uid() = offerer_id OR auth.uid() = receiver_id)
WITH CHECK (auth.uid() = offerer_id OR auth.uid() = receiver_id);

CREATE POLICY "po_delete_offerer" ON public.purchase_offers
FOR DELETE TO authenticated
USING (auth.uid() = offerer_id AND status = 'pending');

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.purchase_offers_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status <> 'pending' THEN
    NEW.responded_at = now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS purchase_offers_touch_trg ON public.purchase_offers;
CREATE TRIGGER purchase_offers_touch_trg
BEFORE UPDATE ON public.purchase_offers
FOR EACH ROW EXECUTE FUNCTION public.purchase_offers_touch();

-- Atualiza policy de notificações pra incluir kinds de oferta de compra
DROP POLICY IF EXISTS "notifications_insert_system_kinds" ON public.notifications;
CREATE POLICY "notifications_insert_system_kinds" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (kind = ANY (ARRAY[
  'trade_match','trade_proposed','trade_accepted','trade_declined','trade_completed',
  'achievement_unlocked','new_follower','mention','comment','like',
  'series_progress','club_message','club_book_set','streak_risk','league_finale',
  'recommendation_received','buddy_invite','buddy_message',
  'purchase_offer','purchase_offer_response'
]));