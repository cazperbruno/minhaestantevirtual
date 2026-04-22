-- Realtime: adiciona book_clubs e club_members; garante REPLICA IDENTITY FULL pra DELETEs
ALTER TABLE public.club_messages REPLICA IDENTITY FULL;
ALTER TABLE public.club_members REPLICA IDENTITY FULL;
ALTER TABLE public.book_clubs REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.club_members;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.book_clubs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;