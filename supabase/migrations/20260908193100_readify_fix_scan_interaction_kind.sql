-- READIFY — scanner usa user_interactions.kind='scan' e os desafios contam esse evento.
-- A constraint original não incluía 'scan', causando rejeição silenciosa no cliente.

ALTER TABLE public.user_interactions
  DROP CONSTRAINT IF EXISTS user_interactions_kind_check;

ALTER TABLE public.user_interactions
  ADD CONSTRAINT user_interactions_kind_check
  CHECK (kind IN (
    'view',
    'click',
    'dismiss',
    'favorite',
    'add',
    'rate',
    'search',
    'finish',
    'abandon',
    'scan'
  ));
