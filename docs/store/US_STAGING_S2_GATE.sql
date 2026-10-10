-- US Store 1.0 / staging-to-production compatibility fingerprint
-- READ ONLY: never apply as a migration; never copy application data.
-- Run separately with SELECT privileges on US-STAGING and US production.
-- A healthy S2 preflight requires platform + auth + app parity; for staging,
-- all US cron jobs stay DISABLED and the project must NOT have production Vault secrets.
with object_state as (
  select
    to_regclass('public.couple_countdown_preferences') is not null as countdown_exists,
    exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='device_push_tokens' and column_name='installation_id') as native_device_installation_exists,
    exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='moments' and column_name='thumbnail_path') as moments_thumbnail_exists,
    to_regprocedure('public.get_couple_membership()') is not null as mc2_membership_rpc_exists,
    exists(select 1 from pg_indexes where schemaname='public' and
      indexname='profiles_one_role_per_couple') as partner_role_unique_index_exists,
    not has_table_privilege('authenticated','public.profiles','TRUNCATE') as no_client_profiles_truncate,
    not has_table_privilege('authenticated','public.profiles','MAINTAIN') as no_client_profiles_maintain,
    not has_table_privilege('anon','public.profiles','INSERT') as no_anon_profiles_insert,
    to_regprocedure('public.get_couple_week_participation_v1()') is not null as s2_week_rpc_exists,
    exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='daily_answers' and column_name='server_answered_at') as s2_receipt_exists
), table_state as (
  select jsonb_object_agg(c.relname, c.relrowsecurity order by c.relname) as rls,
    count(*) filter (where c.relrowsecurity) as rls_count,
    count(*) as table_count
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
    and c.relname in ('couples','profiles','daily_answers','daily_questions',
       'game_sessions','game_session_sides','progression_events')
), cron_state as (
  select count(*) as installed,
    count(*) filter (where active) as active,
    count(*) filter (where not active) as disabled
  from cron.job where jobname like 'us-%'
), status as (
  select o.*, t.rls, t.rls_count, t.table_count,
    c.installed as cron_installed, c.active as cron_active, c.disabled as cron_disabled,
    (o.countdown_exists and o.native_device_installation_exists
     and o.moments_thumbnail_exists and o.mc2_membership_rpc_exists
     and o.partner_role_unique_index_exists
     and o.no_client_profiles_truncate and o.no_client_profiles_maintain
     and o.no_anon_profiles_insert and t.rls_count=7) as source_parity_for_s2,
    (o.s2_week_rpc_exists and o.s2_receipt_exists) as s2_installed
  from object_state o cross join table_state t cross join cron_state c
)
select jsonb_pretty(to_jsonb(status)) as us_store_s2_schema_gate from status;
