-- Production ledger 20260818190816 prevent_direct_pairing_table_reads: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 2e479f04cc592d9b1db63fa72c5437f5; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- Invite codes remain server-only. No client RLS policies are added to couple_invites.
revoke all on table public.couple_invites from anon, authenticated;

-- Keep only the minimum table privileges needed by authenticated clients; RLS still scopes rows.
grant select on public.profiles, public.couples, public.daily_questions, public.quiz_sets, public.quiz_questions, public.bucket_items, public.shared_messages, public.moods, public.activity to authenticated;
grant select, insert, update on public.daily_answers, public.quiz_responses to authenticated;
grant insert, update, delete on public.bucket_items to authenticated;
grant insert, update on public.shared_messages, public.moods to authenticated;
grant insert on public.activity to authenticated;;
