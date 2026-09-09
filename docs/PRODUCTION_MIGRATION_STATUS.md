# Readify — production migration status

Last verified: 2026-09-09

## Production database identity

The production database was positively matched to Lovable project `ae3477b4-c369-4d1a-ad54-833e023cd464` (Readify) and Supabase project ref `gjlzkviwzqxyiwaajoly` before any write was performed.

The separate Supabase projects named `brcomtec` and `brcomtec-dr` were not used or modified.

## P0 migrations

The following repository migrations were transactionally dry-run against the live Readify schema and then applied to production with matching versions recorded in `supabase_migrations.schema_migrations`:

- `20260908190500_readify_p0_security_hardening.sql`
- `20260908191000_readify_p0_data_integrity.sql`
- `20260908191200_readify_p0_self_scope_invites.sql`
- `20260908191500_readify_p0_internal_challenge_worker.sql`
- `20260908192000_readify_p0_social_rpc_isolation.sql`
- `20260908193000_readify_p0_event_driven_xp.sql`
- `20260908193500_readify_secure_internal_cron.sql`
- `20260908194000_readify_account_data_purge.sql`
- `20260908194500_readify_club_server_notifications.sql`
- `20260908201000_readify_native_push_devices.sql`
- `20260908203000_readify_privacy_projection_and_progress.sql`
- `20260908203100_readify_privacy_profile_column_grant.sql`
- `20260908205500_readify_profile_column_privacy.sql`

Post-application checks confirmed all 13 versions are present in migration history.

## Verified post-conditions

- Client roles cannot execute arbitrary `add_xp` or internal XP grant functions.
- Generic client INSERT policies for system notifications/activities were removed.
- Generic client UPDATE paths for trades and purchase offers were removed.
- Raw cross-user `user_books` SELECT was removed; cross-user access uses controlled redacted RPCs.
- Public profile table access is restricted to basic identity columns; private profile fields use controlled RPCs.
- `show_reading_progress` is server-persisted and user-editable without reopening XP/level writes.
- Native Android/iOS push-device registry exists and is RPC-only for client mutation.
- Transactional account purge function is service-role-only.
- Server-side club notification triggers are installed.
- Existing production row counts checked before/after migration remained unchanged.
- Anonymous role smoke check showed 0 raw `user_books` rows visible while public books/profile identity remained reachable through their intended surfaces.

## Cron status

The historical enrichment cron was removed. Secure enrichment and normalization cron jobs are installed.

`app.service_role_key` is currently not configured in the database and no equivalent Readify service-role secret was found in Supabase Vault metadata. The secure cron commands intentionally contain a guard that performs no HTTP request while this setting is absent. Therefore the jobs are safe but currently inert.

Do not add a service-role key to source control, migration files, frontend environment variables, or cron command text. Configure it only through an approved server-side secret mechanism before relying on automatic enrichment/normalization.

## Release rule

Code deployment, database migration, Lovable publication, Android packaging, iOS packaging, and store publication are separate release states. Never infer one from another.
