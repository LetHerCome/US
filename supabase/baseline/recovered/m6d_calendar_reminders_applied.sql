-- US backend recovered source: m6d_calendar_reminders_applied.sql
-- m6d as production runs it: table, checks + helpers, indexes, RLS, grants, dispatch cron.
-- GENERATED from the production capture by scripts/build-supabase-baseline.mjs.
-- A documentation slice of supabase/baseline (same text, same order). It is not
-- a migration and is not applied by itself; the baseline files are.

-- from 20_tables.sql
create table public.calendar_reminders (
  id uuid not null,
  couple_id uuid not null,
  entry_id uuid not null,
  recipient_id uuid not null,
  offset_minutes integer not null,
  requested_by uuid not null,
  created_at timestamp with time zone not null,
  sent_at timestamp with time zone
);
alter table only public.calendar_reminders add constraint calendar_reminders_pkey PRIMARY KEY (id);
alter table only public.calendar_reminders add constraint calendar_reminders_entry_recipient_offset_unique UNIQUE (entry_id, recipient_id, offset_minutes);

-- from 30_functions.sql
-- public.calendar_reminder_offset_valid(p_entry_id uuid, p_offset_minutes integer)
CREATE OR REPLACE FUNCTION public.calendar_reminder_offset_valid(p_entry_id uuid, p_offset_minutes integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not exists (
    select 1 from public.calendar_entries
    where id = p_entry_id and is_all_day and p_offset_minutes <> 1440
  );
$function$;

-- public.calendar_reminder_recipient_in_couple(p_couple_id uuid, p_recipient_id uuid)
CREATE OR REPLACE FUNCTION public.calendar_reminder_recipient_in_couple(p_couple_id uuid, p_recipient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = p_recipient_id and couple_id = p_couple_id
  );
$function$;

-- public.get_internal_calendar_reminders_cron_key()
CREATE OR REPLACE FUNCTION public.get_internal_calendar_reminders_cron_key()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
  select decrypted_secret from vault.decrypted_secrets where name = 'us_calendar_reminders_cron_key' limit 1
$function$;

-- from 35_column_defaults.sql
alter table only public.calendar_reminders alter column id set default gen_random_uuid();
alter table only public.calendar_reminders alter column created_at set default now();

-- from 40_constraints.sql
alter table only public.calendar_reminders add constraint calendar_reminders_allday_offset_check CHECK (calendar_reminder_offset_valid(entry_id, offset_minutes));
alter table only public.calendar_reminders add constraint calendar_reminders_offset_check CHECK ((offset_minutes = ANY (ARRAY[10, 30, 60, 1440])));
alter table only public.calendar_reminders add constraint calendar_reminders_recipient_in_couple_check CHECK (calendar_reminder_recipient_in_couple(couple_id, recipient_id));
alter table only public.calendar_reminders add constraint calendar_reminders_couple_id_fkey FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE CASCADE;
alter table only public.calendar_reminders add constraint calendar_reminders_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES calendar_entries(id) ON DELETE CASCADE;
alter table only public.calendar_reminders add constraint calendar_reminders_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table only public.calendar_reminders add constraint calendar_reminders_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE CASCADE;

-- from 50_indexes.sql
CREATE INDEX calendar_reminders_entry_idx ON public.calendar_reminders USING btree (entry_id);
CREATE INDEX calendar_reminders_pending_idx ON public.calendar_reminders USING btree (offset_minutes, recipient_id) WHERE (sent_at IS NULL);

-- from 65_rls_policies.sql
alter table public.calendar_reminders enable row level security;
alter table public.calendar_reminders force row level security;

create policy calendar_reminders_delete_requester on public.calendar_reminders as permissive for delete to authenticated
  using (((couple_id = private.current_couple_id()) AND ((requested_by = auth.uid()) OR (recipient_id = auth.uid()))));
create policy calendar_reminders_insert_couple on public.calendar_reminders as permissive for insert to authenticated
  with check (((couple_id = private.current_couple_id()) AND (requested_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = calendar_reminders.recipient_id) AND (p.couple_id = p.couple_id)))) AND (EXISTS ( SELECT 1
   FROM calendar_entries e
  WHERE ((e.id = calendar_reminders.entry_id) AND (e.couple_id = e.couple_id) AND ((e.entry_type = 'shared'::text) OR (e.owner_id = auth.uid())))))));
create policy calendar_reminders_select_couple on public.calendar_reminders as permissive for select to authenticated
  using ((couple_id = private.current_couple_id()));
create policy calendar_reminders_update_requester on public.calendar_reminders as permissive for update to authenticated
  using (((couple_id = private.current_couple_id()) AND (requested_by = auth.uid())))
  with check (((couple_id = private.current_couple_id()) AND (requested_by = auth.uid())));

-- from 70_grants.sql
revoke all on table public.calendar_reminders from public, anon, authenticated, service_role;
grant all on table public.calendar_reminders to service_role;
grant select on table public.calendar_reminders to authenticated;
revoke all on function public.calendar_reminder_offset_valid(p_entry_id uuid, p_offset_minutes integer) from public, anon, authenticated, service_role;
grant all on function public.calendar_reminder_offset_valid(p_entry_id uuid, p_offset_minutes integer) to authenticated;
grant all on function public.calendar_reminder_offset_valid(p_entry_id uuid, p_offset_minutes integer) to service_role;
revoke all on function public.calendar_reminder_recipient_in_couple(p_couple_id uuid, p_recipient_id uuid) from public, anon, authenticated, service_role;
grant all on function public.calendar_reminder_recipient_in_couple(p_couple_id uuid, p_recipient_id uuid) to authenticated;
grant all on function public.calendar_reminder_recipient_in_couple(p_couple_id uuid, p_recipient_id uuid) to service_role;
revoke all on function public.get_internal_calendar_reminders_cron_key() from public, anon, authenticated, service_role;
grant all on function public.get_internal_calendar_reminders_cron_key() to service_role;

-- from 90_cron.sql
select cron.schedule('us-calendar-reminders-dispatch', '* * * * *', $cron$
        select net.http_post(
          url := 'https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/calendar-reminders-worker',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name = 'us_calendar_reminders_cron_key' limit 1)
          ),
          body := '{}'::jsonb
        );
      $cron$);
