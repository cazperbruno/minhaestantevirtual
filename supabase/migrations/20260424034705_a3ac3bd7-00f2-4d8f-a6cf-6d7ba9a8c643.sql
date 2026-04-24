-- Permite que triggers SECURITY DEFINER insiram activities de SISTEMA
-- (ex: trade_match cria activity para o ofertante quando outro user marca como desejo)
-- Whitelist de kinds confiáveis emitidos apenas por triggers de servidor.
CREATE POLICY "activities_insert_system_kinds"
ON public.activities
FOR INSERT
TO authenticated
WITH CHECK (
  kind IN (
    'trade_match',
    'trade_completed',
    'achievement_unlocked',
    'series_progress',
    'streak_milestone',
    'league_promotion'
  )
);