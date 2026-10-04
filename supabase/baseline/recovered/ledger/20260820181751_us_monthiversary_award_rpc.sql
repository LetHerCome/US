-- US backend recovered source: production ledger 20260820181751 us_monthiversary_award_rpc
-- GENERATED from the production capture (c10, supabase_migrations.schema_migrations.statements)
-- by scripts/build-supabase-baseline.mjs. 1 statement(s), 0 key-like literal(s) masked.
-- HISTORY ONLY: what production ran under this version. Never apply it.

create or replace function public.award_relationship_milestone(target_couple_id uuid,target_milestone_date date,target_months integer,target_kind text,target_xp integer)
returns boolean language plpgsql security definer set search_path='public' as $$
declare inserted_id uuid;
begin
  if target_months<=0 or target_xp<0 or target_xp>500 or target_kind not in ('monthiversary','anniversary') then raise exception 'Invalid milestone'; end if;
  insert into public.relationship_milestones(couple_id,milestone_date,kind,months_together,xp_awarded)
  values(target_couple_id,target_milestone_date,target_kind,target_months,target_xp)
  on conflict(couple_id,milestone_date,kind) do nothing
  returning id into inserted_id;
  if inserted_id is null then return false; end if;
  update public.couples set bond_xp=coalesce(bond_xp,0)+target_xp where id=target_couple_id;
  insert into public.activity(couple_id,actor_id,type,payload)
  values(target_couple_id,null,'relationship_milestone',jsonb_build_object('date',target_milestone_date,'months',target_months,'kind',target_kind,'xp',target_xp));
  return true;
end; $$;
revoke all on function public.award_relationship_milestone(uuid,date,integer,text,integer) from public,anon,authenticated;
grant execute on function public.award_relationship_milestone(uuid,date,integer,text,integer) to service_role;;
