-- 1. Drop triggers legadas duplicadas
DROP TRIGGER IF EXISTS trg_user_book_activity ON public.user_books;
DROP TRIGGER IF EXISTS trg_follow_activity   ON public.follows;
DROP TRIGGER IF EXISTS trg_loan_activity     ON public.loans;
DROP TRIGGER IF EXISTS trg_trade_activity    ON public.trades;

-- 2. Drop funções legadas
DROP FUNCTION IF EXISTS public.emit_user_book_activity() CASCADE;
DROP FUNCTION IF EXISTS public.emit_follow_activity()    CASCADE;
DROP FUNCTION IF EXISTS public.emit_loan_activity()      CASCADE;
DROP FUNCTION IF EXISTS public.emit_trade_activity()     CASCADE;

-- 3. Backfill: renomeia kinds antigos
UPDATE public.activities SET kind = 'followed_user'    WHERE kind = 'started_following';
UPDATE public.activities SET kind = 'finished_reading' WHERE kind = 'book_finished';
