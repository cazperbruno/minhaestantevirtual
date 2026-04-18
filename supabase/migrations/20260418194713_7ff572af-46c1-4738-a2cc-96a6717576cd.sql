CREATE TABLE public.book_clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  description text,
  cover_url text,
  current_book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.club_members (
  club_id uuid NOT NULL REFERENCES public.book_clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

CREATE TABLE public.club_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.book_clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX club_messages_club_idx ON public.club_messages(club_id, created_at DESC);
CREATE INDEX club_members_user_idx ON public.club_members(user_id);

ALTER TABLE public.book_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_messages ENABLE ROW LEVEL SECURITY;

-- Helper: é membro?
CREATE OR REPLACE FUNCTION public.is_club_member(_club uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.club_members WHERE club_id = _club AND user_id = _user)
$$;

-- book_clubs policies
CREATE POLICY clubs_select ON public.book_clubs FOR SELECT
  USING (is_public = true OR public.is_club_member(id, auth.uid()));
CREATE POLICY clubs_insert ON public.book_clubs FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY clubs_update ON public.book_clubs FOR UPDATE
  USING (auth.uid() = owner_id);
CREATE POLICY clubs_delete ON public.book_clubs FOR DELETE
  USING (auth.uid() = owner_id);

-- club_members policies
CREATE POLICY members_select ON public.club_members FOR SELECT USING (true);
CREATE POLICY members_insert_self ON public.club_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY members_delete_self ON public.club_members FOR DELETE
  USING (auth.uid() = user_id);

-- club_messages policies
CREATE POLICY messages_select_member ON public.club_messages FOR SELECT
  USING (public.is_club_member(club_id, auth.uid()));
CREATE POLICY messages_insert_member ON public.club_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_club_member(club_id, auth.uid()));
CREATE POLICY messages_delete_own ON public.club_messages FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER clubs_updated_at BEFORE UPDATE ON public.book_clubs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: ao criar clube, dono vira membro
CREATE OR REPLACE FUNCTION public.add_owner_as_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.club_members (club_id, user_id, role) VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END $$;

CREATE TRIGGER clubs_owner_member AFTER INSERT ON public.book_clubs
  FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_member();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.club_messages;