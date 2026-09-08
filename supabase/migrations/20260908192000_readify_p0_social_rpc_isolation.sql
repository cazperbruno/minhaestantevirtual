-- READIFY P0 — RPCs sociais com _user_id arbitrário não ficam disponíveis ao cliente.
-- recommend-feed autentica o usuário e chama estas funções internamente com service_role.

REVOKE ALL ON FUNCTION public.friends_reading_now(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.friends_reading_now(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.friends_reading_now(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.friends_reading_now(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.trending_in_circle(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trending_in_circle(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.trending_in_circle(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trending_in_circle(uuid, integer) TO service_role;
