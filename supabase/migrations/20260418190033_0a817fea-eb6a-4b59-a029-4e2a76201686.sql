-- ============ ENUMS ============
CREATE TYPE public.book_status AS ENUM ('not_read', 'reading', 'read', 'wishlist');
CREATE TYPE public.loan_status AS ENUM ('lent', 'returned', 'overdue');
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ BOOKS (cache global) ============
CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isbn_13 TEXT UNIQUE,
  isbn_10 TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  authors TEXT[] NOT NULL DEFAULT '{}',
  publisher TEXT,
  published_year INT,
  description TEXT,
  cover_url TEXT,
  page_count INT,
  language TEXT,
  categories TEXT[] DEFAULT '{}',
  source TEXT,
  source_id TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_books_title ON public.books USING gin (to_tsvector('portuguese', title));
CREATE INDEX idx_books_authors ON public.books USING gin (authors);
CREATE INDEX idx_books_categories ON public.books USING gin (categories);
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "books_select_all" ON public.books FOR SELECT USING (true);
CREATE POLICY "books_insert_auth" ON public.books FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "books_update_auth" ON public.books FOR UPDATE TO authenticated USING (true);

-- ============ USER BOOKS (biblioteca) ============
CREATE TABLE public.user_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  status book_status NOT NULL DEFAULT 'not_read',
  rating SMALLINT CHECK (rating BETWEEN 0 AND 5),
  notes TEXT,
  current_page INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);
CREATE INDEX idx_user_books_user ON public.user_books(user_id);
CREATE INDEX idx_user_books_status ON public.user_books(user_id, status);
ALTER TABLE public.user_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ub_select_public_or_own" ON public.user_books FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "ub_insert_own" ON public.user_books FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ub_update_own" ON public.user_books FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ub_delete_own" ON public.user_books FOR DELETE USING (auth.uid() = user_id);

-- ============ LOANS ============
CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  borrower_name TEXT NOT NULL,
  lent_at DATE NOT NULL DEFAULT CURRENT_DATE,
  due_at DATE,
  returned_at DATE,
  status loan_status NOT NULL DEFAULT 'lent',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loans_own" ON public.loans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_books_updated BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_user_books_updated BEFORE UPDATE ON public.user_books
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();