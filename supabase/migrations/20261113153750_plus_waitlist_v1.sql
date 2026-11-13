-- US Plus, in arrivo: «Avvisatemi» (founder, 13/11/2026, verso l'uscita pubblica).
--
-- US goes public free, with US Plus shown as coming (D4 §4). A person can ask
-- to be told when Plus is on sale; the count tells how many couples want it
-- before Plus is built.
--
-- * private.plus_waitlist holds one row per account that asked: nothing else
--   than the account and when. The row goes with the account (ON DELETE
--   CASCADE on auth.users) and when the person says «Non avvisarmi più».
-- * Only public.plus_waitlist(join) touches it, for the signed-in caller only:
--   join true adds the caller, false removes the caller, null only reads.
--   It returns {joined: boolean}.
-- * Nobody reads the list through the API: schema private is not exposed, the
--   table has RLS and no policy. The founder reads counts with SQL.

create table private.plus_waitlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table private.plus_waitlist is 'US Plus in arrivo (13/11/2026): chi ha chiesto di essere avvisato. Scritta solo da public.plus_waitlist().';

alter table private.plus_waitlist enable row level security;
revoke all on table private.plus_waitlist from public, anon, authenticated, service_role;

create or replace function public.plus_waitlist("join" boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $waitlist$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if "join" is true then
    insert into private.plus_waitlist (user_id) values (caller) on conflict (user_id) do nothing;
  elsif "join" is false then
    delete from private.plus_waitlist where user_id = caller;
  end if;
  return jsonb_build_object('joined', exists (select 1 from private.plus_waitlist where user_id = caller));
end;
$waitlist$;

comment on function public.plus_waitlist(boolean) is 'US Plus in arrivo (13/11/2026): true avvisami, false non avvisarmi più, null legge. Solo per chi chiama.';

alter function public.plus_waitlist(boolean) owner to postgres;
revoke all on function public.plus_waitlist(boolean) from public, anon, authenticated, service_role;
grant execute on function public.plus_waitlist(boolean) to authenticated;
