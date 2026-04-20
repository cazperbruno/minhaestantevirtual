
-- =====================================================
-- 1. Library availability flags
-- =====================================================
ALTER TABLE public.user_books
  ADD COLUMN IF NOT EXISTS available_for_trade boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_for_loan boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_user_books_available_trade
  ON public.user_books (available_for_trade) WHERE available_for_trade = true;
CREATE INDEX IF NOT EXISTS idx_user_books_available_loan
  ON public.user_books (available_for_loan) WHERE available_for_loan = true;

-- =====================================================
-- 2. Review comments
-- =====================================================
CREATE TABLE IF NOT EXISTS public.review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_comments_review ON public.review_comments(review_id, created_at);

ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rc_select_public"
  ON public.review_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reviews r
      WHERE r.id = review_id
        AND (r.is_public = true OR r.user_id = auth.uid())
    )
  );

CREATE POLICY "rc_insert_self"
  ON public.review_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = review_id AND r.is_public = true)
  );

CREATE POLICY "rc_update_own"
  ON public.review_comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "rc_delete_own"
  ON public.review_comments FOR DELETE
  USING (auth.uid() = user_id);

-- Optional: track comments_count on reviews
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.update_review_comments_count()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET comments_count = comments_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reviews SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.review_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_review_comments_count ON public.review_comments;
CREATE TRIGGER trg_review_comments_count
  AFTER INSERT OR DELETE ON public.review_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_review_comments_count();

-- =====================================================
-- 3. Book trades
-- =====================================================
DO $$ BEGIN
  CREATE TYPE public.trade_status AS ENUM ('pending','accepted','declined','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  proposer_book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  receiver_book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  message text,
  status public.trade_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_trade CHECK (proposer_id <> receiver_id)
);
CREATE INDEX IF NOT EXISTS idx_trades_proposer ON public.trades(proposer_id, status);
CREATE INDEX IF NOT EXISTS idx_trades_receiver ON public.trades(receiver_id, status);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trades_select_participants"
  ON public.trades FOR SELECT
  USING (auth.uid() IN (proposer_id, receiver_id));

CREATE POLICY "trades_insert_self"
  ON public.trades FOR INSERT
  WITH CHECK (auth.uid() = proposer_id);

CREATE POLICY "trades_update_participants"
  ON public.trades FOR UPDATE
  USING (auth.uid() IN (proposer_id, receiver_id));

DROP TRIGGER IF EXISTS trg_trades_updated ON public.trades;
CREATE TRIGGER trg_trades_updated
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- 4. Activities (unified social feed)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  target_user_id uuid,
  club_id uuid REFERENCES public.book_clubs(id) ON DELETE CASCADE,
  meta jsonb,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activities_user ON public.activities(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_recent ON public.activities(created_at DESC) WHERE is_public = true;

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities_select_public_or_own"
  ON public.activities FOR SELECT
  USING (is_public = true OR auth.uid() = user_id);

CREATE POLICY "activities_insert_own"
  ON public.activities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "activities_delete_own"
  ON public.activities FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-emit activities from common actions
CREATE OR REPLACE FUNCTION public.emit_user_book_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activities (user_id, kind, book_id, is_public, meta)
    VALUES (NEW.user_id, 'book_added', NEW.book_id, NEW.is_public,
            jsonb_build_object('status', NEW.status));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'read' AND OLD.status <> 'read' THEN
      INSERT INTO public.activities (user_id, kind, book_id, is_public, meta)
      VALUES (NEW.user_id, 'book_finished', NEW.book_id, NEW.is_public,
              jsonb_build_object('rating', NEW.rating));
    END IF;
    IF NEW.rating IS NOT NULL AND NEW.rating IS DISTINCT FROM OLD.rating THEN
      INSERT INTO public.activities (user_id, kind, book_id, is_public, meta)
      VALUES (NEW.user_id, 'book_rated', NEW.book_id, NEW.is_public,
              jsonb_build_object('rating', NEW.rating));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_book_activity ON public.user_books;
CREATE TRIGGER trg_user_book_activity
  AFTER INSERT OR UPDATE ON public.user_books
  FOR EACH ROW EXECUTE FUNCTION public.emit_user_book_activity();

CREATE OR REPLACE FUNCTION public.emit_loan_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activities (user_id, kind, book_id, meta)
    VALUES (NEW.user_id, 'book_lent', NEW.book_id,
            jsonb_build_object('borrower', NEW.borrower_name));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_loan_activity ON public.loans;
CREATE TRIGGER trg_loan_activity
  AFTER INSERT ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.emit_loan_activity();

CREATE OR REPLACE FUNCTION public.emit_trade_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    INSERT INTO public.activities (user_id, kind, book_id, target_user_id, meta)
    VALUES (NEW.proposer_id, 'trade_completed', NEW.proposer_book_id, NEW.receiver_id,
            jsonb_build_object('received_book', NEW.receiver_book_id));
    INSERT INTO public.activities (user_id, kind, book_id, target_user_id, meta)
    VALUES (NEW.receiver_id, 'trade_completed', NEW.receiver_book_id, NEW.proposer_id,
            jsonb_build_object('received_book', NEW.proposer_book_id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_trade_activity ON public.trades;
CREATE TRIGGER trg_trade_activity
  AFTER UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.emit_trade_activity();

CREATE OR REPLACE FUNCTION public.emit_follow_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activities (user_id, kind, target_user_id)
  VALUES (NEW.follower_id, 'started_following', NEW.following_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_follow_activity ON public.follows;
CREATE TRIGGER trg_follow_activity
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.emit_follow_activity();

-- =====================================================
-- 5. Club book-of-the-month nominations & votes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.club_book_nominations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.book_clubs(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  nominated_by uuid NOT NULL,
  votes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, book_id)
);
CREATE INDEX IF NOT EXISTS idx_nominations_club ON public.club_book_nominations(club_id, votes_count DESC);

ALTER TABLE public.club_book_nominations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nominations_select_member"
  ON public.club_book_nominations FOR SELECT
  USING (public.is_club_member(club_id, auth.uid()));

CREATE POLICY "nominations_insert_member"
  ON public.club_book_nominations FOR INSERT
  WITH CHECK (auth.uid() = nominated_by AND public.is_club_member(club_id, auth.uid()));

CREATE POLICY "nominations_delete_owner_or_proposer"
  ON public.club_book_nominations FOR DELETE
  USING (
    auth.uid() = nominated_by OR
    EXISTS (SELECT 1 FROM public.book_clubs bc WHERE bc.id = club_id AND bc.owner_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.club_book_votes (
  nomination_id uuid NOT NULL REFERENCES public.club_book_nominations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (nomination_id, user_id)
);

ALTER TABLE public.club_book_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "votes_select_member"
  ON public.club_book_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_book_nominations n
      WHERE n.id = nomination_id AND public.is_club_member(n.club_id, auth.uid())
    )
  );

CREATE POLICY "votes_insert_self_member"
  ON public.club_book_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.club_book_nominations n
      WHERE n.id = nomination_id AND public.is_club_member(n.club_id, auth.uid())
    )
  );

CREATE POLICY "votes_delete_own"
  ON public.club_book_votes FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_nomination_votes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.club_book_nominations SET votes_count = votes_count + 1 WHERE id = NEW.nomination_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.club_book_nominations SET votes_count = GREATEST(0, votes_count - 1) WHERE id = OLD.nomination_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_nomination_votes ON public.club_book_votes;
CREATE TRIGGER trg_nomination_votes
  AFTER INSERT OR DELETE ON public.club_book_votes
  FOR EACH ROW EXECUTE FUNCTION public.update_nomination_votes();

-- =====================================================
-- 6. Notifications
-- =====================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  is_read boolean NOT NULL DEFAULT false,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Allow inserts coming from triggers (security definer functions) and from authenticated users sending to themselves
CREATE POLICY "notifications_insert_self"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Trade notification trigger
CREATE OR REPLACE FUNCTION public.notify_trade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proposer_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(display_name, username, 'Alguém') INTO proposer_name
      FROM public.profiles WHERE id = NEW.proposer_id;
    INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
    VALUES (NEW.receiver_id, 'trade_proposal',
            proposer_name || ' propôs uma troca',
            'Veja a proposta e aceite ou recuse.',
            '/trocas',
            jsonb_build_object('trade_id', NEW.id));
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    IF NEW.status = 'accepted' THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
      VALUES (NEW.proposer_id, 'trade_accepted',
              'Sua proposta foi aceita!',
              'Combine a entrega com o outro leitor.',
              '/trocas',
              jsonb_build_object('trade_id', NEW.id));
    ELSIF NEW.status = 'declined' THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
      VALUES (NEW.proposer_id, 'trade_declined',
              'Proposta recusada',
              null,
              '/trocas',
              jsonb_build_object('trade_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_trade ON public.trades;
CREATE TRIGGER trg_notify_trade
  AFTER INSERT OR UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.notify_trade();

-- Follow notification
CREATE OR REPLACE FUNCTION public.notify_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE follower_name text;
BEGIN
  SELECT COALESCE(display_name, username, 'Alguém') INTO follower_name
    FROM public.profiles WHERE id = NEW.follower_id;
  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  VALUES (NEW.following_id, 'new_follower',
          follower_name || ' começou a te seguir',
          null,
          (SELECT '/u/' || username FROM public.profiles WHERE id = NEW.follower_id),
          jsonb_build_object('follower_id', NEW.follower_id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_follow ON public.follows;
CREATE TRIGGER trg_notify_follow
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_follow();

-- =====================================================
-- 7. Discovery: similar readers
-- =====================================================
CREATE OR REPLACE FUNCTION public.similar_readers(_user_id uuid, _limit integer DEFAULT 10)
RETURNS TABLE (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  level integer,
  shared_books bigint,
  shared_genres bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH my_books AS (
    SELECT book_id FROM public.user_books WHERE user_id = _user_id
  ),
  my_genres AS (
    SELECT category FROM public.user_taste(_user_id)
  )
  SELECT
    p.id,
    p.display_name,
    p.username,
    p.avatar_url,
    p.level,
    COALESCE((
      SELECT count(*) FROM public.user_books ub2
      WHERE ub2.user_id = p.id
        AND ub2.book_id IN (SELECT book_id FROM my_books)
    ), 0) AS shared_books,
    COALESCE((
      SELECT count(*) FROM public.user_taste(p.id) ut
      WHERE ut.category IN (SELECT category FROM my_genres)
    ), 0) AS shared_genres
  FROM public.profiles p
  WHERE p.id <> _user_id
  ORDER BY shared_books DESC, shared_genres DESC, p.xp DESC
  LIMIT _limit;
$$;
