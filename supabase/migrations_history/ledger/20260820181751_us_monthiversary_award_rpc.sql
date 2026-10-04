-- Production ledger 20260820181751 us_monthiversary_award_rpc: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 ff9c1643cffba1f5a244ee76d1f4e3dc; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

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
