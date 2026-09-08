-- Follow-up to the privacy projection migration.
-- profiles UPDATE was previously converted to column-level grants, so every new
-- user-editable profile setting must be granted explicitly.

GRANT UPDATE (show_reading_progress)
ON TABLE public.profiles
TO authenticated;
