-- Coluna para guardar a última tela do tutorial vista pelo usuário.
-- 0 = início. NULL ou >= total de slides = tutorial completo.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tutorial_last_step smallint NOT NULL DEFAULT 0;