-- Production ledger 20260820003406 web_push_vapid_vault_access: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 328719632adf3b661ed9bee9fbf55d28; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create or replace function public.get_internal_vapid_private_key()
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  secret_value text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed';
  end if;
  select decrypted_secret into secret_value
  from vault.decrypted_secrets
  where name = 'us_web_push_vapid_private'
  limit 1;
  if secret_value is null then raise exception 'VAPID secret missing'; end if;
  return secret_value;
end;
$$;
revoke all on function public.get_internal_vapid_private_key() from public;
revoke all on function public.get_internal_vapid_private_key() from anon;
revoke all on function public.get_internal_vapid_private_key() from authenticated;
grant execute on function public.get_internal_vapid_private_key() to service_role;;
