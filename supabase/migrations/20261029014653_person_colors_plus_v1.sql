-- Colori a scelta con US Plus (founder, 29/10/2026, docs/DECISIONS.md).
--
-- 1. The read side of US Plus (D4, plus-v1-staging.md §2): one row per user
--    and source (play, beta, manuale), written only by the server (the
--    RevenueCat webhook later, a reviewed SQL for beta / manual grants). A
--    couple has Plus while at least one CURRENT member has an active, unexpired
--    entitlement: when the couple ends, the partner loses it at once.
-- 2. Each person may pick their colour from 8 (null: the usual rosa for the
--    creator, lilla for who joined), only while the couple has Plus, never
--    the partner's colour. Going back to the usual one is always allowed, and
--    a chosen colour stays after Plus ends (D4: what the couple made stays).

create table public.plus_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('play', 'beta', 'manuale')),
  product text not null,
  status text not null check (status in ('active', 'grace', 'expired', 'canceled', 'refunded')),
  expires_at timestamptz,
  last_event_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source)
);

alter table public.plus_entitlements enable row level security;
revoke all on table public.plus_entitlements from public, anon, authenticated;
grant select on table public.plus_entitlements to authenticated;
create policy plus_entitlements_select_own on public.plus_entitlements for select to authenticated
  using (user_id = auth.uid());

create or replace function private.couple_has_plus(p_couple uuid, at_time timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plus_entitlements e
    join public.profiles p on p.id = e.user_id
    where p.couple_id = p_couple and e.status in ('active', 'grace')
      and (e.expires_at is null or e.expires_at > at_time)
  );
$$;
revoke all on function private.couple_has_plus(uuid, timestamptz) from public, anon, authenticated, service_role;

-- «Plus attivo, grazie a [nome]» (D4): whether the caller's couple has Plus, and whose.
create or replace function public.get_couple_plus()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'active', coalesce(private.couple_has_plus(me.couple_id), false),
    'by', (select p.display_name from public.plus_entitlements e
           join public.profiles p on p.id = e.user_id
           where p.couple_id = me.couple_id and e.status in ('active', 'grace')
             and (e.expires_at is null or e.expires_at > now())
           order by e.expires_at desc nulls first, p.display_name limit 1))
  from (select (select pr.couple_id from public.profiles pr where pr.id = auth.uid()) couple_id) me;
$$;
revoke all on function public.get_couple_plus() from public, anon, authenticated, service_role;
grant execute on function public.get_couple_plus() to authenticated;

alter table public.profiles add column person_color text
  check (person_color in ('rosa', 'lilla', 'cielo', 'salvia', 'oro', 'pesca', 'rubino', 'perla'));

create or replace function public.set_my_color(p_color text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  partner_color text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.couple_id is null then raise exception 'not a couple member'; end if;
  if p_color is not null then
    if p_color not in ('rosa', 'lilla', 'cielo', 'salvia', 'oro', 'pesca', 'rubino', 'perla') then
      raise exception 'invalid color';
    end if;
    if not private.couple_has_plus(me.couple_id) then raise exception 'plus required'; end if;
    select coalesce(p.person_color, case p.role when 'francesco' then 'rosa' else 'lilla' end) into partner_color
    from public.profiles p where p.couple_id = me.couple_id and p.id <> me.id;
    if partner_color = p_color then raise exception 'partner color'; end if;
  end if;
  update public.profiles set person_color = p_color where id = me.id;
  return jsonb_build_object('color', p_color);
end;
$$;
revoke all on function public.set_my_color(text) from public, anon, authenticated, service_role;
grant execute on function public.set_my_color(text) to authenticated;
