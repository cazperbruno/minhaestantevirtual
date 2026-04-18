CREATE TABLE public.reading_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  year integer NOT NULL,
  target_books integer NOT NULL CHECK (target_books > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, year)
);

ALTER TABLE public.reading_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY goals_own ON public.reading_goals FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER goals_updated_at BEFORE UPDATE ON public.reading_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Calcula a sequência (streak) atual de dias consecutivos com atividade
CREATE OR REPLACE FUNCTION public.reading_streak(_user_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  streak int := 0;
  current_day date := CURRENT_DATE;
  has_activity boolean;
BEGIN
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.user_books
      WHERE user_id = _user_id AND created_at::date = current_day
    ) INTO has_activity;
    IF NOT has_activity THEN
      -- permitir começar a partir de ontem se hoje ainda não houve atividade
      IF streak = 0 AND current_day = CURRENT_DATE THEN
        current_day := current_day - 1;
        CONTINUE;
      END IF;
      EXIT;
    END IF;
    streak := streak + 1;
    current_day := current_day - 1;
  END LOOP;
  RETURN streak;
END $$;