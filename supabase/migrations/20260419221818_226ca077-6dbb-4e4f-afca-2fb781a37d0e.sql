ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS favorite_genres text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;