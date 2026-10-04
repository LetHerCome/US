-- US backend recovered source: quest.sql
-- Quest (Bond weekly quests): tables, functions, policies and the template content.
-- GENERATED from the production capture by scripts/build-supabase-baseline.mjs.
-- A documentation slice of supabase/baseline (same text, same order). It is not
-- a migration and is not applied by itself; the baseline files are.

-- from 20_tables.sql
create table public.bond_quest_templates (
  key text not null,
  title text not null,
  category text not null,
  rarity text not null,
  xp smallint not null,
  mode text not null,
  active boolean not null,
  created_at timestamp with time zone not null
);
alter table only public.bond_quest_templates add constraint bond_quest_templates_pkey PRIMARY KEY (key);

create table public.bond_weekly_quests (
  id uuid not null,
  couple_id uuid not null,
  week_start date not null,
  slot smallint not null,
  template_key text not null,
  title text not null,
  category text not null,
  rarity text not null,
  xp smallint not null,
  confirmed_by uuid[] not null,
  completed_at timestamp with time zone,
  created_at timestamp with time zone not null
);
alter table only public.bond_weekly_quests add constraint bond_weekly_quests_pkey PRIMARY KEY (id);
alter table only public.bond_weekly_quests add constraint bond_weekly_quests_couple_id_week_start_slot_key UNIQUE (couple_id, week_start, slot);
alter table only public.bond_weekly_quests add constraint bond_weekly_quests_couple_week_template_key UNIQUE (couple_id, week_start, template_key);

create table public.bond_weekly_state (
  couple_id uuid not null,
  week_start date not null,
  rerolls_used smallint not null,
  created_at timestamp with time zone not null
);
alter table only public.bond_weekly_state add constraint bond_weekly_state_pkey PRIMARY KEY (couple_id, week_start);

-- from 30_functions.sql
-- private.bond_hash_seed(seed_text text)
CREATE OR REPLACE FUNCTION private.bond_hash_seed(seed_text text)
 RETURNS bigint
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
declare
  h bigint := 2166136261;
  i integer;
begin
  if seed_text = '' then
    return h;
  end if;

  for i in 1..char_length(seed_text) loop
    h := ((h # ascii(substr(seed_text, i, 1))::bigint) * 16777619) % 4294967296;
  end loop;

  return h;
end;
$function$;

-- private.bond_mode_for_couple(target_couple_id uuid)
CREATE OR REPLACE FUNCTION private.bond_mode_for_couple(target_couple_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  lat1 double precision;
  lon1 double precision;
  lat2 double precision;
  lon2 double precision;
  hav double precision;
  km double precision;
begin
  select latitude, longitude
    into lat1, lon1
  from public.couple_locations
  where couple_id = target_couple_id
  order by user_id
  limit 1;

  select latitude, longitude
    into lat2, lon2
  from public.couple_locations
  where couple_id = target_couple_id
  order by user_id
  offset 1
  limit 1;

  if lat1 is null or lat2 is null then
    return 'any';
  end if;

  hav :=
    power(sin(radians((lat2 - lat1) / 2.0)), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
      * power(sin(radians((lon2 - lon1) / 2.0)), 2);

  km := 6371.0 * 2.0 * asin(sqrt(least(1.0, greatest(0.0, hav))));
  return case when km > 50.0 then 'far' else 'near' end;
end;
$function$;

-- private.bond_week_start_rome(at_time timestamp with time zone)
CREATE OR REPLACE FUNCTION private.bond_week_start_rome(at_time timestamp with time zone DEFAULT now())
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select date_trunc('week', timezone('Europe/Rome', at_time))::date
$function$;

-- private.confirm_bond_quest_internal(target_quest_id uuid)
CREATE OR REPLACE FUNCTION private.confirm_bond_quest_internal(target_quest_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  q public.bond_weekly_quests%rowtype;
  uid uuid := auth.uid();
  cid uuid;
  next_confirmed uuid[];
  valid_confirmers integer;
  new_xp integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  cid := private.current_couple_id();
  if cid is null then
    raise exception 'Couple not found';
  end if;

  select *
    into q
  from public.bond_weekly_quests
  where id = target_quest_id
    and couple_id = cid
  for update;

  if not found then
    raise exception 'Quest not found';
  end if;

  if q.week_start <> private.bond_week_start_rome(now()) then
    raise exception 'Quest week is closed';
  end if;

  if q.completed_at is not null then
    select bond_xp
      into new_xp
    from public.couples
    where id = q.couple_id;

    return jsonb_build_object(
      'completed', true,
      'bond_xp', new_xp,
      'confirmed_by', q.confirmed_by
    );
  end if;

  next_confirmed := coalesce(q.confirmed_by, '{}'::uuid[]);

  if array_position(next_confirmed, uid) is null then
    next_confirmed := array_append(next_confirmed, uid);
  end if;

  select count(distinct p.id)::integer
    into valid_confirmers
  from public.profiles p
  where p.couple_id = q.couple_id
    and p.id = any(next_confirmed);

  if valid_confirmers >= 2 then
    update public.bond_weekly_quests
      set confirmed_by = next_confirmed,
          completed_at = now()
    where id = q.id;

    update public.couples
      set bond_xp = bond_xp + q.xp
    where id = q.couple_id
    returning bond_xp into new_xp;

    insert into public.activity(couple_id, actor_id, type, payload)
    values (
      q.couple_id,
      uid,
      'bond_quest_completed',
      jsonb_build_object(
        'quest_id', q.id,
        'title', q.title,
        'xp', q.xp
      )
    );

    return jsonb_build_object(
      'completed', true,
      'bond_xp', new_xp,
      'confirmed_by', next_confirmed,
      'xp_awarded', q.xp
    );
  end if;

  update public.bond_weekly_quests
    set confirmed_by = next_confirmed
  where id = q.id;

  select bond_xp
    into new_xp
  from public.couples
  where id = q.couple_id;

  return jsonb_build_object(
    'completed', false,
    'bond_xp', new_xp,
    'confirmed_by', next_confirmed
  );
end;
$function$;

-- private.ensure_bond_week_internal()
CREATE OR REPLACE FUNCTION private.ensure_bond_week_internal()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  cid uuid;
  week date;
  quest_mode text;
  slot_no integer;
  pool text[];
  candidates text[];
  used_keys text[];
  picked_key text;
  picked public.bond_quest_templates%rowtype;
  pick_index integer;
  quest_count integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  cid := private.current_couple_id();
  if cid is null then
    raise exception 'Couple not found';
  end if;

  week := private.bond_week_start_rome(now());

  insert into public.bond_weekly_state(couple_id, week_start, rerolls_used)
  values (cid, week, 0)
  on conflict (couple_id, week_start) do nothing;

  perform 1
  from public.bond_weekly_state
  where couple_id = cid and week_start = week
  for update;

  quest_mode := private.bond_mode_for_couple(cid);

  for slot_no in 1..3 loop
    if exists (
      select 1
      from public.bond_weekly_quests
      where couple_id = cid
        and week_start = week
        and slot = slot_no
    ) then
      continue;
    end if;

    select coalesce(array_agg(template_key order by template_key), '{}'::text[])
      into used_keys
    from public.bond_weekly_quests
    where couple_id = cid
      and week_start = week;

    select array_agg(t.key order by t.key)
      into pool
    from public.bond_quest_templates t
    where t.active = true
      and (t.mode = 'any' or t.mode = quest_mode)
      and (
        (slot_no = 1 and t.rarity in ('common', 'uncommon'))
        or (slot_no = 2 and t.rarity in ('uncommon', 'rare'))
        or (slot_no = 3 and t.rarity in ('rare', 'epic'))
      );

    if coalesce(cardinality(pool), 0) = 0 then
      select array_agg(t.key order by t.key)
        into pool
      from public.bond_quest_templates t
      where t.active = true
        and (t.mode = 'any' or t.mode = quest_mode);
    end if;

    select array_agg(k order by k)
      into candidates
    from unnest(coalesce(pool, '{}'::text[])) as k
    where not (k = any(coalesce(used_keys, '{}'::text[])));

    if coalesce(cardinality(candidates), 0) = 0 then
      continue;
    end if;

    pick_index :=
      (private.bond_hash_seed(
        cid::text || '|' || week::text || '|' || slot_no::text || '|bond'
      ) % cardinality(candidates))::integer + 1;

    picked_key := candidates[pick_index];

    select *
      into picked
    from public.bond_quest_templates
    where key = picked_key
      and active = true;

    if not found then
      raise exception 'Quest template disappeared during initialization';
    end if;

    insert into public.bond_weekly_quests(
      couple_id,
      week_start,
      slot,
      template_key,
      title,
      category,
      rarity,
      xp,
      confirmed_by,
      completed_at
    )
    values (
      cid,
      week,
      slot_no,
      picked.key,
      picked.title,
      picked.category,
      picked.rarity,
      picked.xp,
      '{}'::uuid[],
      null
    )
    on conflict (couple_id, week_start, slot) do nothing;
  end loop;

  select count(*)::integer
    into quest_count
  from public.bond_weekly_quests
  where couple_id = cid
    and week_start = week;

  return jsonb_build_object(
    'week_start', week,
    'mode', quest_mode,
    'quest_count', quest_count
  );
end;
$function$;

-- private.reroll_bond_quest_internal(target_quest_id uuid, target_template_key text)
CREATE OR REPLACE FUNCTION private.reroll_bond_quest_internal(target_quest_id uuid, target_template_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  q public.bond_weekly_quests%rowtype;
  s public.bond_weekly_state%rowtype;
  t public.bond_quest_templates%rowtype;
  uid uuid := auth.uid();
  cid uuid;
  quest_mode text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  cid := private.current_couple_id();
  if cid is null then
    raise exception 'Couple not found';
  end if;

  select *
    into q
  from public.bond_weekly_quests
  where id = target_quest_id
    and couple_id = cid
  for update;

  if not found then
    raise exception 'Quest not found';
  end if;

  if q.week_start <> private.bond_week_start_rome(now()) then
    raise exception 'Quest week is closed';
  end if;

  if q.completed_at is not null then
    raise exception 'Quest already completed';
  end if;

  if cardinality(q.confirmed_by) > 0 then
    raise exception 'Quest already confirmed';
  end if;

  select *
    into s
  from public.bond_weekly_state
  where couple_id = q.couple_id
    and week_start = q.week_start
  for update;

  if not found then
    raise exception 'Weekly state not found';
  end if;

  if s.rerolls_used >= 3 then
    raise exception 'No rerolls left';
  end if;

  select *
    into t
  from public.bond_quest_templates
  where key = target_template_key
    and active = true;

  if not found then
    raise exception 'Template not found';
  end if;

  quest_mode := private.bond_mode_for_couple(cid);

  if not (t.mode = 'any' or t.mode = quest_mode) then
    raise exception 'Template not eligible for current couple mode';
  end if;

  if exists (
    select 1
    from public.bond_weekly_quests x
    where x.couple_id = q.couple_id
      and x.week_start = q.week_start
      and x.id <> q.id
      and x.template_key = t.key
  ) then
    raise exception 'Template already used';
  end if;

  update public.bond_weekly_quests
    set template_key = t.key,
        title = t.title,
        category = t.category,
        rarity = t.rarity,
        xp = t.xp,
        confirmed_by = '{}'::uuid[],
        completed_at = null
  where id = q.id;

  update public.bond_weekly_state
    set rerolls_used = rerolls_used + 1
  where couple_id = q.couple_id
    and week_start = q.week_start
  returning * into s;

  return jsonb_build_object(
    'rerolls_used', s.rerolls_used,
    'template_key', t.key
  );
end;
$function$;

-- public.confirm_bond_quest(target_quest_id uuid)
CREATE OR REPLACE FUNCTION public.confirm_bond_quest(target_quest_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.confirm_bond_quest_internal(target_quest_id)
$function$;

-- public.ensure_bond_week()
CREATE OR REPLACE FUNCTION public.ensure_bond_week()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.ensure_bond_week_internal()
$function$;

-- public.reroll_bond_quest(target_quest_id uuid, target_template_key text)
CREATE OR REPLACE FUNCTION public.reroll_bond_quest(target_quest_id uuid, target_template_key text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.reroll_bond_quest_internal(target_quest_id, target_template_key)
$function$;

-- from 35_column_defaults.sql
alter table only public.bond_quest_templates alter column mode set default 'any'::text;
alter table only public.bond_quest_templates alter column active set default true;
alter table only public.bond_quest_templates alter column created_at set default now();
alter table only public.bond_weekly_quests alter column id set default gen_random_uuid();
alter table only public.bond_weekly_quests alter column confirmed_by set default '{}'::uuid[];
alter table only public.bond_weekly_quests alter column created_at set default now();
alter table only public.bond_weekly_state alter column rerolls_used set default 0;
alter table only public.bond_weekly_state alter column created_at set default now();

-- from 40_constraints.sql
alter table only public.bond_quest_templates add constraint bond_quest_templates_mode_check CHECK ((mode = ANY (ARRAY['any'::text, 'near'::text, 'far'::text])));
alter table only public.bond_quest_templates add constraint bond_quest_templates_rarity_check CHECK ((rarity = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'epic'::text])));
alter table only public.bond_quest_templates add constraint bond_quest_templates_xp_check CHECK ((xp = ANY (ARRAY[25, 40, 60, 100])));
alter table only public.bond_weekly_quests add constraint bond_weekly_quests_rarity_check CHECK ((rarity = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'epic'::text])));
alter table only public.bond_weekly_quests add constraint bond_weekly_quests_slot_check CHECK (((slot >= 1) AND (slot <= 3)));
alter table only public.bond_weekly_quests add constraint bond_weekly_quests_xp_check CHECK ((xp > 0));
alter table only public.bond_weekly_state add constraint bond_weekly_state_rerolls_used_check CHECK (((rerolls_used >= 0) AND (rerolls_used <= 3)));
alter table only public.bond_weekly_quests add constraint bond_weekly_quests_couple_id_fkey FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE CASCADE;
alter table only public.bond_weekly_quests add constraint bond_weekly_quests_template_key_fkey FOREIGN KEY (template_key) REFERENCES bond_quest_templates(key);
alter table only public.bond_weekly_state add constraint bond_weekly_state_couple_id_fkey FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE CASCADE;

-- from 50_indexes.sql
CREATE INDEX bond_weekly_quests_lookup_idx ON public.bond_weekly_quests USING btree (couple_id, week_start, slot);
CREATE INDEX bond_weekly_quests_template_key_idx ON public.bond_weekly_quests USING btree (template_key);

-- from 60_triggers.sql
CREATE TRIGGER progression_quest_complete AFTER UPDATE OF completed_at ON public.bond_weekly_quests FOR EACH ROW EXECUTE FUNCTION private.progression_quest_trigger();

-- from 65_rls_policies.sql
alter table public.bond_quest_templates enable row level security;
alter table public.bond_weekly_quests enable row level security;
alter table public.bond_weekly_state enable row level security;

create policy bond_templates_read on public.bond_quest_templates as permissive for select to authenticated
  using ((active = true));
create policy bond_quests_select on public.bond_weekly_quests as permissive for select to authenticated
  using ((couple_id = private.current_couple_id()));
create policy bond_weekly_state_select on public.bond_weekly_state as permissive for select to authenticated
  using ((couple_id = private.current_couple_id()));

-- from 70_grants.sql
revoke all on table public.bond_quest_templates from public, anon, authenticated, service_role;
grant all on table public.bond_quest_templates to service_role;
grant select on table public.bond_quest_templates to authenticated;
revoke all on table public.bond_weekly_quests from public, anon, authenticated, service_role;
grant all on table public.bond_weekly_quests to service_role;
grant select on table public.bond_weekly_quests to authenticated;
revoke all on table public.bond_weekly_state from public, anon, authenticated, service_role;
grant all on table public.bond_weekly_state to service_role;
grant select on table public.bond_weekly_state to authenticated;
revoke all on function private.bond_hash_seed(seed_text text) from public, anon, authenticated, service_role;
revoke all on function private.bond_mode_for_couple(target_couple_id uuid) from public, anon, authenticated, service_role;
revoke all on function private.bond_week_start_rome(at_time timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function private.confirm_bond_quest_internal(target_quest_id uuid) from public, anon, authenticated, service_role;
grant all on function private.confirm_bond_quest_internal(target_quest_id uuid) to authenticated;
grant all on function private.confirm_bond_quest_internal(target_quest_id uuid) to service_role;
revoke all on function private.ensure_bond_week_internal() from public, anon, authenticated, service_role;
grant all on function private.ensure_bond_week_internal() to authenticated;
grant all on function private.ensure_bond_week_internal() to service_role;
revoke all on function private.reroll_bond_quest_internal(target_quest_id uuid, target_template_key text) from public, anon, authenticated, service_role;
grant all on function private.reroll_bond_quest_internal(target_quest_id uuid, target_template_key text) to authenticated;
grant all on function private.reroll_bond_quest_internal(target_quest_id uuid, target_template_key text) to service_role;
revoke all on function public.confirm_bond_quest(target_quest_id uuid) from public, anon, authenticated, service_role;
grant all on function public.confirm_bond_quest(target_quest_id uuid) to service_role;
grant all on function public.confirm_bond_quest(target_quest_id uuid) to authenticated;
revoke all on function public.ensure_bond_week() from public, anon, authenticated, service_role;
grant all on function public.ensure_bond_week() to service_role;
grant all on function public.ensure_bond_week() to authenticated;
revoke all on function public.reroll_bond_quest(target_quest_id uuid, target_template_key text) from public, anon, authenticated, service_role;
grant all on function public.reroll_bond_quest(target_quest_id uuid, target_template_key text) to service_role;
grant all on function public.reroll_bond_quest(target_quest_id uuid, target_template_key text) to authenticated;

-- from 80_realtime.sql
alter publication supabase_realtime add table only public.bond_weekly_quests;

-- from 95_reference_data.sql
insert into public.bond_quest_templates
select * from jsonb_populate_recordset(null::public.bond_quest_templates, $rows$[{"xp":100,"key":"any-intentional-memory","mode":"any","title":"Create un ricordo intenzionale: una foto, una nota e qualcosa di nuovo.","active":true,"rarity":"epic","category":"memory","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":100,"key":"any-mini-surprise","mode":"any","title":"Organizzate una mini sorpresa per l’altro entro domenica.","active":true,"rarity":"epic","category":"surprise","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":100,"key":"far-next-meeting-note","mode":"far","title":"Scrivete una nota da leggere solo al prossimo incontro.","active":true,"rarity":"epic","category":"surprise","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":25,"key":"any-absurd-question","mode":"any","title":"Uno prepara una domanda assurda. L’altro deve rispondere seriamente.","active":true,"rarity":"common","category":"fun","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":25,"key":"any-appreciate","mode":"any","title":"Ditevi una cosa che apprezzate dell’altro e che dite troppo poco.","active":true,"rarity":"common","category":"connection","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":25,"key":"any-couple-mood","mode":"any","title":"Scrivete una frase che descrive il mood della vostra coppia questa settimana.","active":true,"rarity":"common","category":"memory","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":25,"key":"any-wake-up-top3","mode":"any","title":"Fate una top 3 dei posti in cui vorreste svegliarvi domani.","active":true,"rarity":"common","category":"adventure","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":25,"key":"any-week-photo","mode":"any","title":"Fate una foto che rappresenti questa settimana di voi.","active":true,"rarity":"common","category":"memory","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":25,"key":"far-same-episode","mode":"far","title":"Guardate lo stesso episodio o video nello stesso momento.","active":true,"rarity":"common","category":"fun","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":25,"key":"far-song-sync","mode":"far","title":"Scegliete una canzone e ascoltatela nello stesso momento.","active":true,"rarity":"common","category":"connection","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":25,"key":"far-thought-photo","mode":"far","title":"Mandatevi una foto di qualcosa che oggi vi ha fatto pensare all’altro.","active":true,"rarity":"common","category":"memory","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":25,"key":"near-breakfast","mode":"near","title":"Fate colazione, merenda o un caffè fuori insieme.","active":true,"rarity":"common","category":"chill","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":25,"key":"near-movie-snack","mode":"near","title":"Uno sceglie cosa guardare, l’altro sceglie lo snack.","active":true,"rarity":"common","category":"fun","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":25,"key":"near-walk","mode":"near","title":"Fate una passeggiata di almeno 30 minuti senza telefoni.","active":true,"rarity":"common","category":"connection","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":40,"key":"any-home-photo","mode":"any","title":"Scegliete insieme una nuova foto Home per US.","active":true,"rarity":"uncommon","category":"memory","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":40,"key":"any-next-month","mode":"any","title":"Scegliete insieme una cosa che volete vivere nel prossimo mese.","active":true,"rarity":"uncommon","category":"adventure","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":40,"key":"any-old-photo","mode":"any","title":"Scegliete una vecchia foto e raccontate cosa ricordate di quel momento.","active":true,"rarity":"uncommon","category":"memory","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":40,"key":"any-private-meme","mode":"any","title":"Create un meme privato su qualcosa successa tra voi.","active":true,"rarity":"uncommon","category":"fun","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":40,"key":"any-secret-detail","mode":"any","title":"Scoprite una cosa nuova che l’altro non sa ancora di voi.","active":true,"rarity":"uncommon","category":"discover","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":40,"key":"any-week-ritual","mode":"any","title":"Inventate un piccolo rituale da ripetere almeno due volte questa settimana.","active":true,"rarity":"uncommon","category":"connection","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":40,"key":"far-dinner-call","mode":"far","title":"Fate una cena insieme in videochiamata.","active":true,"rarity":"uncommon","category":"connection","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":40,"key":"far-playlist","mode":"far","title":"Create una playlist di 5 canzoni per l’altro.","active":true,"rarity":"uncommon","category":"surprise","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":40,"key":"far-ten-questions","mode":"far","title":"Fatevi 10 domande a turno in chiamata, senza prepararle prima.","active":true,"rarity":"uncommon","category":"discover","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":40,"key":"near-cook-new","mode":"near","title":"Cucinate qualcosa che non avete mai preparato insieme.","active":true,"rarity":"uncommon","category":"discover","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":40,"key":"near-five-euro","mode":"near","title":"Scambiatevi una mini sorpresa con budget massimo 5 €.","active":true,"rarity":"uncommon","category":"surprise","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":40,"key":"near-random-road","mode":"near","title":"Scegliete una direzione a caso e seguitela per 20 minuti.","active":true,"rarity":"uncommon","category":"adventure","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":60,"key":"any-grow-together","mode":"any","title":"Ognuno sceglie una piccola cosa che vorrebbe migliorare insieme.","active":true,"rarity":"rare","category":"connection","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":60,"key":"any-no-phone","mode":"any","title":"45 minuti senza distrazioni: insieme oppure in chiamata.","active":true,"rarity":"rare","category":"connection","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":60,"key":"far-comfort-food","mode":"far","title":"Scegliete lo stesso tipo di comfort food e mangiatelo insieme in call.","active":true,"rarity":"rare","category":"fun","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":60,"key":"far-dream-date","mode":"far","title":"Progettate in chiamata un appuntamento impossibile senza limiti di budget.","active":true,"rarity":"rare","category":"adventure","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":60,"key":"near-new-place","mode":"near","title":"Provate un posto dove nessuno dei due è mai stato.","active":true,"rarity":"rare","category":"adventure","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":60,"key":"near-recreate-photo","mode":"near","title":"Ricreate una vostra vecchia foto.","active":true,"rarity":"rare","category":"memory","created_at":"2026-08-19T00:43:51.289178+00:00"},{"xp":60,"key":"near-sunset","mode":"near","title":"Trovate un posto carino e guardate insieme il tramonto.","active":true,"rarity":"rare","category":"adventure","created_at":"2026-08-19T00:43:51.289178+00:00"}]$rows$::jsonb);
