-- READIFY MULTIPLATFORM — native push device registry
-- Web Push remains in push_subscriptions. Android/iOS use this server-owned registry.

CREATE TABLE IF NOT EXISTS public.native_push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  token text NOT NULL CHECK (length(token) BETWEEN 16 AND 4096),
  app_version text NULL CHECK (app_version IS NULL OR length(app_version) <= 64),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_registered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, token)
);

CREATE INDEX IF NOT EXISTS idx_native_push_devices_user_enabled
  ON public.native_push_devices(user_id, enabled);

ALTER TABLE public.native_push_devices ENABLE ROW LEVEL SECURITY;

-- No direct client table access. Registration/removal is RPC-only.
REVOKE ALL ON TABLE public.native_push_devices FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_my_native_push_device(
  _platform text,
  _token text,
  _app_version text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  normalized_platform text := lower(trim(COALESCE(_platform, '')));
  normalized_token text := trim(COALESCE(_token, ''));
  device_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF normalized_platform NOT IN ('android', 'ios') THEN
    RAISE EXCEPTION 'invalid_platform';
  END IF;

  IF length(normalized_token) < 16 OR length(normalized_token) > 4096 THEN
    RAISE EXCEPTION 'invalid_push_token';
  END IF;

  IF _app_version IS NOT NULL AND length(_app_version) > 64 THEN
    RAISE EXCEPTION 'invalid_app_version';
  END IF;

  INSERT INTO public.native_push_devices (
    user_id, platform, token, app_version, enabled, last_registered_at
  ) VALUES (
    uid,
    normalized_platform,
    normalized_token,
    NULLIF(trim(COALESCE(_app_version, '')), ''),
    true,
    now()
  )
  ON CONFLICT (platform, token)
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    app_version = EXCLUDED.app_version,
    enabled = true,
    last_registered_at = now()
  RETURNING id INTO device_id;

  RETURN device_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_my_native_push_device(text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_my_native_push_device(text, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.unregister_my_native_push_device(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.native_push_devices
  WHERE user_id = uid
    AND token = trim(COALESCE(_token, ''));

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.unregister_my_native_push_device(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unregister_my_native_push_device(text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.unregister_all_my_native_push_devices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  deleted_count integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.native_push_devices WHERE user_id = uid;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.unregister_all_my_native_push_devices()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unregister_all_my_native_push_devices()
  TO authenticated;

COMMENT ON TABLE public.native_push_devices IS
  'Server-owned registry of Android FCM / iOS APNs device tokens. Clients mutate only through self-scoped RPCs.';
