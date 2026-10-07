-- MC2 — Couple Creation + Invite Backend: production PREFLIGHT (READ-ONLY)
-- Base repo: origin/main 4dcfa4580e0d43789325271291647e948ca21dd6
--
-- Run by Francesco only (Supabase SQL editor / connector). Every statement is a
-- SELECT inside a READ ONLY transaction that is rolled back. No secrets, no
-- invite hashes, no emails are returned: counts and catalog facts only.
-- Save the output as JSON next to MC2_BLUEPRINT.md (or in the MC2 branch).

begin transaction read only;

-- q01 couple_invites: shape and state (no code_hash values)
select 'q01_columns' as q, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'couple_invites'
order by ordinal_position;

select 'q01_constraints' as q, conname, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid = 'public.couple_invites'::regclass order by conname;

select 'q01_states' as q,
  count(*) as total,
  count(*) filter (where used_at is not null) as used,
  count(*) filter (where used_at is null) as unused,
  count(*) filter (where used_by is null and used_at is not null) as used_by_deleted,
  count(distinct couple_id) as couples_with_invites,
  count(*) filter (where code_hash !~ '^[0-9a-f]{64}$') as non_sha256_hex_hashes
from public.couple_invites;

-- q02 profiles / couples invariants
select 'q02_profiles' as q,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.profiles where couple_id is null) as profiles_without_couple,
  (select count(*) from public.couples) as couples,
  (select count(*) from (select couple_id from public.profiles where couple_id is not null
     group by couple_id having count(*) > 2) x) as couples_over_two,
  (select count(*) from (select couple_id from public.profiles where couple_id is not null
     group by couple_id having count(*) = 1) x) as couples_with_one_member,
  (select count(*) from public.couples c where not exists
     (select 1 from public.profiles p where p.couple_id = c.id)) as couples_without_members;

select 'q02_roles' as q, role, count(*) from public.profiles group by role order by role;

select 'q02_index' as q, indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'profiles' order by indexname;

select 'q02_profile_constraints' as q, conname, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid = 'public.profiles'::regclass order by conname;

select 'q02_couples_defaults' as q, column_name, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'couples' order by ordinal_position;

-- q03 auth account classes (counts only) — decision D4
select 'q03_auth_classes' as q,
  count(*) as auth_users,
  count(*) filter (where coalesce(u.is_anonymous, false)) as anonymous,
  count(*) filter (where not coalesce(u.is_anonymous, false) and p.id is null) as non_anonymous_without_profile,
  count(*) filter (where not coalesce(u.is_anonymous, false) and u.email_confirmed_at is null) as unconfirmed_non_anonymous,
  count(*) filter (where u.banned_until is not null and u.banned_until > now()) as banned
from auth.users u left join public.profiles p on p.id = u.id;

select 'q03_live_sessions_without_profile' as q,
  count(distinct s.user_id) as users_with_sessions_without_profile
from auth.sessions s left join public.profiles p on p.id = s.user_id
where p.id is null;

-- q04 table ACLs on the membership tables
select 'q04_table_acl' as q, table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('profiles', 'couples', 'couple_invites')
  and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
group by table_name, grantee order by table_name, grantee;

select 'q04_column_acl' as q, table_name, column_name, grantee, privilege_type
from information_schema.role_column_grants
where table_schema = 'public' and table_name in ('profiles', 'couples', 'couple_invites')
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('UPDATE', 'INSERT')
order by table_name, column_name, grantee;

-- q05 RLS flags and policies on the membership tables
select 'q05_rls' as q, c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('profiles', 'couples', 'couple_invites');

select 'q05_policies' as q, tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('profiles', 'couples', 'couple_invites')
order by tablename, policyname;

-- q06 name collisions with the planned MC2 functions
select 'q06_collisions' as q, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in ('create_couple', 'create_partner_invite', 'revoke_partner_invite',
        'accept_partner_invite', 'get_couple_membership'))
   or (n.nspname = 'private' and p.proname like 'mc2\_%');

-- q07 crypto helpers available to a search_path='' definer
select 'q07_pgcrypto' as q, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('gen_random_bytes', 'digest') order by 2, 3, 4;
select 'q07_ext' as q, extname, extversion, extnamespace::regnamespace from pg_extension
where extname in ('pgcrypto', 'uuid-ossp');

-- q08 migration ledger tail (MC2 version must be newer)
select 'q08_ledger' as q, version, name
from supabase_migrations.schema_migrations order by version desc limit 10;

-- q09 tenant resolver and actor helpers unchanged
select 'q09_resolvers' as q, n.nspname, p.proname, p.prosecdef, p.proconfig::text, md5(p.prosrc) as body_md5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname in ('current_couple_id', 'm11a_actor', 'm11a_actor_locked');

select 'q09_claim_us_role_acl' as q, p.proacl::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'claim_us_role';

-- q10 Native Notifications V1 applied? (point 20)
select 'q10_device_push_tokens' as q, column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'device_push_tokens'
  and column_name in ('installation_id', 'provider', 'apns_environment', 'token_updated_at', 'couple_id');
select 'q10_native_rpcs' as q, p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('register_native_push_device', 'unregister_native_push_device',
  'register_web_push_subscription', 'register_push_token');
select 'q10_push_rows' as q,
  (select count(*) from public.push_subscriptions) as web_push_rows,
  (select count(*) from public.push_subscriptions s join public.profiles p on p.id = s.user_id
     where s.couple_id is distinct from p.couple_id) as web_push_couple_mismatch,
  (select count(*) from public.device_push_tokens) as native_rows,
  (select count(*) from public.device_push_tokens d join public.profiles p on p.id = d.user_id
     where d.couple_id is distinct from p.couple_id) as native_couple_mismatch;

-- q11 storage policies on us-media (tenant boundary must stay current_couple_id())
select 'q11_storage_policies' as q, policyname, cmd, roles::text, qual, with_check
from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;
select 'q11_media_outside_couple_folder' as q, count(*) as objects_outside
from storage.objects o
where o.bucket_id = 'us-media'
  and not exists (select 1 from public.couples c where (storage.foldername(o.name))[1] = c.id::text);

-- q12 hidden triggers on auth.users / membership tables
select 'q12_triggers' as q, event_object_schema, event_object_table, trigger_name, action_statement
from information_schema.triggers
where (event_object_schema = 'auth' and event_object_table = 'users')
   or (event_object_schema = 'public' and event_object_table in ('profiles', 'couples', 'couple_invites'))
order by 2, 3, 4;

-- q13 default privileges for new functions in public (SEC-08)
select 'q13_default_acl' as q, defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl::text
from pg_default_acl where defaclnamespace = 'public'::regnamespace;

-- q14 realtime publication (point 20 / T16)
select 'q14_realtime' as q, schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' order by tablename;

-- q15 server version (MAINTAIN privilege exists only from PG17)
select 'q15_version' as q, current_setting('server_version_num') as server_version_num;

rollback;

-- Not coverable by SQL (check separately, read-only):
--   * Auth settings: GET https://iiakdfsxpywdkxravqjh.supabase.co/auth/v1/settings with the publishable key
--     -> expect disable_signup=true, anonymous_users=false (decision D1).
