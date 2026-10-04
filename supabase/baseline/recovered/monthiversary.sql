-- US backend recovered source: monthiversary.sql
-- Monthiversary subsystem: milestones table, award/key RPCs, hourly cron (Edge source: supabase/functions/monthiversary-job).
-- GENERATED from the production capture by scripts/build-supabase-baseline.mjs.
-- A documentation slice of supabase/baseline (same text, same order). It is not
-- a migration and is not applied by itself; the baseline files are.

-- from 20_tables.sql
create table public.relationship_milestones (
  id uuid not null,
  couple_id uuid not null,
  milestone_date date not null,
  kind text not null,
  months_together integer not null,
  xp_awarded integer not null,
  awarded_at timestamp with time zone not null
);
alter table only public.relationship_milestones add constraint relationship_milestones_pkey PRIMARY KEY (id);
alter table only public.relationship_milestones add constraint relationship_milestones_couple_id_milestone_date_kind_key UNIQUE (couple_id, milestone_date, kind);

-- from 30_functions.sql
-- public.award_relationship_milestone(target_couple_id uuid, target_milestone_date date, target_months integer, target_kind text, target_xp integer)
CREATE OR REPLACE FUNCTION public.award_relationship_milestone(target_couple_id uuid, target_milestone_date date, target_months integer, target_kind text, target_xp integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$;

-- public.get_internal_monthiversary_cron_key()
CREATE OR REPLACE FUNCTION public.get_internal_monthiversary_cron_key()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
  select decrypted_secret from vault.decrypted_secrets where name='us_monthiversary_cron_key' limit 1
$function$;

-- public.get_internal_vapid_private_key()
CREATE OR REPLACE FUNCTION public.get_internal_vapid_private_key()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  secret_value text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed';
  end if;
  select decrypted_secret into secret_value
  from vault.decrypted_secrets
  where name = 'us_web_push_vapid_private'
  limit 1;
  if secret_value is null then raise exception 'VAPID secret missing'; end if;
  return secret_value;
end;
$function$;

-- from 35_column_defaults.sql
alter table only public.relationship_milestones alter column id set default gen_random_uuid();
alter table only public.relationship_milestones alter column awarded_at set default now();

-- from 40_constraints.sql
alter table only public.relationship_milestones add constraint relationship_milestones_kind_check CHECK ((kind = ANY (ARRAY['monthiversary'::text, 'anniversary'::text])));
alter table only public.relationship_milestones add constraint relationship_milestones_months_together_check CHECK ((months_together > 0));
alter table only public.relationship_milestones add constraint relationship_milestones_xp_awarded_check CHECK (((xp_awarded >= 0) AND (xp_awarded <= 500)));
alter table only public.relationship_milestones add constraint relationship_milestones_couple_id_fkey FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE CASCADE;

-- from 50_indexes.sql
CREATE INDEX relationship_milestones_couple_date_idx ON public.relationship_milestones USING btree (couple_id, milestone_date DESC);

-- from 60_triggers.sql
CREATE TRIGGER progression_milestone_complete AFTER INSERT ON public.relationship_milestones FOR EACH ROW EXECUTE FUNCTION private.progression_milestone_trigger();

-- from 65_rls_policies.sql
alter table public.relationship_milestones enable row level security;

create policy relationship_milestones_select_same_couple on public.relationship_milestones as permissive for select to public
  using ((couple_id = private.current_couple_id()));

-- from 70_grants.sql
revoke all on table public.relationship_milestones from public, anon, authenticated, service_role;
grant all on table public.relationship_milestones to anon;
grant all on table public.relationship_milestones to authenticated;
grant all on table public.relationship_milestones to service_role;
revoke all on function public.award_relationship_milestone(target_couple_id uuid, target_milestone_date date, target_months integer, target_kind text, target_xp integer) from public, anon, authenticated, service_role;
grant all on function public.award_relationship_milestone(target_couple_id uuid, target_milestone_date date, target_months integer, target_kind text, target_xp integer) to service_role;
revoke all on function public.get_internal_monthiversary_cron_key() from public, anon, authenticated, service_role;
grant all on function public.get_internal_monthiversary_cron_key() to service_role;
revoke all on function public.get_internal_vapid_private_key() from public, anon, authenticated, service_role;
grant all on function public.get_internal_vapid_private_key() to service_role;

-- from 80_realtime.sql
alter publication supabase_realtime add table only public.relationship_milestones;

-- from 90_cron.sql
select cron.schedule('us-monthiversary-hourly', '5 * * * *', $cron$
      select net.http_post(
        url := 'https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/monthiversary-job',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='us_monthiversary_cron_key' limit 1)
        ),
        body := '{}'::jsonb
      );
    $cron$);
