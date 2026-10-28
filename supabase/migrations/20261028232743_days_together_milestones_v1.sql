-- Traguardi dei giorni insieme (founder, 29/10/2026).
--
-- Every 100 days together is a milestone, every 1000 the biggest prize. The
-- hourly monthiversary-job awards it next to the mesiversario, through
-- award_relationship_days_milestone (service_role only), and the couple reads
-- it from relationship_milestones like the others: kind 'days', with
-- days_together. months_together keeps its meaning (whole months by then).
-- The points stay the job's choice, within the existing 0..500 bound.

alter table public.relationship_milestones add column days_together integer;

alter table public.relationship_milestones drop constraint relationship_milestones_kind_check;
alter table public.relationship_milestones add constraint relationship_milestones_kind_check
  check (kind = any (array['monthiversary'::text, 'anniversary'::text, 'days'::text]));
alter table public.relationship_milestones add constraint relationship_milestones_days_together_check
  check ((kind = 'days') = (days_together is not null) and (days_together is null or (days_together > 0 and days_together % 100 = 0)));

create or replace function public.award_relationship_days_milestone(target_couple_id uuid, target_milestone_date date, target_days integer, target_xp integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  started date;
  whole_months integer;
  inserted_id uuid;
begin
  select c.started_on into started from public.couples c where c.id = target_couple_id;
  -- Only a whole hundred of days since «Insieme dal», on its own date.
  if started is null or target_days is null or target_days <= 0 or target_days % 100 <> 0
    or target_milestone_date - started <> target_days
    or target_xp is null or target_xp < 0 or target_xp > 500 then
    raise exception 'Invalid milestone';
  end if;
  whole_months := (extract(year from age(target_milestone_date, started)) * 12
    + extract(month from age(target_milestone_date, started)))::integer;
  insert into public.relationship_milestones(couple_id, milestone_date, kind, months_together, days_together, xp_awarded)
  values (target_couple_id, target_milestone_date, 'days', greatest(whole_months, 1), target_days, target_xp)
  on conflict (couple_id, milestone_date, kind) do nothing
  returning id into inserted_id;
  if inserted_id is null then return false; end if;
  update public.couples set bond_xp = coalesce(bond_xp, 0) + target_xp where id = target_couple_id;
  insert into public.activity(couple_id, actor_id, type, payload)
  values (target_couple_id, null, 'relationship_milestone', jsonb_build_object('date', target_milestone_date,
    'days', target_days, 'months', whole_months, 'kind', 'days', 'xp', target_xp));
  return true;
end;
$$;

revoke all on function public.award_relationship_days_milestone(uuid, date, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.award_relationship_days_milestone(uuid, date, integer, integer) to service_role;
