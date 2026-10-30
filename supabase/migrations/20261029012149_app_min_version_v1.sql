-- Aggiornamento dell'app (founder, 29/10/2026).
--
-- The lowest version code of the native app that still works with this
-- server, per platform. Below it the app asks to update (app-update.js):
-- through Google Play's in-app update when Play has the new version, or to
-- the store page. It starts at 0: nobody is asked. Raise it with a reviewed
-- SQL only after the new AAB is live on Play, e.g.
--   update public.app_min_version set min_version_code = <versionCode>, updated_at = now() where platform = 'android';
-- Signed-in clients only read it, through get_app_min_version (F1B: no anon RPC).

create table public.app_min_version (
  platform text primary key check (platform in ('android', 'ios')),
  min_version_code bigint not null default 0 check (min_version_code >= 0),
  updated_at timestamptz not null default now()
);

alter table public.app_min_version enable row level security;
revoke all on table public.app_min_version from public, anon, authenticated;

insert into public.app_min_version (platform, min_version_code) values ('android', 0), ('ios', 0);

create or replace function public.get_app_min_version(p_platform text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select v.min_version_code from public.app_min_version v where v.platform = p_platform;
$$;

revoke all on function public.get_app_min_version(text) from public, anon, authenticated, service_role;
grant execute on function public.get_app_min_version(text) to authenticated;
