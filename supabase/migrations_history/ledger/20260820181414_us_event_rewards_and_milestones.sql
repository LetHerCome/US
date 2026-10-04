-- Production ledger 20260820181414 us_event_rewards_and_milestones: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 f44bd27e37f9a622d2667f9ceaaf59bc; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create table if not exists public.shared_event_completions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.shared_events(id) on delete restrict,
  couple_id uuid not null references public.couples(id) on delete cascade,
  occurrence_date date not null,
  completed_by uuid not null references public.profiles(id),
  xp_awarded integer not null check (xp_awarded between 0 and 500),
  completed_at timestamptz not null default now(),
  unique(event_id, occurrence_date)
);
alter table public.shared_event_completions enable row level security;
drop policy if exists shared_event_completions_select_same_couple on public.shared_event_completions;
create policy shared_event_completions_select_same_couple on public.shared_event_completions for select using (couple_id = private.current_couple_id());
create index if not exists shared_event_completions_couple_date_idx on public.shared_event_completions(couple_id, occurrence_date desc);

create or replace function public.complete_shared_event(target_event_id uuid, target_occurrence_date date)
returns jsonb language plpgsql security definer set search_path='public','private','auth' as $$
declare
  uid uuid := auth.uid(); cid uuid; e public.shared_events%rowtype; existing public.shared_event_completions%rowtype;
  awarded integer; lead_days integer; today_rome date := (current_timestamp at time zone 'Europe/Rome')::date;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id=uid;
  if cid is null then raise exception 'Profile not linked'; end if;
  select * into e from public.shared_events where id=target_event_id and couple_id=cid for update;
  if not found then raise exception 'Event not found'; end if;
  if target_occurrence_date is null or target_occurrence_date > today_rome then raise exception 'Event cannot be completed yet'; end if;
  if e.recurs_yearly then
    if extract(month from target_occurrence_date) <> extract(month from e.event_date) or extract(day from target_occurrence_date) <> extract(day from e.event_date) then raise exception 'Invalid recurring occurrence'; end if;
  elsif target_occurrence_date <> e.event_date then raise exception 'Invalid occurrence date'; end if;
  select * into existing from public.shared_event_completions where event_id=e.id and occurrence_date=target_occurrence_date;
  if found then return jsonb_build_object('completed',true,'already_completed',true,'xp_awarded',existing.xp_awarded,'completed_at',existing.completed_at); end if;
  lead_days := greatest(0, target_occurrence_date - (e.created_at at time zone 'Europe/Rome')::date);
  awarded := case when e.recurs_yearly then 60 when lead_days >= 7 then 50 when lead_days >= 2 then 35 else 25 end;
  insert into public.shared_event_completions(event_id,couple_id,occurrence_date,completed_by,xp_awarded) values(e.id,cid,target_occurrence_date,uid,awarded);
  update public.couples set bond_xp=coalesce(bond_xp,0)+awarded where id=cid;
  insert into public.activity(couple_id,actor_id,type,payload) values(cid,uid,'shared_event_completed',jsonb_build_object('event_id',e.id,'title',e.title,'occurrence_date',target_occurrence_date,'xp',awarded));
  return jsonb_build_object('completed',true,'already_completed',false,'xp_awarded',awarded,'occurrence_date',target_occurrence_date);
end; $$;
revoke all on function public.complete_shared_event(uuid,date) from public;
grant execute on function public.complete_shared_event(uuid,date) to authenticated;

create table if not exists public.relationship_milestones (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  milestone_date date not null,
  kind text not null check (kind in ('monthiversary','anniversary')),
  months_together integer not null check(months_together > 0),
  xp_awarded integer not null check(xp_awarded between 0 and 500),
  awarded_at timestamptz not null default now(),
  unique(couple_id,milestone_date,kind)
);
alter table public.relationship_milestones enable row level security;
drop policy if exists relationship_milestones_select_same_couple on public.relationship_milestones;
create policy relationship_milestones_select_same_couple on public.relationship_milestones for select using (couple_id = private.current_couple_id());
create index if not exists relationship_milestones_couple_date_idx on public.relationship_milestones(couple_id,milestone_date desc);

do $$ begin
  begin alter publication supabase_realtime add table public.shared_event_completions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.relationship_milestones; exception when duplicate_object then null; end;
end $$;;
