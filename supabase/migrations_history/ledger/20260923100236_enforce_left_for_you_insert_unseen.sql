-- Production ledger 20260923100236 enforce_left_for_you_insert_unseen: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 0c8b5c6e7b3e93a0b2f2c0569f731905; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- M5B security hardening — server-authoritative unseen lifecycle.
drop policy if exists left_for_you_insert_own on public.left_for_you;

create policy left_for_you_insert_own
  on public.left_for_you
  for insert to authenticated
  with check (
    couple_id = private.current_couple_id()
    and sender_id = auth.uid()
    and recipient_id <> sender_id
    and seen_at is null
    and exists (
      select 1 from public.profiles as partner
      where partner.id = left_for_you.recipient_id
        and partner.couple_id = private.current_couple_id()
    )
    and (
      kind <> 'photo'
      or starts_with(
        media_path,
        couple_id::text || '/' || auth.uid()::text || '/'
      )
    )
  );;
