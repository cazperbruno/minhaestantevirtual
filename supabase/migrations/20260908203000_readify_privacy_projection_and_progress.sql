-- READIFY PRIVACY HARDENING — profile followers + progress redaction
--
-- Goals:
-- 1) make profile_visibility='followers' a real supported state;
-- 2) persist show_reading_progress server-side;
-- 3) remove cross-user raw SELECT on user_books;
-- 4) expose a redacted library projection through a controlled RPC;
-- 5) make SECURITY DEFINER social/club aggregates respect privacy and caller scope;
-- 6) stop marketplace creation from bypassing library visibility.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_reading_progress boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_visibility_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_visibility_chk
  CHECK (
    profile_visibility IN ('public', 'followers', 'private')
    AND library_visibility IN ('public', 'followers', 'private')
  );

CREATE OR REPLACE FUNCTION public.is_following(_follower uuid, _following uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    _follower IS NOT NULL
    AND _following IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = _follower
        AND f.following_id = _following
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_following(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_following(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_profile_content(_owner uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    CASE
      WHEN _owner IS NULL THEN false
      WHEN _owner = _viewer THEN true
      WHEN p.profile_visibility = 'public' THEN true
      WHEN p.profile_visibility = 'followers'
        THEN public.is_following(_viewer, _owner)
      ELSE false
    END,
    false
  )
  FROM public.profiles p
  WHERE p.id = _owner;
$$;

REVOKE ALL ON FUNCTION public.can_view_profile_content(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_profile_content(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_library(_owner uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    CASE
      WHEN _owner IS NULL THEN false
      WHEN _owner = _viewer THEN true
      WHEN NOT public.can_view_profile_content(_owner, _viewer) THEN false
      WHEN p.library_visibility = 'public' THEN true
      WHEN p.library_visibility = 'followers'
        THEN public.is_following(_viewer, _owner)
      ELSE false
    END,
    false
  )
  FROM public.profiles p
  WHERE p.id = _owner;
$$;

REVOKE ALL ON FUNCTION public.can_view_library(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_library(uuid, uuid) TO anon, authenticated, service_role;

-- The raw table is private to its owner. Cross-user reads must use the redacted RPC below.
DROP POLICY IF EXISTS ub_select_public_or_own ON public.user_books;
DROP POLICY IF EXISTS ub_select_visible ON public.user_books;
DROP POLICY IF EXISTS user_books_select_visible ON public.user_books;
CREATE POLICY ub_select_own
ON public.user_books
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Public/profile library projection. SECURITY DEFINER is intentional: it is the single
-- controlled escape hatch around owner-only user_books RLS and redacts current_page.
CREATE OR REPLACE FUNCTION public.visible_user_library(
  _owner uuid,
  _status text DEFAULT NULL,
  _available_for_trade_only boolean DEFAULT false,
  _limit integer DEFAULT 60
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  book_id uuid,
  status public.book_status,
  rating smallint,
  current_page integer,
  started_at timestamptz,
  finished_at timestamptz,
  is_public boolean,
  available_for_trade boolean,
  available_for_loan boolean,
  created_at timestamptz,
  updated_at timestamptz,
  book jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    ub.id,
    ub.user_id,
    ub.book_id,
    ub.status,
    ub.rating,
    CASE
      WHEN (SELECT auth.uid()) = ub.user_id OR p.show_reading_progress
        THEN ub.current_page
      ELSE NULL
    END AS current_page,
    ub.started_at,
    ub.finished_at,
    ub.is_public,
    ub.available_for_trade,
    ub.available_for_loan,
    ub.created_at,
    ub.updated_at,
    to_jsonb(b) AS book
  FROM public.user_books ub
  JOIN public.profiles p ON p.id = ub.user_id
  JOIN public.books b ON b.id = ub.book_id
  WHERE ub.user_id = _owner
    AND ub.is_public IS TRUE
    AND public.can_view_library(_owner, (SELECT auth.uid()))
    AND (_status IS NULL OR ub.status::text = _status)
    AND (NOT _available_for_trade_only OR ub.available_for_trade IS TRUE)
  ORDER BY ub.updated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 60), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.visible_user_library(uuid, text, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.visible_user_library(uuid, text, boolean, integer) TO anon, authenticated;

-- Safe profile lookup for public/profile pages. Basic identity remains visible so links,
-- avatars and follow UI can resolve; bio/social links are redacted when content is hidden.
CREATE OR REPLACE FUNCTION public.profile_for_viewer(_lookup text)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  level integer,
  xp integer,
  created_at timestamptz,
  profile_visibility text,
  library_visibility text,
  instagram text,
  tiktok text,
  twitter text,
  website text,
  show_reading_progress boolean,
  can_view_profile boolean,
  can_view_library boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized text := regexp_replace(trim(COALESCE(_lookup, '')), '^@+', '');
  target public.profiles%ROWTYPE;
  viewer uuid := (SELECT auth.uid());
  profile_allowed boolean;
  library_allowed boolean;
BEGIN
  IF normalized = '' OR length(normalized) > 120 THEN
    RETURN;
  END IF;

  IF normalized ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO target FROM public.profiles p WHERE p.id = normalized::uuid LIMIT 1;
  ELSE
    SELECT * INTO target
    FROM public.profiles p
    WHERE lower(COALESCE(p.username, '')) = lower(normalized)
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT * INTO target
      FROM public.profiles p
      WHERE lower(COALESCE(p.display_name, '')) = lower(normalized)
      ORDER BY p.created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  IF NOT FOUND OR target.id IS NULL THEN
    RETURN;
  END IF;

  profile_allowed := public.can_view_profile_content(target.id, viewer);
  library_allowed := public.can_view_library(target.id, viewer);

  RETURN QUERY SELECT
    target.id,
    target.username,
    target.display_name,
    target.avatar_url,
    CASE WHEN profile_allowed THEN target.bio ELSE NULL END,
    target.level,
    target.xp,
    target.created_at,
    target.profile_visibility,
    target.library_visibility,
    CASE WHEN profile_allowed THEN target.instagram ELSE NULL END,
    CASE WHEN profile_allowed THEN target.tiktok ELSE NULL END,
    CASE WHEN profile_allowed THEN target.twitter ELSE NULL END,
    CASE WHEN profile_allowed THEN target.website ELSE NULL END,
    target.show_reading_progress,
    profile_allowed,
    library_allowed;
END;
$$;

REVOKE ALL ON FUNCTION public.profile_for_viewer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_for_viewer(text) TO anon, authenticated;

-- Reviews and activities now understand profile_visibility='followers'.
DROP POLICY IF EXISTS reviews_select_public_or_own ON public.reviews;
DROP POLICY IF EXISTS reviews_select_visible ON public.reviews;
CREATE POLICY reviews_select_visible
ON public.reviews
FOR SELECT
USING (
  (SELECT auth.uid()) = user_id
  OR (is_public IS TRUE AND public.can_view_profile_content(user_id, (SELECT auth.uid())))
);

DROP POLICY IF EXISTS activities_select_public_or_own ON public.activities;
DROP POLICY IF EXISTS activities_select_visible ON public.activities;
CREATE POLICY activities_select_visible
ON public.activities
FOR SELECT
USING (
  (SELECT auth.uid()) = user_id
  OR (is_public IS TRUE AND public.can_view_profile_content(user_id, (SELECT auth.uid())))
);

-- Self-scoped and privacy-aware social shelf. The client may never ask for another
-- user's follow graph through a SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.books_read_by_following(
  _user_id uuid,
  _limit integer DEFAULT 20
)
RETURNS TABLE(
  book_id uuid,
  reader_count integer,
  recent_at timestamptz,
  reader_avatars text[],
  reader_names text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR (SELECT auth.uid()) <> _user_id THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH followed AS (
    SELECT f.following_id
    FROM public.follows f
    WHERE f.follower_id = _user_id
  ),
  my_books AS (
    SELECT ub.book_id
    FROM public.user_books ub
    WHERE ub.user_id = _user_id
  ),
  read_by_them AS (
    SELECT
      ub.book_id,
      ub.user_id,
      ub.finished_at,
      ub.updated_at,
      p.avatar_url,
      COALESCE(p.display_name, p.username, 'Leitor') AS reader_name
    FROM public.user_books ub
    JOIN followed f ON f.following_id = ub.user_id
    JOIN public.profiles p ON p.id = ub.user_id
    WHERE ub.status = 'read'
      AND ub.is_public IS TRUE
      AND public.can_view_library(ub.user_id, _user_id)
      AND NOT EXISTS (
        SELECT 1 FROM my_books mb WHERE mb.book_id = ub.book_id
      )
  )
  SELECT
    rbt.book_id,
    COUNT(DISTINCT rbt.user_id)::integer,
    MAX(COALESCE(rbt.finished_at, rbt.updated_at)),
    (ARRAY_AGG(rbt.avatar_url ORDER BY COALESCE(rbt.finished_at, rbt.updated_at) DESC))[1:5],
    (ARRAY_AGG(rbt.reader_name ORDER BY COALESCE(rbt.finished_at, rbt.updated_at) DESC))[1:5]
  FROM read_by_them rbt
  GROUP BY rbt.book_id
  ORDER BY MAX(COALESCE(rbt.finished_at, rbt.updated_at)) DESC NULLS LAST,
           COUNT(DISTINCT rbt.user_id) DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.books_read_by_following(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.books_read_by_following(uuid, integer) TO authenticated;

-- Club aggregate is now callable only by a member/owner/admin. Hidden reading pages
-- do not contribute exact page-level values to the aggregate.
CREATE OR REPLACE FUNCTION public.club_book_progress(_club_id uuid)
RETURNS TABLE(
  book_id uuid,
  page_count integer,
  total_members integer,
  reading_count integer,
  finished_count integer,
  avg_progress numeric,
  total_pages_read bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  viewer uuid := (SELECT auth.uid());
BEGIN
  IF viewer IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = _club_id AND cm.user_id = viewer
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.book_clubs bc
    WHERE bc.id = _club_id AND bc.owner_id = viewer
  )
  AND NOT public.has_role(viewer, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH club AS (
    SELECT bc.current_book_id, b.page_count
    FROM public.book_clubs bc
    LEFT JOIN public.books b ON b.id = bc.current_book_id
    WHERE bc.id = _club_id
  ),
  total AS (
    SELECT COUNT(*)::integer AS total_members
    FROM public.club_members cm
    WHERE cm.club_id = _club_id
  ),
  reads AS (
    SELECT
      ub.user_id,
      ub.status::text AS status,
      CASE
        WHEN p.show_reading_progress THEN COALESCE(ub.current_page, 0)
        ELSE NULL
      END AS visible_current_page,
      p.show_reading_progress
    FROM public.club_members cm
    JOIN public.profiles p ON p.id = cm.user_id
    JOIN club ON true
    LEFT JOIN public.user_books ub
      ON ub.user_id = cm.user_id
     AND ub.book_id = club.current_book_id
    WHERE cm.club_id = _club_id
      AND club.current_book_id IS NOT NULL
  )
  SELECT
    (SELECT current_book_id FROM club),
    (SELECT page_count FROM club),
    (SELECT total_members FROM total),
    COALESCE(SUM(CASE WHEN status = 'reading' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END), 0)::integer,
    CASE
      WHEN (SELECT page_count FROM club) IS NULL OR (SELECT page_count FROM club) = 0
        THEN NULL
      ELSE ROUND(AVG(
        CASE
          WHEN status = 'read' THEN 100.0
          WHEN status = 'reading' AND show_reading_progress THEN
            LEAST(
              100.0,
              (visible_current_page::numeric / NULLIF((SELECT page_count FROM club), 0)) * 100.0
            )
          ELSE NULL
        END
      )::numeric, 1)
    END,
    COALESCE(SUM(
      CASE
        WHEN status = 'read' THEN COALESCE((SELECT page_count FROM club), 0)
        WHEN status = 'reading' AND show_reading_progress THEN COALESCE(visible_current_page, 0)
        ELSE 0
      END
    ), 0)::bigint
  FROM reads;
END;
$$;

REVOKE ALL ON FUNCTION public.club_book_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_book_progress(uuid) TO authenticated;

-- Marketplace server contracts must honor the same visibility used by browsing.
CREATE OR REPLACE FUNCTION public.create_trade_proposal(
  _receiver_id uuid,
  _proposer_book_id uuid,
  _receiver_book_id uuid,
  _message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _receiver_id IS NULL OR _receiver_id = uid THEN RAISE EXCEPTION 'invalid_receiver'; END IF;
  IF _proposer_book_id IS NULL OR _receiver_book_id IS NULL THEN RAISE EXCEPTION 'invalid_books'; END IF;
  IF _message IS NOT NULL AND length(_message) > 500 THEN RAISE EXCEPTION 'message_too_long'; END IF;
  IF NOT public.can_view_library(_receiver_id, uid) THEN RAISE EXCEPTION 'receiver_library_not_visible'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_books ub
    WHERE ub.user_id = uid
      AND ub.book_id = _proposer_book_id
      AND ub.available_for_trade IS TRUE
  ) THEN
    RAISE EXCEPTION 'proposer_book_not_available';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_books ub
    WHERE ub.user_id = _receiver_id
      AND ub.book_id = _receiver_book_id
      AND ub.available_for_trade IS TRUE
      AND ub.is_public IS TRUE
  ) THEN
    RAISE EXCEPTION 'receiver_book_not_available';
  END IF;

  INSERT INTO public.trades (
    proposer_id, receiver_id, proposer_book_id, receiver_book_id, message, status
  ) VALUES (
    uid, _receiver_id, _proposer_book_id, _receiver_book_id,
    NULLIF(trim(COALESCE(_message, '')), ''), 'pending'::public.trade_status
  ) RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_trade_proposal(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_trade_proposal(uuid, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_purchase_offer(
  _receiver_id uuid,
  _book_id uuid,
  _amount_cents integer,
  _message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  new_id uuid;
  sender_name text;
  book_title text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _receiver_id IS NULL OR _receiver_id = uid THEN RAISE EXCEPTION 'invalid_receiver'; END IF;
  IF _book_id IS NULL THEN RAISE EXCEPTION 'invalid_book'; END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 OR _amount_cents > 10000000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF _message IS NOT NULL AND length(_message) > 400 THEN RAISE EXCEPTION 'message_too_long'; END IF;
  IF NOT public.can_view_library(_receiver_id, uid) THEN RAISE EXCEPTION 'receiver_library_not_visible'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_books ub
    WHERE ub.user_id = _receiver_id
      AND ub.book_id = _book_id
      AND ub.available_for_trade IS TRUE
      AND ub.is_public IS TRUE
  ) THEN
    RAISE EXCEPTION 'book_not_available';
  END IF;

  INSERT INTO public.purchase_offers (
    offerer_id, receiver_id, book_id, amount_cents, currency, message, status
  ) VALUES (
    uid, _receiver_id, _book_id, _amount_cents, 'BRL',
    NULLIF(trim(COALESCE(_message, '')), ''), 'pending'
  ) RETURNING id INTO new_id;

  SELECT COALESCE(display_name, username, 'Alguém')
  INTO sender_name
  FROM public.profiles
  WHERE id = uid;

  SELECT title INTO book_title FROM public.books WHERE id = _book_id;

  INSERT INTO public.notifications (user_id, kind, title, body, link, meta)
  VALUES (
    _receiver_id,
    'purchase_offer',
    COALESCE(sender_name, 'Alguém') || ' quer comprar ' || COALESCE(book_title, 'seu livro'),
    'Você recebeu uma nova oferta de compra.',
    '/trocas?tab=offers',
    jsonb_build_object(
      'offer_id', new_id,
      'from_user_id', uid,
      'book_id', _book_id,
      'amount_cents', _amount_cents,
      'currency', 'BRL'
    )
  );

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_offer(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_offer(uuid, uuid, integer, text) TO authenticated;
