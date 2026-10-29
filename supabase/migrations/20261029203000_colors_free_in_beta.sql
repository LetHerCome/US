-- Colori gratis in beta (founder, 29/10/2026): while US Plus is not on sale,
-- everyone picks a colour, also at the first opening. One switch ends it the day
-- Plus goes on sale (the founder, in the SQL Editor):
--   update public.app_flags set enabled = true, updated_at = now() where key = 'plus_on_sale';
-- From then on changing colour needs Plus again (person_colors_plus_v1); a
-- colour already chosen stays. Only the server reads the switch.

create table if not exists public.app_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.app_flags enable row level security;
revoke all on table public.app_flags from public, anon, authenticated;
insert into public.app_flags (key, enabled) values ('plus_on_sale', false) on conflict (key) do nothing;

create or replace function private.plus_on_sale()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select f.enabled from public.app_flags f where f.key = 'plus_on_sale'), false);
$$;
revoke all on function private.plus_on_sale() from public, anon, authenticated, service_role;

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
    -- In beta (Plus not on sale) the colour is free.
    if private.plus_on_sale() and not private.couple_has_plus(me.couple_id) then raise exception 'plus required'; end if;
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
           order by e.expires_at desc nulls first, p.display_name limit 1),
    -- The app opens the colours to everyone while this is true.
    'colors_free', not private.plus_on_sale())
  from (select (select pr.couple_id from public.profiles pr where pr.id = auth.uid()) couple_id) me;
$$;
revoke all on function public.get_couple_plus() from public, anon, authenticated, service_role;
grant execute on function public.get_couple_plus() to authenticated;
