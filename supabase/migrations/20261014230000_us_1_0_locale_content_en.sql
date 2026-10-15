-- US 1.0: content in each person's own language, and E se…? inside Confrontatevi.
-- Runs after 20261014220000_content_1_0 (it reads the English columns that
-- migration filled). Re-applying this migration changes nothing.
--
-- 1. public.profiles.locale ('it' | 'en', null = not chosen yet = Italian),
--    written only through public.set_my_locale(p_locale) for the caller's own
--    row. Clients cannot write the column directly.
-- 2. Every server path that hands content text to the app answers in the
--    CALLER's language: English when the caller's locale is 'en' and the
--    English exists, otherwise exactly the Italian of today. Shared rows stay
--    shared (one Daily Question per day, one session per round, one quest per
--    slot): the language is picked at read time, per caller, so two partners
--    of the same couple each read their own language.
--      - Daily Question: get_or_create_daily_question; kept Daily (Ricordi)
--        through keep_daily_question and the computed field
--        public.question_text_localized(daily_question_keepsakes).
--      - Game V2 and Swipe: private.m11a_session_state, the one state builder
--        behind start_game_round, start_swipe_round, get_game_session,
--        save_game_session_answer, complete_game_session_side and
--        mark_game_session_reveal_seen. Session items keep their Italian
--        snapshot; English is rendered from the catalog row of the same
--        version, with the couple's own names.
--      - Context recipes (calendar, Da vivere, Ricordi, Conservati,
--        longitudinal): the English template with the same placeholders,
--        English date labels, English kind labels and English options
--        (new nullable columns game_v2_recipes.kind_label_en / options_en).
--      - Weekly quests: titles are snapshotted in Italian into
--        bond_weekly_quests, which the app reads directly. They are
--        translated at read time from the template (template_key) through the
--        computed field public.title_localized(bond_weekly_quests).
-- 3. E se…? merges into Confrontatevi (founder decision): a Confrontatevi
--    round draws from both pools and the E se prompts render as Confrontatevi.
--    Nothing is deleted or rewritten: catalog rows keep id and family, old
--    sessions keep their items, and an older app that still starts 'e_se'
--    gets a round from the same merged pool.
-- Signatures, return shapes, security modes, RLS and grants of existing
-- functions and tables are unchanged.

-- Preflight: the content migration ran, and every function replaced below is
-- the audited baseline body or the body this migration writes (a re-apply).
-- Anything else aborts before any change.
do $us_1_0_locale_preflight$
declare r record; body text;
begin
  if pg_catalog.to_regprocedure('private.game_v2_render(text,text,uuid)') is null
    or pg_catalog.to_regprocedure('private.game_v2_render_options(jsonb,text,uuid)') is null
    or (select pg_catalog.count(*) from (values
      ('public.game_v2_catalog', 'question_text_en'), ('public.game_v2_catalog', 'predict_text_en'),
      ('public.game_v2_catalog', 'options_en'), ('private.game_swipe_v1_catalog', 'question_text_en'),
      ('private.game_swipe_v1_catalog', 'options_en'), ('public.daily_question_templates', 'question_en'),
      ('public.game_v2_recipes', 'question_text_en'), ('public.bond_quest_templates', 'title_en')) v(rel, col)
      where exists (select 1 from pg_catalog.pg_attribute a
        where a.attrelid = pg_catalog.to_regclass(v.rel) and a.attname = v.col and not a.attisdropped)) <> 8 then
    raise exception using errcode = 'P0001', message = 'us 1.0 locale: run 20261014220000_content_1_0 first';
  end if;
  for r in select * from (values
    ('public.get_or_create_daily_question()', '44db5cef359b0cd01937b04858119626', '55c26c22a2b1ead2ea1089968c1d6b6d'),
    ('private.daily_question_keepsake_json(public.daily_question_keepsakes,text)', '772dbca214fddaa6b760ac4cf52959d5', '39b135388b2eec27aa2371dede0fe577'),
    ('private.m11a_session_state(uuid,uuid,text)', '1a77b609b882dff2dc62ea9bb6d6efd5', 'ec7745cf8b8fcae778d39ad9e314a6c1'),
    ('private.game_v2_candidates(uuid,text,timestamp with time zone)', '5b527bfaa1275ad39df5b48f5a96b253', '585d2aa6cb2dc80de4d613f3c1e1a406'),
    ('private.game_v2_recipe_candidates(text,text,text,jsonb,timestamp with time zone)', '12025c3695253d88517954741db0fef6', '93314dd0f3435f74c6010cf228bd1900'),
    ('private.game_v2_ctx_longitudinal(uuid,text,timestamp with time zone)', '9b8db3fc94be98079431ed5129ee8d27', '34032d699424d3d4689f42f66cff04a6')
  ) v(sig, audited, target) loop
    select pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', '')) into body
    from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure(r.sig);
    if body is null or body not in (r.audited, r.target) then
      raise exception using errcode = 'P0001', message = 'us 1.0 locale: ' || r.sig || ' is not the audited version',
        detail = coalesce(body, 'missing');
    end if;
  end loop;
end;
$us_1_0_locale_preflight$;

-- 1. Per-person language ---------------------------------------------------

alter table public.profiles add column if not exists locale text;
do $us_1_0_locale_check$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
      where conrelid = 'public.profiles'::regclass and conname = 'profiles_locale_check') then
    alter table public.profiles add constraint profiles_locale_check check (locale in ('it', 'en'));
  end if;
end;
$us_1_0_locale_check$;
comment on column public.profiles.locale is 'US 1.0 content language of this person: it or en; null (not chosen yet) reads Italian. Written only through public.set_my_locale.';

create or replace function public.set_my_locale(p_locale text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare uid uuid := auth.uid(); saved text;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_locale is null or p_locale not in ('it', 'en') then
    raise exception using errcode = '22023', message = 'invalid locale';
  end if;
  -- Only the caller's own row; the same value again writes nothing.
  update public.profiles as p set locale = p_locale
   where p.id = uid and p.locale is distinct from p_locale;
  select p.locale into saved from public.profiles as p where p.id = uid;
  if not found then
    raise exception using errcode = '42501', message = 'profile required';
  end if;
  return jsonb_build_object('locale', saved);
end;
$function$;
alter function public.set_my_locale(text) owner to postgres;
revoke all on function public.set_my_locale(text) from public, anon, authenticated, service_role;
grant execute on function public.set_my_locale(text) to authenticated;
comment on function public.set_my_locale(text) is 'US 1.0: sets the caller''s own content language (it | en). Idempotent; rejects any other value; returns {locale}.';

-- The caller's language ('it' when not chosen). Server-only helpers.
create or replace function private.us_caller_locale()
 returns text
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce((select p.locale from public.profiles p where p.id = auth.uid()), 'it');
$function$;

create or replace function private.us_profile_locale(target_couple uuid, target_role text)
 returns text
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce((select p.locale from public.profiles p
    where p.couple_id = target_couple and p.role = target_role), 'it');
$function$;

revoke all on function private.us_caller_locale() from public, anon, authenticated, service_role;
revoke all on function private.us_profile_locale(uuid, text) from public, anon, authenticated, service_role;

-- 2. English for the context recipes ----------------------------------------
-- The question English came with 20261014220000; the chip label and the two
-- choice recipes' options complete it. Options mirror the Italian one to one
-- (answers are stored as an index).

alter table public.game_v2_recipes
  add column if not exists kind_label_en text,
  add column if not exists options_en jsonb;
do $us_1_0_recipe_checks$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
      where conrelid = 'public.game_v2_recipes'::regclass and conname = 'game_v2_recipes_options_en_check') then
    alter table public.game_v2_recipes add constraint game_v2_recipes_options_en_check check (
      options_en is null or (jsonb_typeof(options_en) = 'array' and jsonb_array_length(options_en) = jsonb_array_length(options)));
  end if;
end;
$us_1_0_recipe_checks$;

update public.game_v2_recipes as r
set kind_label_en = v.kind_label_en, options_en = v.options_en
from (values
  ('calendar_past-001', 'From your calendar', '[]'::jsonb),
  ('calendar_past-002', 'From your calendar', '[]'::jsonb),
  ('calendar_upcoming-001', 'On your calendar', '[]'::jsonb),
  ('calendar_upcoming-002', 'On your calendar', '[]'::jsonb),
  ('conservati-001', 'From what you’ve kept', '[]'::jsonb),
  ('da_vivere_idea-001', 'From your ideas', '[]'::jsonb),
  ('da_vivere_idea-002', 'From your ideas', '["Plan it carefully", "Do it on a whim", "A bit of both"]'::jsonb),
  ('da_vivere_idea-003', 'From your ideas', '[]'::jsonb),
  ('da_vivere_lived-001', 'Lived together', '[]'::jsonb),
  ('da_vivere_lived-002', 'Lived together', '["Nothing, I’d do it all the same way", "Just the pace: more time", "Everything: a brand-new experience"]'::jsonb),
  ('longitudinal-001', 'You already played this {when}', '[]'::jsonb),
  ('moment-001', 'From your memories', '[]'::jsonb),
  ('moment-002', 'From your memories', '[]'::jsonb)
) as v(id, kind_label_en, options_en)
where r.id = v.id
  and (r.kind_label_en is distinct from v.kind_label_en or r.options_en is distinct from v.options_en);

-- Da vivere is now "Le vostre idee" inside Missioni: the label follows it.
update public.game_v2_recipes set kind_label = 'Dalle vostre idee'
where adapter = 'da_vivere_idea' and kind_label = 'Da vivere';

comment on column public.game_v2_recipes.kind_label_en is 'US 1.0 English of kind_label (same placeholders).';
comment on column public.game_v2_recipes.options_en is 'US 1.0 English of options, same order and length.';
comment on column public.game_v2_catalog.question_text_en is 'US 1.0 English of question_text, served to callers whose profiles.locale is en.';
comment on column private.game_swipe_v1_catalog.question_text_en is 'US 1.0 English of question_text, served to callers whose profiles.locale is en.';
comment on column public.daily_question_templates.question_en is 'US 1.0 English of question, served to callers whose profiles.locale is en.';
comment on column public.game_v2_recipes.question_text_en is 'US 1.0 English of question_text (same placeholders), served to callers whose profiles.locale is en.';
comment on column public.bond_quest_templates.title_en is 'US 1.0 English of title, served through public.title_localized(bond_weekly_quests).';

-- English date labels, mirroring private.game_v2_day_label / game_v2_when_label.
create or replace function private.game_v2_month_name_en(d date)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select (array['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'])[extract(month from d)::integer];
$function$;

create or replace function private.game_v2_when_label_en(d date, at_date date)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select 'in ' || private.game_v2_month_name_en(d)
    || case when extract(year from d) <> extract(year from at_date) then ' ' || extract(year from d)::integer::text else '' end;
$function$;

-- The English of a label the Italian helpers wrote into a session item
-- ('14 ottobre' -> 'October 14', 'ad aprile 2025' -> 'in April 2025');
-- null for anything else, so the item stays Italian.
create or replace function private.game_v2_label_en(label text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  with months(it, en) as (values ('gennaio', 'January'), ('febbraio', 'February'), ('marzo', 'March'),
    ('aprile', 'April'), ('maggio', 'May'), ('giugno', 'June'), ('luglio', 'July'), ('agosto', 'August'),
    ('settembre', 'September'), ('ottobre', 'October'), ('novembre', 'November'), ('dicembre', 'December')),
  parsed as (select regexp_match(label, '^([0-9]{1,2}) ([a-z]+)$') d, regexp_match(label, '^(a|ad) ([a-z]+)( [0-9]{4})?$') w)
  select coalesce(
    (select m.en || ' ' || (p.d)[1]::integer::text from parsed p join months m on m.it = (p.d)[2]),
    (select 'in ' || m.en || coalesce((p.w)[3], '') from parsed p join months m on m.it = (p.w)[2]));
$function$;

-- 3. E se…? inside Confrontatevi -------------------------------------------
-- A Confrontatevi (or a legacy 'e_se') round draws from both families; the
-- E se prompts are presented as Confrontatevi.
create or replace function private.game_v2_family_pool(target_family text)
 returns text[]
 language sql
 immutable
 set search_path to ''
as $function$
  select case when target_family in ('confrontatevi', 'e_se') then array['confrontatevi', 'e_se']::text[]
    else array[target_family]::text[] end;
$function$;

create or replace function private.game_v2_merged_family(family text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case when family = 'e_se' then 'confrontatevi' else family end;
$function$;

revoke all on function private.game_v2_month_name_en(date) from public, anon, authenticated, service_role;
revoke all on function private.game_v2_when_label_en(date, date) from public, anon, authenticated, service_role;
revoke all on function private.game_v2_label_en(text) from public, anon, authenticated, service_role;
revoke all on function private.game_v2_family_pool(text) from public, anon, authenticated, service_role;
revoke all on function private.game_v2_merged_family(text) from public, anon, authenticated, service_role;

-- The English of one session item, or null when any part of it has no
-- English (the item then stays Italian as a whole). English always comes from
-- the catalog / recipe row of the version the item was built from; names are
-- the couple's own, through the content 1.0 render helpers.
create or replace function private.game_v2_item_en(item public.game_session_items, target_couple uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select case
    -- Swipe V1 card.
    when item.source_ref like 'swipe:%' then (
      select jsonb_build_object('question_text', c.question_text_en, 'options', c.options_en)
      from private.game_swipe_v1_catalog c
      where 'swipe:' || c.id = item.source_ref and c.version = item.source_version
        and c.question_text_en is not null
        and jsonb_array_length(c.options_en) = jsonb_array_length(item.options))
    -- Curated Game V2 prompt.
    when item.source_type = 'curated' then (
      select jsonb_build_object(
        'question_text', private.game_v2_render(c.question_text_en, item.subject_role, target_couple),
        'options', private.game_v2_render_options(c.options_en, item.subject_role, target_couple),
        'predict_text', case when item.subject_role is not null
          then private.game_v2_render(c.predict_text_en, item.subject_role, target_couple) end)
      from public.game_v2_catalog c
      where c.id = item.source_ref and c.id = item.recipe_id and c.version = item.recipe_version
        and c.question_text_en is not null
        and jsonb_array_length(c.options_en) = jsonb_array_length(item.options)
        and (item.predict_text is null or c.predict_text_en is not null))
    -- Longitudinal resurfacing of an earlier prompt.
    when item.context->>'kind' = 'longitudinal' then (
      select jsonb_build_object(
        'question_text', private.game_v2_fill(r.question_text_en, jsonb_build_object('previous_question', c.question_text_en)),
        'options', item.options,
        'context', jsonb_build_object('kind_label', private.game_v2_fill(r.kind_label_en, jsonb_build_object('when',
          private.game_v2_when_label_en(((item.context->>'previous_played_at')::timestamptz at time zone 'Europe/Rome')::date,
            ((item.context->>'captured_at')::timestamptz at time zone 'Europe/Rome')::date)))))
      from public.game_v2_recipes r
      join public.game_v2_catalog c on c.id = item.source_ref
      where r.id = item.recipe_id and r.version = item.recipe_version and r.adapter = 'longitudinal'
        and c.question_text = item.question_text
        and r.question_text_en is not null and r.kind_label_en is not null and c.question_text_en is not null
        and item.context ? 'previous_played_at' and item.context ? 'captured_at'
        and jsonb_array_length(item.options) = 0)
    -- Context recipe (calendar, Da vivere, Ricordi, Conservati).
    when item.recipe_id is not null and item.context ? 'kind' then (
      select jsonb_build_object(
        'question_text', private.game_v2_fill(r.question_text_en, src.v),
        'options', r.options_en,
        'context', jsonb_strip_nulls(jsonb_build_object('kind_label', private.game_v2_fill(r.kind_label_en, src.v),
          'when', src.v->>'when')))
      from public.game_v2_recipes r
      cross join lateral (select jsonb_build_object('title', item.context->>'title',
        'when', private.game_v2_label_en(item.context->>'when'),
        'date', private.game_v2_label_en(item.context->>'when')) v) src
      where r.id = item.recipe_id and r.version = item.recipe_version and r.adapter = item.context->>'kind'
        and r.question_text_en is not null and r.kind_label_en is not null
        and jsonb_array_length(r.options_en) = jsonb_array_length(item.options)
        and (item.context->>'when' is null or src.v->>'when' is not null))
  end;
$function$;
revoke all on function private.game_v2_item_en(public.game_session_items, uuid) from public, anon, authenticated, service_role;

-- 4. Rows the app reads directly ----------------------------------------------
-- PostgREST computed fields (select=...,title_localized): the caller's
-- language for a row of the caller's own couple; anything else returns the
-- stored Italian unchanged. The unnamed parameter keeps them off /rpc.
create or replace function public.title_localized(public.bond_weekly_quests)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce((
    select t.title_en
    from public.profiles p
    join public.bond_quest_templates t on t.key = $1.template_key
    where p.id = auth.uid() and p.couple_id = $1.couple_id and p.locale = 'en'), $1.title);
$function$;

create or replace function public.question_text_localized(public.daily_question_keepsakes)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce((
    select t.question_en
    from public.profiles p
    join public.daily_questions q on q.id = $1.question_id
    join public.daily_question_templates t on t.id = q.template_id
    where p.id = auth.uid() and p.couple_id = $1.couple_id and p.locale = 'en'), $1.question_text);
$function$;

alter function public.title_localized(public.bond_weekly_quests) owner to postgres;
alter function public.question_text_localized(public.daily_question_keepsakes) owner to postgres;
revoke all on function public.title_localized(public.bond_weekly_quests) from public, anon, authenticated, service_role;
revoke all on function public.question_text_localized(public.daily_question_keepsakes) from public, anon, authenticated, service_role;
grant execute on function public.title_localized(public.bond_weekly_quests) to authenticated;
grant execute on function public.question_text_localized(public.daily_question_keepsakes) to authenticated;
comment on function public.title_localized(public.bond_weekly_quests) is 'US 1.0 computed field: the quest title in the caller''s language (template title_en for an en caller of the same couple, else the stored title).';
comment on function public.question_text_localized(public.daily_question_keepsakes) is 'US 1.0 computed field: the kept Daily Question in the caller''s language (template question_en for an en caller of the same couple, else the stored text).';

-- 5. Replaced bodies: the audited baseline with only the language (and, for
-- the candidate functions, the merged family) changed. CREATE OR REPLACE
-- keeps owner, grants and comments.

CREATE OR REPLACE FUNCTION public.get_or_create_daily_question()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  today date := private.daily_question_day(now());
  question_row public.daily_questions%rowtype;
  question_theme text;
  english_question text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if not exists (
    select 1 from public.profiles as profile
     where profile.id = auth.uid()
       and profile.couple_id is not null
  ) then
    raise exception using errcode = '42501', message = 'couple membership required';
  end if;

  question_row := private.materialize_daily_question(today);

  select t.theme, t.question_en into question_theme, english_question
    from public.daily_question_templates as t
   where t.id = question_row.template_id;

  return jsonb_build_object(
    'id', question_row.id,
    'question', case when english_question is not null and private.us_caller_locale() = 'en'
      then english_question else question_row.question end,
    'question_date', question_row.question_date,
    'theme', question_theme,
    'day_timezone', 'Europe/Rome'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.daily_question_keepsake_json(k public.daily_question_keepsakes, status text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'status', status,
    'id', k.id,
    'source_key', k.source_key,
    'question_id', k.question_id,
    'question_date', k.question_date,
    'question_text', public.question_text_localized(k),
    'revealed_at', k.revealed_at,
    'kept_by_role', k.kept_by_role,
    'kept_at', k.kept_at
  );
$function$;

CREATE OR REPLACE FUNCTION private.m11a_session_state(target_session_id uuid, current_couple uuid, caller_role text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'id', s.id, 'couple_id', s.couple_id, 'game_family', s.game_family,
    'content_source', s.content_source, 'started_by_role', s.started_by_role,
    'started_at', s.started_at, 'completed_at', s.completed_at,
    'engine_version', s.engine_version, 'subject_heavy_role', s.subject_heavy_role,
    'my_role', caller_role,
    'my_complete', mine.completed_at is not null, 'my_completed_at', mine.completed_at,
    'partner_complete', partner.completed_at is not null, 'partner_completed_at', partner.completed_at,
    'reveal_ready', s.completed_at is not null, 'my_reveal_seen_at', mine.reveal_seen_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'position', i.position, 'question_text', coalesce(en.t->>'question_text', i.question_text),
        'answer_kind', i.answer_kind, 'options', coalesce(en.t->'options', i.options),
        'source_question_id', i.source_question_id, 'source_version', i.source_version,
        'mechanic', i.mechanic, 'family', coalesce(i.family, s.game_family),
        'subject_role', i.subject_role, 'predict_text', coalesce(en.t->>'predict_text', i.predict_text),
        'my_item_role', case when i.mechanic <> 'prediction' then 'mutual'
          when i.subject_role = caller_role then 'subject' else 'predictor' end,
        'my_prompt', case when i.mechanic = 'prediction' and i.subject_role <> caller_role
          then coalesce(en.t->>'predict_text', i.predict_text) else coalesce(en.t->>'question_text', i.question_text) end,
        'source_type', i.source_type, 'depth', i.depth, 'context', i.context || coalesce(en.t->'context', '{}'::jsonb),
        'my_answer_text', a.answer_text, 'my_answer_index', a.answer_index,
        'partner_answer_text', case when s.completed_at is not null then pa.answer_text end,
        'partner_answer_index', case when s.completed_at is not null then pa.answer_index end,
        'prediction_matched', case when s.completed_at is not null and i.mechanic = 'prediction'
          and a.answer_index is not null and pa.answer_index is not null
          then a.answer_index = pa.answer_index end,
        'previous', case when s.completed_at is not null and i.context->>'kind' = 'longitudinal' then (
          select jsonb_build_object('played_at', ps.started_at,
            'my_answer_text', pma.answer_text, 'partner_answer_text', ppa.answer_text)
          from public.game_session_items pi
          join public.game_sessions ps on ps.id = pi.session_id
            and ps.couple_id = s.couple_id and ps.completed_at is not null
          left join public.game_session_answers pma on pma.item_id = pi.id and pma.actor_role = caller_role
          left join public.game_session_answers ppa on ppa.item_id = pi.id and ppa.actor_role <> caller_role
          where pi.id::text = i.context->>'previous_item_id') end
      ) order by i.position) from public.game_session_items i
      left join lateral (select private.game_v2_item_en(i, s.couple_id) as t
        where private.us_profile_locale(current_couple, caller_role) = 'en') en on true
      left join public.game_session_answers a on a.item_id = i.id and a.actor_role = caller_role
      left join public.game_session_answers pa on pa.item_id = i.id and pa.actor_role <> caller_role
      where i.session_id = s.id
    ), '[]'::jsonb)
  )
  from public.game_sessions s
  join public.game_session_sides mine on mine.session_id = s.id and mine.actor_role = caller_role
  join public.game_session_sides partner on partner.session_id = s.id and partner.actor_role <> caller_role
  where s.id = target_session_id and s.couple_id = current_couple;
$function$;

CREATE OR REPLACE FUNCTION private.game_v2_candidates(target_couple uuid, target_family text, at_time timestamp with time zone)
 RETURNS SETOF private.game_v2_candidate
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select ('catalog:' || c.id), private.game_v2_merged_family(c.family), c.mechanic, c.answer_kind, c.question_text, c.predict_text,
    c.options, c.depth, c.topic, 'curated', c.id, c.id, c.version, null::uuid, null::integer,
    '{}'::jsonb, c.cooldown_class, 50 + 3 * (c.depth - 1), null::integer, null::boolean, null::timestamptz
  from public.game_v2_catalog c
  where c.active and c.source_type = 'curated' and (target_family = 'per_voi' or c.family = any (private.game_v2_family_pool(target_family)))
  union all
  -- Couple-authored questions (weekly and M11A library). Unplayed ones are
  -- the most authentic content available and rank first.
  select ('custom:' || q.id::text), fam.family,
    case when fam.family = 'quanto_mi_conosci' then 'prediction' else 'reciprocal' end,
    q.answer_kind, q.question_text,
    case when fam.family = 'quanto_mi_conosci' then q.question_text end,
    q.options, 2::smallint, ('custom_' || replace(q.id::text, '-', '_')), 'couple_custom', q.id::text,
    null::text, null::integer, q.id, q.version,
    jsonb_build_object('author_role', q.author_role, 'origin', q.origin),
    'custom',
    case when played.at is not null then 35 when q.origin = 'weekly' then 95 else 85 end,
    null::integer, null::boolean, null::timestamptz
  from public.couple_questions q
  cross join lateral (select private.game_v2_merged_family(case when target_family = 'per_voi' then q.families[1] else target_family end) as family) fam
  left join lateral (select max(s.started_at) as at from public.game_session_items i
    join public.game_sessions s on s.id = i.session_id where i.source_question_id = q.id) played on true
  where q.couple_id = target_couple and q.archived_at is null
    and (target_family = 'per_voi' or q.families && private.game_v2_family_pool(target_family))
    and (fam.family <> 'quanto_mi_conosci' or q.answer_kind = 'choice')
  union all
  select * from private.game_v2_context_candidates(target_couple, target_family, at_time);
$function$;

CREATE OR REPLACE FUNCTION private.game_v2_recipe_candidates(target_family text, target_adapter text, source_kind text, sources jsonb, at_time timestamp with time zone)
 RETURNS SETOF private.game_v2_candidate
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select ('recipe:' || r.id || ':' || source_kind || ':' || (s->>'id')), private.game_v2_merged_family(r.family), r.mechanic, r.answer_kind,
    private.game_v2_fill(r.question_text, s), null::text, r.options, r.depth, r.topic, source_kind, s->>'id',
    r.id, r.version, null::uuid, null::integer,
    jsonb_build_object('kind', r.adapter, 'kind_label', private.game_v2_fill(r.kind_label, s),
      'source_type', source_kind, 'source_id', s->>'id', 'title', s->>'title', 'when', coalesce(s->>'when', s->>'date'),
      'recipe_id', r.id, 'recipe_version', r.version, 'captured_at', at_time),
    r.cooldown_class, 70 + 2 * (r.depth - 1), null::integer, null::boolean, null::timestamptz
  from jsonb_array_elements(coalesce(sources, '[]'::jsonb)) s
  join public.game_v2_recipes r on r.adapter = target_adapter and r.active
    and (target_family = 'per_voi' or r.family = any (private.game_v2_family_pool(target_family)));
$function$;

CREATE OR REPLACE FUNCTION private.game_v2_ctx_longitudinal(target_couple uuid, target_family text, at_time timestamp with time zone)
 RETURNS SETOF private.game_v2_candidate
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare at_date date := (at_time at time zone 'Europe/Rome')::date;
begin
  return query
  with plays as (
    select i.id item_id, i.source_ref catalog_id, s.started_at, s.completed_at,
      (select count(*) from public.game_session_answers a where a.item_id = i.id and a.answer_text is not null) answered
    from public.game_session_items i join public.game_sessions s on s.id = i.session_id
    where s.couple_id = target_couple and s.engine_version = 2 and i.source_type in ('curated', 'game_history')
  ), last_play as (
    select distinct on (p.catalog_id) p.catalog_id, p.started_at last_started from plays p
    order by p.catalog_id, p.started_at desc
  ), previous as (
    select distinct on (p.catalog_id) p.catalog_id, p.item_id, p.started_at, p.completed_at from plays p
    where p.completed_at is not null and p.answered = 2
    order by p.catalog_id, p.completed_at desc
  )
  select ('longitudinal:' || c.id), private.game_v2_merged_family(c.family), 'reciprocal'::text, 'open'::text,
    private.game_v2_fill(r.question_text, jsonb_build_object('previous_question', c.question_text)),
    null::text, '[]'::jsonb, c.depth, c.topic, 'game_history'::text, c.id, r.id, r.version, null::uuid, null::integer,
    jsonb_build_object('kind', 'longitudinal',
      'kind_label', private.game_v2_fill(r.kind_label, jsonb_build_object('when',
        private.game_v2_when_label((pv.started_at at time zone 'Europe/Rome')::date, at_date))),
      'source_type', 'game_history', 'source_id', c.id, 'previous_item_id', pv.item_id,
      'previous_played_at', pv.started_at, 'recipe_id', r.id, 'recipe_version', r.version, 'captured_at', at_time),
    r.cooldown_class, 72, null::integer, null::boolean, null::timestamptz
  from public.game_v2_catalog c
  join previous pv on pv.catalog_id = c.id
  join last_play lp on lp.catalog_id = c.id
  join public.game_v2_recipes r on r.adapter = 'longitudinal' and r.active
  where c.active and c.longitudinal and c.mechanic = 'reciprocal' and c.answer_kind = 'open'
    and (target_family = 'per_voi' or c.family = any (private.game_v2_family_pool(target_family)))
    and lp.last_started <= at_time - interval '90 days'
  -- One resurfacing at a time: the prompt answered longest ago.
  order by pv.started_at, c.id
  limit 1;
exception when others then
  raise warning 'game_v2 context adapter longitudinal skipped: %', sqlerrm;
  return;
end;
$function$;

-- Postcondition: fails closed (and rolls the whole migration back) unless the
-- language column, every function body and every grant are exactly the
-- reviewed ones, and every active recipe has its English.
do $us_1_0_locale_postcondition$
declare r record; fn record;
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_locale_check' and convalidated
      and pg_catalog.pg_get_constraintdef(oid) = 'CHECK ((locale = ANY (ARRAY[''it''::text, ''en''::text])))') then
    raise exception using errcode = 'P0001', message = 'us 1.0 locale: profiles.locale check drift';
  end if;
  if pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'locale', 'UPDATE')
    or pg_catalog.has_column_privilege('anon', 'public.profiles', 'locale', 'UPDATE') then
    raise exception using errcode = 'P0001', message = 'us 1.0 locale: profiles.locale is client-writable';
  end if;
  for r in select * from (values
    ('public.get_or_create_daily_question()', '55c26c22a2b1ead2ea1089968c1d6b6d', true, 'v'),
    ('private.daily_question_keepsake_json(public.daily_question_keepsakes,text)', '39b135388b2eec27aa2371dede0fe577', false, 's'),
    ('private.m11a_session_state(uuid,uuid,text)', 'ec7745cf8b8fcae778d39ad9e314a6c1', false, 's'),
    ('private.game_v2_candidates(uuid,text,timestamp with time zone)', '585d2aa6cb2dc80de4d613f3c1e1a406', false, 's'),
    ('private.game_v2_recipe_candidates(text,text,text,jsonb,timestamp with time zone)', '93314dd0f3435f74c6010cf228bd1900', false, 's'),
    ('private.game_v2_ctx_longitudinal(uuid,text,timestamp with time zone)', '34032d699424d3d4689f42f66cff04a6', false, 's')
  ) v(sig, target, definer, volatility) loop
    select p.* into fn from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure(r.sig);
    if not found or pg_catalog.md5(pg_catalog.replace(fn.prosrc, E'\r', '')) <> r.target or fn.prosecdef <> r.definer
      or fn.provolatile <> r.volatility::"char" or fn.proconfig is distinct from array['search_path=""']::text[] then
      raise exception using errcode = 'P0001', message = 'us 1.0 locale: ' || r.sig || ' drift';
    end if;
  end loop;
  for r in select * from (values ('public.set_my_locale(text)', true), ('public.title_localized(public.bond_weekly_quests)', true),
      ('public.question_text_localized(public.daily_question_keepsakes)', true), ('private.us_caller_locale()', false),
      ('private.us_profile_locale(uuid,text)', false), ('private.game_v2_month_name_en(date)', false),
      ('private.game_v2_when_label_en(date,date)', false), ('private.game_v2_label_en(text)', false),
      ('private.game_v2_family_pool(text)', false), ('private.game_v2_merged_family(text)', false),
      ('private.game_v2_item_en(public.game_session_items,uuid)', false)) v(sig, client) loop
    select p.* into fn from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure(r.sig);
    if not found or fn.proconfig is distinct from array['search_path=""']::text[]
      or pg_catalog.has_function_privilege('anon', fn.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', fn.oid, 'EXECUTE') <> r.client
      or exists (select 1 from pg_catalog.aclexplode(coalesce(fn.proacl, pg_catalog.acldefault('f', fn.proowner))) a
        where a.grantee <> fn.proowner and (not r.client or a.grantee <> 'authenticated'::regrole or a.privilege_type <> 'EXECUTE')) then
      raise exception using errcode = 'P0001', message = 'us 1.0 locale: ' || r.sig || ' grant drift';
    end if;
  end loop;
  if exists (select 1 from public.game_v2_recipes where active and (question_text_en is null or kind_label_en is null
      or options_en is null)) then
    raise exception using errcode = 'P0001', message = 'us 1.0 locale: an active recipe has no English';
  end if;
end;
$us_1_0_locale_postcondition$;
