-- US content 1.2 (founder, 28/11/2026): more content for the games that
-- exist, and more of it for US Plus. No new game.
--
-- 1. 156 new Game V2 prompts (Quanto mi conosci?, Ridete, Scopritevi,
--    Confrontatevi, Rivivete) and 32 new Questo o quello cards, Italian and
--    English, on eight themes: viaggi, casa, infanzia, cibo, musica_film,
--    futuro, amici_famiglia, tenerezza. The theme opens the topic
--    («cibo_in_pizzeria»): each prompt keeps a topic of its own, as every
--    prompt in the catalog does, so the rotation works as before. The drafts
--    in supabase/game-v2/content-1-2 are the human-reviewable source; this
--    migration carries the SQL generated from them between the content-1-2
--    begin/end markers (node scripts/build-content-1-2-sql.mjs),
--    and tests/content-1-2-catalog.test.js fails when the two drift apart.
-- 2. US Plus: a `plus` column on both catalogs (false for every existing row,
--    never changed here). 72 of the new rows (38%, on every family and
--    theme) are plus: a couple sees them only while private.couple_has_plus
--    says it has Plus (an active or grace entitlement of a current member,
--    person_colors_plus_v1). The one rule sits where the candidates are
--    read: private.game_v2_candidates (Per voi and the five families,
--    through start_game_round), public.start_swipe_round and
--    public.play_us_answer. plus_on_sale is not read: the plus prompts stay
--    for Plus couples also while Plus is not on sale (beta entitlements).
-- 3. play_us_answer no longer picks a prompt whose options carry a
--    who-would token ({francesco}, {beatrice}): Play Us shows the catalog
--    text as it is, so those options would read raw.
-- Only inserts and the three functions; nothing existing changes or is
-- deleted. Re-applying this migration changes nothing.

-- Preflight: the three functions must be the audited bodies, or the bodies
-- this migration writes (a re-apply). Anything else aborts before any change.
do $content_1_2_preflight$
declare r record; body text;
begin
  if pg_catalog.to_regprocedure('private.couple_has_plus(uuid,timestamp with time zone)') is null then
    raise exception using errcode = 'P0001', message = 'content 1.2: run 20261029014653_person_colors_plus_v1 first';
  end if;
  for r in select * from (values
    ('private.game_v2_candidates(uuid,text,timestamp with time zone)', '585d2aa6cb2dc80de4d613f3c1e1a406', 'a6ce0564d58ddd2caa1e5ac74b92ba04'),
    ('public.start_swipe_round(uuid)', 'e408d3e89dc882f78fa684950c965fa7', '3eeee19d8ae10f350c912ac870fb8acb'),
    ('public.play_us_answer(uuid,boolean)', 'f61712a97c6a3a64472c447c22af383d', 'f158d123c77a27eabd11e6a17c2b1b42')
  ) v(sig, audited, target) loop
    select pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', '')) into body
    from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure(r.sig);
    if body is null or body not in (r.audited, r.target) then
      raise exception using errcode = 'P0001', message = 'content 1.2: ' || r.sig || ' is not the audited version',
        detail = coalesce(body, 'missing');
    end if;
  end loop;
end;
$content_1_2_preflight$;

alter table public.game_v2_catalog add column if not exists plus boolean not null default false;
alter table private.game_swipe_v1_catalog add column if not exists plus boolean not null default false;
comment on column public.game_v2_catalog.plus is 'US Plus (content 1.2): the prompt reaches a couple only while private.couple_has_plus is true. Read in private.game_v2_candidates and public.play_us_answer.';
comment on column private.game_swipe_v1_catalog.plus is 'US Plus (content 1.2): the card reaches a couple only while private.couple_has_plus is true. Read in public.start_swipe_round.';
-- The longitudinal recipe re-asks old answers without the Plus rule: a plus
-- prompt never takes part in it.
alter table public.game_v2_catalog drop constraint if exists game_v2_catalog_plus_not_longitudinal;
alter table public.game_v2_catalog add constraint game_v2_catalog_plus_not_longitudinal check (not (plus and longitudinal));

-- Per voi and the five families: unchanged except the Plus rule.

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
    and (not c.plus or (select private.couple_has_plus(target_couple)))
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

-- Questo o quello: the same rule for the Swipe cards.
CREATE OR REPLACE FUNCTION public.start_swipe_round(request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor record;
  sid uuid;
  existing_family text;
  at_time timestamptz := private.game_v2_clock();
  usage jsonb;
  ordinal integer;
  cards jsonb;
  card jsonb;
  pos integer := 0;
begin
  select * into actor from private.m11a_actor_locked();

  if request_id is null then
    raise exception using errcode = '22023', message = 'request id required';
  end if;

  -- Idempotent replay wins even if the weekly allowance is now spent.
  select s.id, s.game_family into sid, existing_family
  from public.game_sessions s
  where s.couple_id = actor.caller_couple
    and s.started_by_role = actor.caller_role
    and s.create_request_id = start_swipe_round.request_id;

  if sid is not null then
    if existing_family is distinct from 'swipe' then
      raise exception using errcode = '22023', message = 'request already used';
    end if;
    return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role)
      || jsonb_build_object('resumed', true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('game_v2_round:' || actor.caller_couple::text || ':swipe', 0)
  );

  -- One canonical open Swipe round for the couple.
  select s.id into sid
  from public.game_sessions s
  where s.couple_id = actor.caller_couple
    and s.engine_version = 2
    and s.game_family = 'swipe'
    and s.completed_at is null;

  if sid is not null then
    return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role)
      || jsonb_build_object('resumed', true);
  end if;

  -- Swipe spends one of the same two weekly free-choice moments as the
  -- existing six modes. Resuming an older open Swipe spends nothing.
  perform pg_advisory_xact_lock(
    hashtextextended('game_v2_budget:' || actor.caller_couple::text, 0)
  );
  usage := private.game_v2_week_usage(actor.caller_couple, at_time);

  if not (usage->>'free_available')::boolean then
    raise exception using errcode = 'P0001', message = 'weekly allowance exhausted',
      detail = 'resets_on=' || (usage->>'resets_on');
  end if;

  if (usage->>'open_count')::integer >= (usage->>'open_limit')::integer then
    raise exception using errcode = 'P0001', message = 'too many open rounds';
  end if;

  select count(*)::integer into ordinal
  from public.game_sessions s
  where s.couple_id = actor.caller_couple and s.engine_version = 2;

  -- Prefer cards this couple has never seen, then the least-recently played.
  -- md5 gives a deterministic shuffle inside each recency bucket.
  select coalesce(jsonb_agg(to_jsonb(picked) - 'last_played' - 'sort_key' order by picked.pick_order), '[]'::jsonb)
  into cards
  from (
    select ranked.*, row_number() over (
      order by ranked.last_played asc nulls first, ranked.sort_key
    ) as pick_order
    from (
      select c.id, c.version, c.question_text, c.options, c.topic,
        (
          select max(s.started_at)
          from public.game_session_items i
          join public.game_sessions s on s.id = i.session_id
          where s.couple_id = actor.caller_couple
            and i.fingerprint = ('swipe:' || c.id || ':v' || c.version::text)
        ) as last_played,
        md5(
          c.id || ':' || actor.caller_couple::text || ':' ||
          private.game_v2_week_start(at_time)::text || ':' || ordinal::text
        ) as sort_key
      from private.game_swipe_v1_catalog c
      where c.active
        and (not c.plus or (select private.couple_has_plus(actor.caller_couple)))
    ) ranked
    order by ranked.last_played asc nulls first, ranked.sort_key
    limit 8
  ) picked;

  if jsonb_array_length(cards) <> 8 then
    raise exception using errcode = 'P0001', message = 'not enough swipe content';
  end if;

  insert into public.game_sessions (
    couple_id, game_family, content_source, started_by_role, create_request_id,
    engine_version, started_at
  )
  values (
    actor.caller_couple, 'swipe', 'curated', actor.caller_role,
    start_swipe_round.request_id, 2, at_time
  )
  returning id into sid;

  for card in select value from jsonb_array_elements(cards) loop
    pos := pos + 1;
    insert into public.game_session_items (
      session_id, position, source_question_id, source_version,
      question_text, answer_kind, options, mechanic, subject_role, predict_text,
      family, source_type, source_ref, recipe_id, recipe_version, topic,
      perspective, depth, fingerprint, context
    )
    values (
      sid, pos, null, (card->>'version')::integer,
      card->>'question_text', 'choice', card->'options', 'reciprocal', null, null,
      null, 'curated', 'swipe:' || (card->>'id'), null, null, card->>'topic',
      'mutual', 1, 'swipe:' || (card->>'id') || ':v' || (card->>'version'),
      jsonb_build_object('swipe_v1', true)
    );
  end loop;

  insert into public.game_session_sides(session_id, actor_role)
  values (sid, 'francesco'), (sid, 'beatrice');

  return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role)
    || jsonb_build_object('resumed', false);
end;
$function$;

-- Play Us: the same rule, and a who-would option ({francesco}, {beatrice}) is
-- never sent raw: Play Us shows the catalog text as it is.
create or replace function public.play_us_answer(p_session uuid, p_accept boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid := private.current_couple_id();
  s public.play_us_sessions%rowtype;
  quick jsonb;
  know jsonb;
begin
  if uid is null or cid is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  perform private.play_us_tidy(cid);
  select * into s from public.play_us_sessions where id = p_session and couple_id = cid for update;
  if s.id is null then raise exception using errcode = '42501', message = 'not your game'; end if;
  if s.invited_by = uid then raise exception using errcode = '22023', message = 'own invite'; end if;
  if s.status <> 'invited' then raise exception using errcode = '22023', message = 'invite closed'; end if;
  if not coalesce(p_accept, false) then
    update public.play_us_sessions set status = 'declined', updated_at = pg_catalog.now() where id = s.id;
    return private.play_us_state(s.id);
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', c.id, 'q', c.question_text, 'o', c.options)) into quick
    from (select c.* from public.game_v2_catalog c
           where c.active and c.mechanic = 'reciprocal' and c.answer_kind = 'choice'
             and (not c.plus or (select private.couple_has_plus(cid)))
             and pg_catalog.strpos(c.options::text, '{') = 0
             and pg_catalog.jsonb_array_length(c.options) between 2 and 4
             and pg_catalog.char_length(c.question_text) <= 70 and pg_catalog.strpos(c.question_text, '{') = 0
             and not exists (select 1 from public.play_us_sessions o, pg_catalog.jsonb_array_elements(o.items) e
                              where o.couple_id = cid and o.created_at > pg_catalog.now() - interval '14 days' and e->>'id' = c.id)
           order by pg_catalog.random() limit 3) c;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', c.id, 'q', c.question_text, 'o', c.options)) into know
    from (select c.* from public.game_v2_catalog c
           where c.active and c.mechanic = 'prediction' and c.answer_kind = 'choice'
             and (not c.plus or (select private.couple_has_plus(cid)))
             and pg_catalog.strpos(c.options::text, '{') = 0
             and pg_catalog.jsonb_array_length(c.options) between 2 and 4
             and pg_catalog.char_length(c.question_text) <= 80 and pg_catalog.strpos(c.question_text, '{') = 0
             and not exists (select 1 from public.play_us_sessions o, pg_catalog.jsonb_array_elements(o.items) e
                              where o.couple_id = cid and o.created_at > pg_catalog.now() - interval '14 days' and e->>'id' = c.id)
           order by pg_catalog.random() limit 2) c;
  if coalesce(pg_catalog.jsonb_array_length(quick), 0) < 3 or coalesce(pg_catalog.jsonb_array_length(know), 0) < 2 then
    raise exception using errcode = '22023', message = 'not enough content';
  end if;
  update public.play_us_sessions
     set status = 'playing', step = 1, step_started_at = pg_catalog.now() + interval '4 seconds',
         items = quick || know, updated_at = pg_catalog.now()
   where id = s.id;
  return private.play_us_state(s.id);
end;
$$;
revoke all on function public.play_us_answer(uuid, boolean) from public, anon;
grant execute on function public.play_us_answer(uuid, boolean) to authenticated;

-- content-1-2:begin (generated by scripts/build-content-1-2-sql.mjs from supabase/game-v2/content-1-2; do not edit by hand)

-- Game V2 catalog: 156 new prompts (60 plus), Italian and English.
insert into public.game_v2_catalog (id, version, family, source_type, mechanic, answer_kind, question_text, predict_text, options, depth, topic, cooldown_class, longitudinal, plus, question_text_en, predict_text_en, options_en) values
  ('quanto_mi_conosci-077', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'In valigia, cosa non dimentichi mai?', 'In valigia, cosa non dimentica mai {subject}?', '["Il caricabatterie","Uno snack per il viaggio","Un libro che non leggerò","Troppi vestiti, per sicurezza"]'::jsonb, 1, 'viaggi_valigia', 'light', false, false, 'What do you never forget to pack?', 'What does {subject} never forget to pack?', '["The phone charger","A snack for the journey","A book I won’t read","Too many clothes, just in case"]'::jsonb),
  ('quanto_mi_conosci-078', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Primo giorno in una città nuova: cosa fai appena arrivi?', 'Primo giorno in una città nuova: cosa fa {subject} appena arriva?', '["Cammino senza meta","Cerco subito dove mangiare","Salgo nel punto più alto","Mi riposo in albergo"]'::jsonb, 1, 'viaggi_citta_nuova', 'light', false, false, 'First day in a new city: what do you do as soon as you arrive?', 'First day in a new city: what does {subject} do as soon as they arrive?', '["Wander with no plan","Look for somewhere to eat","Head for the highest point","Rest at the hotel"]'::jsonb),
  ('quanto_mi_conosci-079', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'In treno o in aereo, che posto vuoi?', 'In treno o in aereo, che posto vuole {subject}?', '["Finestrino, sempre","Corridoio, per alzarmi","Quello vicino a te","Uno qualsiasi, tanto dormo"]'::jsonb, 1, 'viaggi_posto_a_sedere', 'light', false, true, 'On a train or a plane, which seat do you want?', 'On a train or a plane, which seat does {subject} want?', '["Window, always","Aisle, so I can get up","The one next to you","Any, I’ll sleep anyway"]'::jsonb),
  ('quanto_mi_conosci-080', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Da un viaggio, cosa ti porti a casa?', 'Da un viaggio, cosa si porta a casa {subject}?', '["Una calamita o una cartolina","Un sapore da rifare","Centinaia di foto","Niente, solo il ricordo"]'::jsonb, 2, 'viaggi_ricordo_di_viaggio', 'standard', false, false, 'What do you bring home from a trip?', 'What does {subject} bring home from a trip?', '["A magnet or a postcard","A flavour to recreate","Hundreds of photos","Nothing, just the memory"]'::jsonb),
  ('quanto_mi_conosci-081', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Mattina senza sveglia: come la cominci?', 'Mattina senza sveglia: come la comincia {subject}?', '["Resto a letto col telefono","Colazione lunga","Esco subito a camminare","Riordino qualcosa"]'::jsonb, 1, 'casa_mattina_senza_sveglia', 'light', false, true, 'A morning with no alarm: how do you start it?', 'A morning with no alarm: how does {subject} start it?', '["Stay in bed with my phone","A long breakfast","Go out for a walk straight away","Tidy something up"]'::jsonb),
  ('quanto_mi_conosci-082', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quale faccenda di casa rimandi sempre?', 'Quale faccenda di casa rimanda sempre {subject}?', '["Stirare","Piegare il bucato","Lavare i piatti","Buttare la spazzatura"]'::jsonb, 1, 'casa_faccenda_rimandata', 'light', false, false, 'Which household chore do you always put off?', 'Which household chore does {subject} always put off?', '["Ironing","Folding the laundry","Washing the dishes","Taking out the bins"]'::jsonb),
  ('quanto_mi_conosci-083', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'In casa, dov’è il tuo angolo preferito?', 'In casa, dov’è l’angolo preferito di {subject}?', '["Il divano","Il letto","La cucina","Vicino alla finestra"]'::jsonb, 2, 'casa_angolo_preferito', 'standard', false, false, 'Where’s your favourite spot at home?', 'Where’s {subject}’s favourite spot at home?', '["The couch","The bed","The kitchen","By the window"]'::jsonb),
  ('quanto_mi_conosci-084', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'La sera, che luce vuoi in casa?', 'La sera, che luce vuole {subject} in casa?', '["Tutte le luci accese","Una lampada sola","Candele","Basta la luce della TV"]'::jsonb, 1, 'casa_luce_della_sera', 'light', false, true, 'In the evening, what light do you want at home?', 'In the evening, what light does {subject} want at home?', '["Every light on","Just one lamp","Candles","The TV glow is enough"]'::jsonb),
  ('quanto_mi_conosci-085', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Nella tua infanzia, qual era la merenda del cuore?', 'Nell’infanzia di {subject}, qual era la merenda del cuore?', '["Pane, burro e zucchero","Le merendine confezionate","Pane e cioccolato","La frutta della nonna"]'::jsonb, 1, 'infanzia_merenda_del_cuore', 'light', false, false, 'Growing up, what was your favourite snack?', 'Growing up, what was {subject}’s favourite snack?', '["Bread, butter and sugar","Packaged snack cakes","Bread and chocolate","Grandma’s fruit"]'::jsonb),
  ('quanto_mi_conosci-086', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Alle elementari, a cosa giocavi più spesso?', 'Alle elementari, a cosa giocava più spesso {subject}?', '["Giochi in cortile","Videogiochi","Costruzioni e disegni","Giochi di finzione"]'::jsonb, 1, 'infanzia_gioco_delle_elementari', 'light', false, true, 'At primary school, what did you play most?', 'At primary school, what did {subject} play most?', '["Games outside","Video games","Building and drawing","Make-believe"]'::jsonb),
  ('quanto_mi_conosci-087', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Che mestiere sognavi a otto anni?', 'Che mestiere sognava {subject} a otto anni?', '["Curare gli animali","Andare nello spazio","Stare su un palco","Insegnare"]'::jsonb, 2, 'infanzia_mestiere_sognato', 'standard', false, false, 'What job did you dream of at eight?', 'What job did {subject} dream of at eight?', '["Looking after animals","Going to space","Being on a stage","Teaching"]'::jsonb),
  ('quanto_mi_conosci-088', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Nella tua infanzia, dove passavi le estati?', 'Nell’infanzia di {subject}, dove passava le estati?', '["Al mare","Dai nonni","In città","In campagna o in montagna"]'::jsonb, 2, 'infanzia_estati_dell_infanzia', 'standard', false, false, 'As a child, where did you spend your summers?', 'As a child, where did {subject} spend the summers?', '["At the seaside","At my grandparents’","In the city","In the countryside or the mountains"]'::jsonb),
  ('quanto_mi_conosci-089', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Il pezzo più buono nel piatto: lo mangi subito o alla fine?', 'Il pezzo più buono nel piatto: {subject} lo mangia subito o alla fine?', '["Subito","Alla fine","Lo offro a te"]'::jsonb, 1, 'cibo_boccone_migliore', 'light', false, true, 'The best bite on the plate: do you eat it first or last?', 'The best bite on the plate: does {subject} eat it first or last?', '["First","Last","I offer it to you"]'::jsonb),
  ('quanto_mi_conosci-090', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Fame a mezzanotte: cosa cerchi in cucina?', 'Fame a mezzanotte: cosa cerca {subject} in cucina?', '["Qualcosa di dolce","Pane e formaggio","Gli avanzi in frigo","Un bicchiere di latte"]'::jsonb, 1, 'cibo_fame_a_mezzanotte', 'light', false, false, 'Hungry at midnight: what do you look for in the kitchen?', 'Hungry at midnight: what does {subject} look for in the kitchen?', '["Something sweet","Bread and cheese","Leftovers in the fridge","A glass of milk"]'::jsonb),
  ('quanto_mi_conosci-091', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'In pizzeria, cosa ordini?', 'In pizzeria, cosa ordina {subject}?', '["Margherita, la prova del nove","La più ricca del menù","Una diversa ogni volta","Quella che prendi tu"]'::jsonb, 1, 'cibo_in_pizzeria', 'light', false, true, 'At a pizzeria, what do you order?', 'At a pizzeria, what does {subject} order?', '["Margherita, the real test","The most loaded one","A different one every time","Whatever you get"]'::jsonb),
  ('quanto_mi_conosci-092', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Arrivano ospiti a cena: cosa prepari?', 'Arrivano ospiti a cena: cosa prepara {subject}?', '["Il mio piatto forte","Una ricetta nuova, rischiando","Ordino qualcosa di buono","Un aperitivo lungo"]'::jsonb, 2, 'cibo_ospiti_a_cena', 'standard', false, false, 'Guests are coming for dinner: what do you make?', 'Guests are coming for dinner: what does {subject} make?', '["My signature dish","A new recipe, risky as it is","Order something good","A long aperitivo"]'::jsonb),
  ('quanto_mi_conosci-093', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Sotto la doccia, cosa canti?', 'Sotto la doccia, cosa canta {subject}?', '["Canzoni di quando avevo quindici anni","Sigle dei cartoni","Quello che passa in radio","Niente: la doccia è silenzio"]'::jsonb, 1, 'musica_film_canto_sotto_la_doccia', 'light', false, false, 'What do you sing in the shower?', 'What does {subject} sing in the shower?', '["Songs from when I was fifteen","Cartoon theme songs","Whatever’s on the radio","Nothing: showers are quiet"]'::jsonb),
  ('quanto_mi_conosci-094', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Serata film: che genere scegli?', 'Serata film: che genere sceglie {subject}?', '["Commedia","Thriller","Animazione","Un film che fa piangere"]'::jsonb, 1, 'musica_film_genere_della_serata', 'light', false, true, 'Movie night: which genre do you pick?', 'Movie night: which genre does {subject} pick?', '["Comedy","Thriller","Animation","A film that makes me cry"]'::jsonb),
  ('quanto_mi_conosci-095', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Un film finisce senza un vero finale. Come la prendi?', 'Un film finisce senza un vero finale. Come la prende {subject}?', '["Adoro: ci penso per giorni","Mi irrita: voglio sapere","Il finale lo invento io","Cerco subito le teorie online"]'::jsonb, 2, 'musica_film_finale_aperto', 'standard', false, false, 'A film ends without a real ending. How do you take it?', 'A film ends without a real ending. How does {subject} take it?', '["Love it: I think about it for days","It annoys me: I want to know","I make up my own ending","I look up the theories right away"]'::jsonb),
  ('quanto_mi_conosci-096', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'In macchina per ore: cosa vuoi ascoltare?', 'In macchina per ore: cosa vuole ascoltare {subject}?', '["La mia playlist","Un podcast","La radio","Niente musica, solo chiacchiere"]'::jsonb, 1, 'musica_film_ore_in_macchina', 'light', false, true, 'Hours in the car: what do you want to listen to?', 'Hours in the car: what does {subject} want to listen to?', '["My playlist","A podcast","The radio","No music, just chatting"]'::jsonb),
  ('quanto_mi_conosci-097', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Cosa non può mancare nella tua casa dei sogni?', 'Cosa non può mancare nella casa dei sogni di {subject}?', '["Un giardino","Una cucina enorme","Tanta luce","Una vista che toglie il fiato"]'::jsonb, 2, 'futuro_casa_dei_sogni', 'standard', false, false, 'What can’t your dream home be without?', 'What can’t {subject}’s dream home be without?', '["A garden","A huge kitchen","Lots of light","A breathtaking view"]'::jsonb),
  ('quanto_mi_conosci-098', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Tra quarant’anni, come ti immagini la domenica?', 'Tra quarant’anni, come si immagina la domenica {subject}?', '["In giardino tra le piante","In viaggio, finalmente","Con la casa piena di gente","A leggere, senza fretta"]'::jsonb, 2, 'futuro_domenica_tra_quarant_anni', 'standard', false, false, 'Forty years from now, how do you picture your Sundays?', 'Forty years from now, how does {subject} picture Sundays?', '["In the garden among the plants","Travelling, at last","With a house full of people","Reading, in no hurry"]'::jsonb),
  ('quanto_mi_conosci-099', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Ti arriva una piccola somma inattesa. Cosa ne fai?', 'A {subject} arriva una piccola somma inattesa. Cosa ne fa?', '["La metto da parte","Un viaggio","Un regalo per te","Uno sfizio per me"]'::jsonb, 2, 'futuro_somma_inattesa', 'standard', false, true, 'You get a small, unexpected sum of money. What do you do with it?', '{subject} gets a small, unexpected sum of money. What do they do with it?', '["Put it aside","A trip","A present for you","A treat for myself"]'::jsonb),
  ('quanto_mi_conosci-100', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quale progetto ti piacerebbe realizzare con me prima o poi?', 'Quale progetto piacerebbe a {subject} realizzare con te prima o poi?', '["Un viaggio lungo","Una casa tutta nostra","Imparare qualcosa insieme","Un’attività nostra"]'::jsonb, 3, 'futuro_progetto_prima_o_poi', 'deep', false, false, 'Which project would you love to take on with me someday?', 'Which project would {subject} love to take on with you someday?', '["A long trip","A home of our own","Learning something together","A little business of our own"]'::jsonb),
  ('quanto_mi_conosci-101', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Nel tuo gruppo di amici, che ruolo hai?', 'Nel gruppo di amici di {subject}, che ruolo ha?', '["Organizzo tutto","Faccio ridere","Ascolto i drammi","Arrivo in ritardo"]'::jsonb, 1, 'amici_famiglia_ruolo_nel_gruppo', 'light', false, true, 'What’s your role in your group of friends?', 'What’s {subject}’s role in their group of friends?', '["I organise everything","I make everyone laugh","I listen to the drama","I turn up late"]'::jsonb),
  ('quanto_mi_conosci-102', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Al pranzo di famiglia, dove ti trovo?', 'Al pranzo di famiglia, dove trovi {subject}?', '["In cucina ad aiutare","A tavola fino alla fine","Coi più piccoli","In un angolo col telefono"]'::jsonb, 1, 'amici_famiglia_pranzo_di_famiglia', 'light', false, false, 'At a family lunch, where will I find you?', 'At a family lunch, where will you find {subject}?', '["In the kitchen helping","At the table till the end","With the little ones","In a corner on my phone"]'::jsonb),
  ('quanto_mi_conosci-103', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Ti arriva un «Devo dirti una cosa». Cosa pensi subito?', 'A {subject} arriva un «Devo dirti una cosa». Cosa pensa subito?', '["Ho fatto qualcosa di male","Pettegolezzo in arrivo","Buone notizie, di sicuro","Chiamo e chiedo subito"]'::jsonb, 2, 'amici_famiglia_devo_dirti_una_cosa', 'standard', false, false, 'You get an “I need to tell you something”. What’s your first thought?', '{subject} gets an “I need to tell you something”. What’s their first thought?', '["I did something wrong","Gossip incoming","Good news, surely","I call and ask right away"]'::jsonb),
  ('quanto_mi_conosci-104', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Quale tradizione di famiglia vorresti portare avanti?', 'Quale tradizione di famiglia vorrebbe portare avanti {subject}?', '["Un piatto delle feste","I pranzi della domenica","I giochi delle feste","Le storie dei nonni"]'::jsonb, 2, 'amici_famiglia_tradizione_di_famiglia', 'standard', false, true, 'Which family tradition would you like to keep going?', 'Which family tradition would {subject} like to keep going?', '["A holiday dish","Sunday lunches","Holiday games","Grandparents’ stories"]'::jsonb),
  ('quanto_mi_conosci-105', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Qual è la tua coccola preferita?', 'Qual è la coccola preferita di {subject}?', '["Carezze sui capelli","Un abbraccio lungo","Grattini sulla schiena","Accoccolarmi sul divano"]'::jsonb, 1, 'tenerezza_coccola_preferita', 'light', false, false, 'What’s your favourite kind of cuddle?', 'What’s {subject}’s favourite kind of cuddle?', '["Hair stroking","A long hug","Back scratches","Curling up on the couch"]'::jsonb),
  ('quanto_mi_conosci-106', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Qualche giorno senza vederci: cosa ti fa pesare meno la distanza?', 'Qualche giorno senza vedervi: cosa fa pesare meno la distanza a {subject}?', '["Una videochiamata","Un vocale lungo","Una foto a sorpresa","Contare i giorni"]'::jsonb, 2, 'tenerezza_qualche_giorno_senza_vederci', 'standard', false, true, 'A few days without seeing each other: what makes the distance easier?', 'A few days without seeing each other: what makes the distance easier for {subject}?', '["A video call","A long voice note","A surprise photo","Counting the days"]'::jsonb),
  ('quanto_mi_conosci-107', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Come ti piace darmi la buonanotte?', 'Come piace a {subject} darti la buonanotte?', '["Un bacio e via","Un messaggio","Due chiacchiere al buio","Un «ti amo» sottovoce"]'::jsonb, 1, 'tenerezza_buonanotte', 'light', false, false, 'How do you like to say goodnight to me?', 'How does {subject} like to say goodnight to you?', '["A kiss and that’s it","A text","A little chat in the dark","A whispered “I love you”"]'::jsonb),
  ('quanto_mi_conosci-108', 1, 'quanto_mi_conosci', 'curated', 'prediction', 'choice', 'Che complimento ti scioglie di più?', 'Che complimento scioglie di più {subject}?', '["Uno sul mio aspetto","Uno su come penso","Uno su come tratto le persone","Uno su quello che creo"]'::jsonb, 3, 'tenerezza_complimento_che_scioglie', 'deep', false, false, 'Which kind of compliment melts you most?', 'Which kind of compliment melts {subject} most?', '["About my looks","About how I think","About how I treat people","About what I create"]'::jsonb),
  ('ridete-061', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Apriamo la valigia in vacanza: cosa abbiamo dimenticato di sicuro?', null, '["Lo spazzolino","Il costume","Il caricabatterie","Il buonsenso"]'::jsonb, 1, 'viaggi_valigia_dimenticata', 'light', false, false, 'We open the suitcase on holiday: what have we definitely forgotten?', null, '["The toothbrush","Swimwear","The charger","Common sense"]'::jsonb),
  ('ridete-062', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Facciamo da guide turistiche nella nostra città. Qual è la tappa più assurda del giro?', null, '[]'::jsonb, 1, 'viaggi_guide_turistiche', 'light', false, false, 'We’re tour guides in our own town. What’s the most absurd stop on the tour?', null, '[]'::jsonb),
  ('ridete-063', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Al ritorno da un viaggio portiamo il souvenir più inutile del mondo. Cos’è?', null, '[]'::jsonb, 1, 'viaggi_souvenir_inutile', 'light', false, true, 'We come home from a trip with the most useless souvenir in the world. What is it?', null, '[]'::jsonb),
  ('ridete-064', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Se fossimo un mezzo di trasporto, quale saremmo?', null, '["Un treno regionale in ritardo","Un tandem","Una mongolfiera","Un monopattino a tutta velocità"]'::jsonb, 1, 'viaggi_se_fossimo_un_mezzo', 'light', false, false, 'If we were a means of transport, what would we be?', null, '["A late regional train","A tandem bike","A hot-air balloon","A scooter at full speed"]'::jsonb),
  ('ridete-065', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Un folletto ci nasconde sempre le stesse cose. Cosa ha preso questa volta?', null, '[]'::jsonb, 1, 'casa_folletto_delle_cose', 'light', false, true, 'A little gremlin keeps hiding the same things from us. What has it taken this time?', null, '[]'::jsonb),
  ('ridete-066', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Ci filmano per un documentario sulla natura: «la coppia nel suo habitat». Cosa dice la voce narrante?', null, '[]'::jsonb, 1, 'casa_documentario', 'light', false, false, 'We’re filmed for a nature documentary: “the couple in its natural habitat”. What does the narrator say?', null, '[]'::jsonb),
  ('ridete-067', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Se un oggetto di casa potesse parlare, quale racconterebbe più segreti su di noi?', null, '["Il frigo","Il divano","Lo specchio","Il telefono"]'::jsonb, 1, 'casa_oggetto_che_parla', 'light', false, false, 'If a household object could talk, which one would spill the most secrets about us?', null, '["The fridge","The couch","The mirror","The phone"]'::jsonb),
  ('ridete-068', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Se fossimo un mobile, quale saremmo?', null, '["Un divano che abbraccia","Una libreria in disordine","Un tavolo sempre apparecchiato","Un comodino pieno di segreti"]'::jsonb, 1, 'casa_se_fossimo_un_mobile', 'light', false, true, 'If we were a piece of furniture, what would we be?', null, '["A couch that hugs you","A messy bookcase","A table that’s always set","A bedside table full of secrets"]'::jsonb),
  ('ridete-069', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Immagina di avermi in classe alle elementari. Quale guaio avremmo combinato insieme?', null, '[]'::jsonb, 1, 'infanzia_guaio_alle_elementari', 'light', false, false, 'Imagine having me in your class at primary school. What trouble would we have got into together?', null, '[]'::jsonb),
  ('ridete-070', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Se la nostra storia fosse un cartone animato, che tipo di cartone sarebbe?', null, '["Avventura con un animale parlante","Poteri magici e tanta confusione","Una sitcom di famiglia","Una fiaba con un colpo di scena"]'::jsonb, 1, 'infanzia_cartone_animato', 'light', false, true, 'If our story were a cartoon, what kind would it be?', null, '["An adventure with a talking animal","Magic powers and lots of chaos","A family sitcom","A fairy tale with a twist"]'::jsonb),
  ('ridete-071', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Ricreazione alle elementari: cosa ti offrirei in cambio della tua merenda?', null, '[]'::jsonb, 1, 'infanzia_baratto_della_merenda', 'light', false, false, 'Break time at primary school: what would I offer you in exchange for your snack?', null, '[]'::jsonb),
  ('ridete-072', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Quale scusa dell’infanzia funziona ancora, secondo te?', null, '["«È stato il gatto»","«Mi fa male la pancia»","«Lo stavo per fare»","«Cinque minuti ancora»"]'::jsonb, 1, 'infanzia_scusa_dell_infanzia', 'light', false, false, 'Which childhood excuse do you think still works?', null, '["“The cat did it”","“My tummy hurts”","“I was just about to”","“Five more minutes”"]'::jsonb),
  ('ridete-073', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Apriamo un locale con un solo piatto nel menù. Qual è, e come si chiama il posto?', null, '[]'::jsonb, 1, 'cibo_un_solo_piatto', 'light', false, true, 'We open a place with just one dish on the menu. What is it, and what’s the place called?', null, '[]'::jsonb),
  ('ridete-074', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Resta l’ultima fetta di torta. Come si decide?', null, '["La dividiamo al millimetro","Morra cinese","Vince la mano più veloce","Te la lascio, con un sospiro"]'::jsonb, 1, 'cibo_ultima_fetta', 'light', false, false, 'There’s one slice of cake left. How do we decide?', null, '["Split it to the millimetre","Rock, paper, scissors","Fastest hand wins","I leave it to you, sighing"]'::jsonb),
  ('ridete-075', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Se fossimo un piatto, quale saremmo?', null, '["Pasta al pomodoro: semplice e perfetta","Un piccante che non ti aspetti","Un dolce con troppa panna","Un minestrone: c’è di tutto"]'::jsonb, 1, 'cibo_se_fossimo_un_piatto', 'light', false, true, 'If we were a dish, what would we be?', null, '["Tomato pasta: simple and perfect","A spicy one you didn’t see coming","A dessert with too much cream","A minestrone: a bit of everything"]'::jsonb),
  ('ridete-076', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Ci invitano a un programma di cucina. Quale disastro finisce in tutti i video?', null, '[]'::jsonb, 1, 'cibo_programma_di_cucina', 'light', false, false, 'We’re invited onto a cooking show. Which disaster ends up in every clip?', null, '[]'::jsonb),
  ('ridete-077', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Fanno un film sulla nostra storia. Qual è il titolo, e chi ci interpreta?', null, '[]'::jsonb, 1, 'musica_film_film_su_di_noi', 'light', false, false, 'They make a film about our story. What’s the title, and who plays us?', null, '[]'::jsonb),
  ('ridete-078', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Karaoke: quale canzone cantiamo insieme?', null, '["Un duetto romantico","Un tormentone estivo","Una sigla dei cartoni","Una ballata urlata"]'::jsonb, 1, 'musica_film_karaoke', 'light', false, true, 'Karaoke: which song do we sing together?', null, '["A romantic duet","A summer hit","A cartoon theme song","A power ballad, shouted"]'::jsonb),
  ('ridete-079', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Se fossimo un genere di film, quale saremmo?', null, '["Commedia romantica","Film d’azione","Giallo pieno di indizi","Musical: si canta tutto"]'::jsonb, 1, 'musica_film_se_fossimo_un_genere', 'light', false, false, 'If we were a film genre, what would we be?', null, '["Romantic comedy","Action film","A mystery full of clues","A musical: we sing everything"]'::jsonb),
  ('ridete-080', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Siamo un duo musicale in tour. Qual è la richiesta più strana nel nostro camerino?', null, '[]'::jsonb, 1, 'musica_film_duo_in_tour', 'light', false, true, 'We’re a music duo on tour. What’s the strangest request in our dressing room?', null, '[]'::jsonb),
  ('ridete-081', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Tra cinquant’anni, quale nostra abitudine farà impazzire i vicini di casa?', null, '[]'::jsonb, 1, 'futuro_abitudine_tra_cinquant_anni', 'light', false, false, 'Fifty years from now, which of our habits will drive the neighbours mad?', null, '[]'::jsonb),
  ('ridete-082', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Ci regalano un robot domestico. Cosa gli facciamo fare?', null, '["Il caffè ogni mattina","Le faccende noiose","Ridere alle mie battute","Ricordarci gli anniversari"]'::jsonb, 1, 'futuro_robot_domestico', 'light', false, false, 'Someone gives us a household robot. What do we make it do?', null, '["Coffee every morning","The boring chores","Laugh at my jokes","Remind us of anniversaries"]'::jsonb),
  ('ridete-083', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Seppelliamo una capsula del tempo. Quale oggetto ridicolo ci mettiamo dentro?', null, '[]'::jsonb, 1, 'futuro_capsula_del_tempo', 'light', false, true, 'We bury a time capsule. Which ridiculous object do we put inside?', null, '[]'::jsonb),
  ('ridete-084', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Se fossimo una coppia di animali, quale saremmo?', null, '["Due pinguini","Due lontre che si tengono per mano","Due gatti al sole","Due pappagalli chiacchieroni"]'::jsonb, 1, 'futuro_se_fossimo_animali', 'light', false, false, 'If we were a pair of animals, which would we be?', null, '["Two penguins","Two otters holding hands","Two cats in the sun","Two chatty parrots"]'::jsonb),
  ('ridete-085', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Chi di noi due racconta a cena le storie più imbarazzanti?', null, '["{francesco}","{beatrice}","Noi due, a turno"]'::jsonb, 1, 'amici_famiglia_storie_imbarazzanti', 'light', false, true, 'Which of us tells the most embarrassing stories at dinner?', null, '["{francesco}","{beatrice}","Both of us, taking turns"]'::jsonb),
  ('ridete-086', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Chi di noi due conquista più in fretta le famiglie?', null, '["{francesco}","{beatrice}","Noi due, alla pari"]'::jsonb, 1, 'amici_famiglia_conquistare_le_famiglie', 'light', false, false, 'Which of us wins over families faster?', null, '["{francesco}","{beatrice}","Both of us, a tie"]'::jsonb),
  ('ridete-087', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Abbiamo una chat di gruppo con gli amici. Che nome ha, e chi scrive i messaggi più lunghi?', null, '[]'::jsonb, 1, 'amici_famiglia_chat_di_gruppo', 'light', false, false, 'We have a group chat with our friends. What’s it called, and who sends the longest messages?', null, '[]'::jsonb),
  ('ridete-088', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Le nostre famiglie si sfidano in un torneo. In quale disciplina, e chi vince?', null, '[]'::jsonb, 1, 'amici_famiglia_torneo_delle_famiglie', 'light', false, true, 'Our families face off in a tournament. In which sport, and who wins?', null, '[]'::jsonb),
  ('ridete-089', 1, 'ridete', 'curated', 'reciprocal', 'open', 'Dammi un nomignolo nuovo, il più assurdo possibile. Quale scegli?', null, '[]'::jsonb, 1, 'tenerezza_nomignolo_assurdo', 'light', false, false, 'Give me a brand-new nickname, as absurd as possible. Which do you choose?', null, '[]'::jsonb),
  ('ridete-090', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Se l’abbraccio fosse uno sport olimpico, quale mi daresti?', null, '["Quello da orso","Quello con la rincorsa","Quello che non finisce più","Quello a sorpresa da dietro"]'::jsonb, 1, 'tenerezza_abbraccio_olimpico', 'light', false, true, 'If hugging were an Olympic sport, which hug would you give me?', null, '["The bear hug","The running jump","The never-ending one","The surprise from behind"]'::jsonb),
  ('ridete-091', 1, 'ridete', 'curated', 'reciprocal', 'choice', 'Per mandarci messaggi, niente telefono: come facciamo?', null, '["Piccione viaggiatore","Segnali di fumo","Lettere profumate","Barattoli col filo"]'::jsonb, 1, 'tenerezza_messaggi_senza_telefono', 'light', false, false, 'No phones for sending each other messages: how do we do it?', null, '["Carrier pigeon","Smoke signals","Scented letters","Tin-can phone"]'::jsonb),
  ('scopritevi-059', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale posto visto una volta sola ti torna ancora in mente?', null, '[]'::jsonb, 2, 'viaggi_posto_visto_una_volta', 'standard', false, false, 'Which place you saw only once still comes back to you?', null, '[]'::jsonb),
  ('scopritevi-060', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Quale viaggio non hai ancora fatto e ti incuriosisce di più?', null, '["Un viaggio in treno lunghissimo","Un’isola sperduta","Una grande città lontana","Un cammino a piedi"]'::jsonb, 1, 'viaggi_viaggio_mai_fatto', 'light', false, false, 'Which kind of trip haven’t you done yet that intrigues you most?', null, '["A very long train journey","A remote island","A big faraway city","A long walk on foot"]'::jsonb),
  ('scopritevi-061', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale parola di un’altra lingua ti piace così tanto da volerla usare sempre?', null, '[]'::jsonb, 1, 'viaggi_parola_straniera', 'light', false, true, 'Which word from another language do you love so much you’d use it all the time?', null, '[]'::jsonb),
  ('scopritevi-062', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'In vacanza, che ritmo ti fa stare bene?', null, '["Tante cose al giorno","Una cosa al giorno, con calma","Nessun programma","Dipende da dove siamo"]'::jsonb, 1, 'viaggi_ritmo_in_vacanza', 'light', false, false, 'On holiday, what pace feels right to you?', null, '["Lots of things a day","One thing a day, slowly","No plan at all","Depends on where we are"]'::jsonb),
  ('scopritevi-063', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale profumo ti fa sentire a casa appena lo senti?', null, '[]'::jsonb, 1, 'casa_profumo_di_casa', 'light', false, true, 'Which smell makes you feel at home the moment you notice it?', null, '[]'::jsonb),
  ('scopritevi-064', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale piccolo rito della sera ti aiuta a staccare?', null, '[]'::jsonb, 2, 'casa_rito_della_sera', 'standard', false, false, 'Which small evening ritual helps you switch off?', null, '[]'::jsonb),
  ('scopritevi-065', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale oggetto di casa non butteresti mai, anche se è vecchio?', null, '[]'::jsonb, 2, 'casa_oggetto_da_tenere', 'standard', false, false, 'Which thing at home would you never throw away, even though it’s old?', null, '[]'::jsonb),
  ('scopritevi-066', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Che rapporto hai con il disordine?', null, '["Mi agita, riordino subito","Lo vedo solo io e va bene così","Ordine creativo: so dov’è tutto","Lo noto solo quando arriva qualcuno"]'::jsonb, 1, 'casa_rapporto_col_disordine', 'light', false, true, 'What’s your relationship with mess?', null, '["It stresses me, I tidy at once","Only I see it and that’s fine","Creative order: I know where it all is","I only notice when someone’s coming"]'::jsonb),
  ('scopritevi-067', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Com’era la tua cameretta? Cosa c’era appeso alle pareti?', null, '[]'::jsonb, 1, 'infanzia_cameretta', 'light', false, false, 'What was your childhood bedroom like? What was on the walls?', null, '[]'::jsonb),
  ('scopritevi-068', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Nella tua infanzia, quale persona adulta ti faceva sentire al sicuro?', null, '[]'::jsonb, 3, 'infanzia_adulto_che_proteggeva', 'deep', false, true, 'Growing up, which grown-up made you feel safe?', null, '[]'::jsonb),
  ('scopritevi-069', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale regola di casa, nella tua infanzia, trovi ancora giusta?', null, '[]'::jsonb, 2, 'infanzia_regola_di_casa', 'standard', false, false, 'Which house rule from your childhood do you still think was right?', null, '[]'::jsonb),
  ('scopritevi-070', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Cosa della tua infanzia vorresti ritrovare in una soffitta?', null, '["Un peluche","Un diario segreto","Un gioco che non si trova più","Le figurine"]'::jsonb, 1, 'infanzia_tesoro_in_soffitta', 'light', false, false, 'What from your childhood would you love to find in an attic?', null, '["A cuddly toy","A secret diary","A toy you can’t find any more","Sticker albums"]'::jsonb),
  ('scopritevi-071', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale sapore ti fa tornare indietro nel tempo, a un momento preciso?', null, '[]'::jsonb, 2, 'cibo_sapore_che_riporta_indietro', 'standard', false, true, 'Which taste takes you back in time, to one particular moment?', null, '[]'::jsonb),
  ('scopritevi-072', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'C’è un cibo che odiavi e che adesso adori?', null, '[]'::jsonb, 1, 'cibo_odiato_poi_amato', 'light', false, false, 'Is there a food you used to hate and now love?', null, '[]'::jsonb),
  ('scopritevi-073', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Nei giorni no, cosa ti consola a tavola?', null, '["Un piatto di pasta","Qualcosa di dolce","Una zuppa calda","Pane e quello che c’è"]'::jsonb, 1, 'cibo_consolazione_a_tavola', 'light', false, true, 'On bad days, what comforts you at the table?', null, '["A plate of pasta","Something sweet","A hot soup","Bread and whatever’s there"]'::jsonb),
  ('scopritevi-074', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale ricetta di famiglia vorresti imparare prima che si perda?', null, '[]'::jsonb, 2, 'cibo_ricetta_da_salvare', 'standard', false, false, 'Which family recipe would you like to learn before it’s lost?', null, '[]'::jsonb),
  ('scopritevi-075', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale canzone ti è stata vicina in un periodo difficile?', null, '[]'::jsonb, 2, 'musica_film_canzone_vicina', 'standard', false, false, 'Which song stayed with you through a hard time?', null, '[]'::jsonb),
  ('scopritevi-076', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale personaggio di un film ti somiglia più di quanto vorresti ammettere?', null, '[]'::jsonb, 1, 'musica_film_personaggio_che_somiglia', 'light', false, true, 'Which film character is more like you than you’d like to admit?', null, '[]'::jsonb),
  ('scopritevi-077', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è il concerto della tua vita, visto o ancora da vedere?', null, '[]'::jsonb, 1, 'musica_film_concerto_della_vita', 'light', false, false, 'What’s the concert of your life, seen or still to see?', null, '[]'::jsonb),
  ('scopritevi-078', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Cosa ti fa commuovere più facilmente?', null, '["Un film d’animazione","Una storia vera","Una canzone dal vivo","Un video di animali"]'::jsonb, 1, 'musica_film_cosa_commuove', 'light', false, true, 'What moves you to tears most easily?', null, '["An animated film","A true story","A live song","An animal video"]'::jsonb),
  ('scopritevi-079', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Cosa vorresti saper fare tra dieci anni che adesso non sai fare?', null, '[]'::jsonb, 1, 'futuro_saper_fare_tra_dieci_anni', 'light', false, false, 'What would you like to be able to do in ten years that you can’t do now?', null, '[]'::jsonb),
  ('scopritevi-080', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Come ti immagini a settant’anni, in una giornata qualunque?', null, '[]'::jsonb, 3, 'futuro_a_settant_anni', 'deep', false, false, 'How do you picture yourself at seventy, on an ordinary day?', null, '[]'::jsonb),
  ('scopritevi-081', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Con i soldi, sei più da formica o da cicala?', null, '["Formica: metto da parte","Cicala: si vive una volta","Un po’ e un po’","Formica, ma con gli sfizi"]'::jsonb, 2, 'futuro_formica_o_cicala', 'standard', false, true, 'With money, are you more of an ant or a grasshopper?', null, '["Ant: I save","Grasshopper: you only live once","A bit of both","Ant, with the odd treat"]'::jsonb),
  ('scopritevi-082', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale scelta coraggiosa ti piacerebbe fare nei prossimi anni?', null, '[]'::jsonb, 3, 'futuro_scelta_coraggiosa', 'deep', false, false, 'Which brave choice would you like to make in the coming years?', null, '[]'::jsonb),
  ('scopritevi-083', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Qual è l’amicizia più lunga che hai, e cosa la tiene viva?', null, '[]'::jsonb, 2, 'amici_famiglia_amicizia_piu_lunga', 'standard', false, true, 'What’s your longest friendship, and what keeps it alive?', null, '[]'::jsonb),
  ('scopritevi-084', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'In cosa somigli di più alla tua famiglia, anche se non lo ammetti?', null, '[]'::jsonb, 2, 'amici_famiglia_somiglianza_di_famiglia', 'standard', false, false, 'How are you most like your family, even if you won’t admit it?', null, '[]'::jsonb),
  ('scopritevi-085', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Quando qualcuno ti chiede un consiglio, che consiglio dai?', null, '["Sincero, anche se punge","Dolce e incoraggiante","Pratico, con un piano","Faccio domande finché ci arriva"]'::jsonb, 1, 'amici_famiglia_consiglio_agli_amici', 'light', false, false, 'When someone asks you for advice, what kind do you give?', null, '["Honest, even if it stings","Gentle and encouraging","Practical, with a plan","Questions until they get there"]'::jsonb),
  ('scopritevi-086', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quale frase tipica della tua famiglia ti esce di bocca senza volerlo?', null, '[]'::jsonb, 1, 'amici_famiglia_frase_di_famiglia', 'light', false, true, 'Which typical family saying slips out of your mouth without meaning to?', null, '[]'::jsonb),
  ('scopritevi-087', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Quando ti senti giù, cosa vorresti che facessi senza chiedertelo?', null, '[]'::jsonb, 3, 'tenerezza_quando_sei_giu', 'deep', false, false, 'When you’re feeling low, what would you like me to do without asking?', null, '[]'::jsonb),
  ('scopritevi-088', 1, 'scopritevi', 'curated', 'reciprocal', 'open', 'Cosa ti manca di più di me quando non siamo insieme?', null, '[]'::jsonb, 2, 'tenerezza_cosa_ti_manca_di_me', 'standard', false, true, 'What do you miss most about me when we’re not together?', null, '[]'::jsonb),
  ('scopritevi-089', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Quale tenerezza ti piace ricevere quando meno te l’aspetti?', null, '["Un bacio sulla fronte","Una mano sulla schiena","Un messaggio dolce","Un abbraccio da dietro"]'::jsonb, 1, 'tenerezza_tenerezza_inattesa', 'light', false, false, 'Which kind of tenderness do you love getting when you least expect it?', null, '["A kiss on the forehead","A hand on my back","A sweet message","A hug from behind"]'::jsonb),
  ('scopritevi-090', 1, 'scopritevi', 'curated', 'reciprocal', 'choice', 'Come ti viene più facile dire «ti voglio bene»?', null, '["A parole","Con un gesto","Per messaggio","Cucinando qualcosa"]'::jsonb, 2, 'tenerezza_dire_ti_voglio_bene', 'standard', false, false, 'What’s the easiest way for you to say “I love you”?', null, '["In words","With a gesture","By text","By cooking something"]'::jsonb),
  ('confrontatevi-053', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Un viaggio insieme: chi lo organizza?', null, '["{francesco}","{beatrice}","Metà e metà","Nessuno: si improvvisa"]'::jsonb, 1, 'viaggi_chi_organizza', 'light', false, false, 'A trip together: who plans it?', null, '["{francesco}","{beatrice}","Half and half","No one: we improvise"]'::jsonb),
  ('confrontatevi-054', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quale vacanza ci farebbe più bene adesso?', null, '["Una spa e tanto sonno","Una città da girare a piedi","Una casa in campagna","Un posto mai sentito"]'::jsonb, 1, 'viaggi_vacanza_che_ci_serve', 'light', false, false, 'Which holiday would do us the most good right now?', null, '["A spa and lots of sleep","A city to explore on foot","A house in the countryside","A place we’ve never heard of"]'::jsonb),
  ('confrontatevi-055', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'In viaggio, quante foto fai?', null, '["Mille: poi le guardo","Poche ma belle","Solo ai piatti","Nessuna: mi godo il momento"]'::jsonb, 1, 'viaggi_foto_in_viaggio', 'light', false, true, 'On a trip, how many photos do you take?', null, '["A thousand: I’ll look later","Few but good ones","Only of the food","None: I enjoy the moment"]'::jsonb),
  ('confrontatevi-056', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Perdiamo il treno in un posto che non conosciamo. Cosa fai?', null, '["Rido e cerco un piano B","Mi agito un po’, poi passa","Ne approfitto per esplorare","Lascio fare a te"]'::jsonb, 2, 'viaggi_treno_perso', 'standard', false, false, 'We miss the train somewhere we don’t know. What do you do?', null, '["Laugh and find a plan B","Get a bit anxious, then it passes","Use it to explore","Leave it to you"]'::jsonb),
  ('confrontatevi-057', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'In casa: finestre aperte o riscaldamento alto?', null, '["Finestre aperte, sempre","Caldo tropicale","Una via di mezzo","Coperta e pace"]'::jsonb, 1, 'casa_finestre_o_riscaldamento', 'light', false, true, 'At home: windows open or heating turned up?', null, '["Windows open, always","Tropical heat","Somewhere in between","A blanket and peace"]'::jsonb),
  ('confrontatevi-058', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Una serata a casa: chi sceglie cosa guardare?', null, '["{francesco}","{beatrice}","A turno","Lo decide il telecomando"]'::jsonb, 1, 'casa_chi_sceglie_cosa_guardare', 'light', false, false, 'A night in: who chooses what to watch?', null, '["{francesco}","{beatrice}","We take turns","The remote decides"]'::jsonb),
  ('confrontatevi-059', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Chi di noi due farebbe sopravvivere una pianta?', null, '["{francesco}","{beatrice}","Noi due, con un promemoria","Nessuno: meglio quelle finte"]'::jsonb, 1, 'casa_pianta_che_sopravvive', 'light', false, false, 'Which of us would keep a houseplant alive?', null, '["{francesco}","{beatrice}","Both of us, with a reminder","Neither: fake ones are safer"]'::jsonb),
  ('confrontatevi-060', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quanto ti piace avere gente per casa?', null, '["Tantissimo: più gente c’è, meglio è","Ogni tanto, con calma","Poche persone, scelte bene","Preferisco andare io da loro"]'::jsonb, 2, 'casa_gente_per_casa', 'standard', false, true, 'How much do you like having people over?', null, '["Loads: the more the merrier","Now and then, calmly","A few people, well chosen","I’d rather go to them"]'::jsonb),
  ('confrontatevi-061', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quale cosa della tua infanzia vorresti per i bambini di adesso?', null, '["Giocare in strada","Meno schermi","Le estati lunghissime","I nonni vicino"]'::jsonb, 2, 'infanzia_infanzia_per_i_bambini', 'standard', false, false, 'What from your childhood would you wish for children now?', null, '["Playing in the street","Fewer screens","Endless summers","Grandparents close by"]'::jsonb),
  ('confrontatevi-062', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'A scuola, come facevi i compiti?', null, '["Subito, per togliermeli","All’ultimo minuto","Copiando un po’","Con qualcuno che mi aiutava"]'::jsonb, 1, 'infanzia_compiti_a_casa', 'light', false, true, 'At school, how did you do your homework?', null, '["Straight away, to get it done","At the last minute","Copying a little","With someone helping me"]'::jsonb),
  ('confrontatevi-063', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quale gioco dell’infanzia rifaresti con me?', null, '["Nascondino","Una capanna di coperte","Le gare in bici","I giochi da tavolo"]'::jsonb, 1, 'infanzia_gioco_da_rifare', 'light', false, false, 'Which childhood game would you play again with me?', null, '["Hide and seek","A blanket fort","Bike races","Board games"]'::jsonb),
  ('confrontatevi-064', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Quale ricordo della tua infanzia vorresti farmi provare, almeno per un giorno?', null, '[]'::jsonb, 2, 'infanzia_ricordo_da_regalare', 'standard', false, false, 'Which memory from your childhood would you love me to experience, even just for a day?', null, '[]'::jsonb),
  ('confrontatevi-065', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Chi di noi due cucina meglio?', null, '["{francesco}","{beatrice}","Pari, su piatti diversi","L’app delle consegne"]'::jsonb, 1, 'cibo_chi_cucina_meglio', 'light', false, true, 'Which of us cooks better?', null, '["{francesco}","{beatrice}","A tie, on different dishes","The delivery app"]'::jsonb),
  ('confrontatevi-066', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'A cena fuori, come scegliamo il posto?', null, '["Quello di sempre","Uno nuovo, dalle recensioni","Il primo che troviamo","Decide chi ha più fame"]'::jsonb, 1, 'cibo_scegliere_il_locale', 'light', false, false, 'Dinner out: how do we pick the place?', null, '["Our usual one","A new one, from the reviews","The first one we find","Whoever’s hungriest decides"]'::jsonb),
  ('confrontatevi-067', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Al ristorante, i piatti si condividono?', null, '["Sì, si assaggia tutto","Solo un assaggio","No, il mio è mio","Dipende da cosa hai preso"]'::jsonb, 1, 'cibo_piatti_da_condividere', 'light', false, true, 'At a restaurant, do we share plates?', null, '["Yes, we try everything","Just a taste","No, mine is mine","Depends on what you ordered"]'::jsonb),
  ('confrontatevi-068', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Quale piatto vorresti che imparassimo a cucinare insieme?', null, '[]'::jsonb, 2, 'cibo_piatto_da_imparare', 'standard', false, false, 'Which dish would you like us to learn to cook together?', null, '[]'::jsonb),
  ('confrontatevi-069', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quanto ci mettiamo a scegliere un film?', null, '["Due minuti","Mezz’ora di trailer","Così tanto che si va a dormire","Riguardiamo il solito"]'::jsonb, 1, 'musica_film_scegliere_un_film', 'light', false, false, 'How long does it take us to choose a film?', null, '["Two minutes","Half an hour of trailers","So long we go to bed","We rewatch the usual one"]'::jsonb),
  ('confrontatevi-070', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quanto si somigliano i nostri gusti musicali?', null, '["Quasi uguali","Diversi, ma ci scambiamo canzoni","Lontanissimi","Ci incontriamo su poche canzoni"]'::jsonb, 2, 'musica_film_gusti_musicali', 'standard', false, true, 'How alike are our tastes in music?', null, '["Almost the same","Different, but we swap songs","Worlds apart","We meet on a few songs"]'::jsonb),
  ('confrontatevi-071', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Scopri il finale di una serie prima di me. Cosa fai?', null, '["Non dico niente, giuro","Mi scappa qualche indizio","Faccio facce strane","Te lo dico, non resisto"]'::jsonb, 1, 'musica_film_finale_scoperto', 'light', false, false, 'You find out how a series ends before I do. What do you do?', null, '["Say nothing, I swear","A hint or two slips out","I pull strange faces","I tell you, I can’t resist"]'::jsonb),
  ('confrontatevi-072', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Se dovessimo scegliere una canzone solo nostra, quale sarebbe, e perché?', null, '[]'::jsonb, 2, 'musica_film_canzone_solo_nostra', 'standard', false, true, 'If we had to choose a song that’s just ours, which would it be, and why?', null, '[]'::jsonb),
  ('confrontatevi-073', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Tra qualche anno, dove ci vedi?', null, '["In una grande città","In un paese tranquillo","Vicino al mare","Dove ci porta il lavoro"]'::jsonb, 2, 'futuro_dove_ci_vedi', 'standard', false, false, 'A few years from now, where do you see us?', null, '["In a big city","In a quiet village","Near the sea","Wherever work takes us"]'::jsonb),
  ('confrontatevi-074', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Se mettessimo da parte qualcosa ogni mese, per cosa lo faresti?', null, '["Un viaggio grande","Una casa","Un fondo per gli imprevisti","Un sogno che non diciamo ancora"]'::jsonb, 2, 'futuro_per_cosa_risparmiare', 'standard', false, false, 'If we put something aside every month, what would you save for?', null, '["A big trip","A home","A rainy-day fund","A dream we haven’t said out loud"]'::jsonb),
  ('confrontatevi-075', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Come ti piacerebbe festeggiare un nostro anniversario importante?', null, '["Rifare il nostro primo appuntamento","Un viaggio a sorpresa","Una festa con chi amiamo","Una serata solo noi"]'::jsonb, 1, 'futuro_anniversario_importante', 'light', false, true, 'How would you like to celebrate a big anniversary of ours?', null, '["Recreate our first date","A surprise trip","A party with the people we love","An evening just for us"]'::jsonb),
  ('confrontatevi-076', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Quale promessa piccola e concreta potremmo farci per i prossimi anni?', null, '[]'::jsonb, 3, 'futuro_promessa_concreta', 'deep', false, false, 'Which small, concrete promise could we make each other for the years ahead?', null, '[]'::jsonb),
  ('confrontatevi-077', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quante serate con gli amici sono giuste in un mese?', null, '["Una o due","Una a settimana","Più ce ne sono, meglio è","Dipende dal periodo"]'::jsonb, 1, 'amici_famiglia_serate_con_gli_amici', 'light', false, true, 'How many evenings with friends feel right in a month?', null, '["One or two","One a week","The more the better","It depends on the time of year"]'::jsonb),
  ('confrontatevi-078', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Le feste: con la mia famiglia, con la tua o solo noi?', null, '["Con la mia","Con la tua","Un po’ e un po’","Solo noi"]'::jsonb, 2, 'amici_famiglia_feste_con_chi', 'standard', false, false, 'Holidays: with my family, with yours, or just us?', null, '["With mine","With yours","A bit of each","Just us"]'::jsonb),
  ('confrontatevi-079', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Chi di noi due fa amicizia più facilmente con chi non conosce?', null, '["{francesco}","{beatrice}","Noi due: in coppia attacchiamo bottone"]'::jsonb, 1, 'amici_famiglia_amicizia_con_sconosciuti', 'light', false, false, 'Which of us makes friends with strangers more easily?', null, '["{francesco}","{beatrice}","Both: together we strike up conversations"]'::jsonb),
  ('confrontatevi-080', 1, 'confrontatevi', 'curated', 'reciprocal', 'open', 'Quale consiglio sull’amore ricevuto in famiglia teniamo, e quale lasciamo perdere?', null, '[]'::jsonb, 2, 'amici_famiglia_consigli_di_famiglia', 'standard', false, true, 'Which piece of advice about love from our families do we keep, and which do we drop?', null, '[]'::jsonb),
  ('confrontatevi-081', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'In pubblico, quanta tenerezza va bene?', null, '["Mano nella mano e basta","Baci quando capita","Tutta quella che voglio","Meglio a casa"]'::jsonb, 1, 'tenerezza_tenerezza_in_pubblico', 'light', false, false, 'In public, how much affection is fine?', null, '["Holding hands, that’s all","Kisses when it happens","As much as I like","Better at home"]'::jsonb),
  ('confrontatevi-082', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Quando non possiamo vederci per un po’, cosa ci serve di più?', null, '["Sentirci ogni sera","Una data per rivederci","Messaggi durante il giorno","Sorprese per posta"]'::jsonb, 2, 'tenerezza_quando_non_possiamo_vederci', 'standard', false, true, 'When we can’t see each other for a while, what do we need most?', null, '["Talking every evening","A date to see each other again","Messages during the day","Surprises in the post"]'::jsonb),
  ('confrontatevi-083', 1, 'confrontatevi', 'curated', 'reciprocal', 'choice', 'Dopo una giornata lunga, come preferisci ritrovarmi?', null, '["Con un abbraccio","Con una chiacchierata","In silenzio, accanto a te","Con qualcosa di buono da mangiare"]'::jsonb, 2, 'tenerezza_dopo_una_giornata_lunga', 'standard', false, false, 'After a long day, how do you prefer to find me?', null, '["With a hug","With a chat","In silence, beside you","With something good to eat"]'::jsonb),
  ('rivivete-041', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale gita o viaggio insieme, anche piccolo, rifaresti domani?', null, '[]'::jsonb, 1, 'viaggi_gita_da_rifare', 'light', false, false, 'Which outing or trip together, however small, would you do again tomorrow?', null, '[]'::jsonb),
  ('rivivete-042', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale imprevisto, in viaggio o in giro, adesso ci fa ridere?', null, '[]'::jsonb, 1, 'viaggi_imprevisto_che_fa_ridere', 'light', false, false, 'Which mishap, on a trip or out and about, makes us laugh now?', null, '[]'::jsonb),
  ('rivivete-043', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Quale posto senti più nostro?', null, '["Un locale dove torniamo","Una strada o una panchina","Un posto di vacanza","Casa, ovunque sia"]'::jsonb, 2, 'viaggi_posto_piu_nostro', 'standard', false, true, 'Which place feels most like ours?', null, '["A spot we keep going back to","A street or a bench","A holiday place","Home, wherever it is"]'::jsonb),
  ('rivivete-044', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Ricordi il nostro primo viaggio, anche solo di un giorno? Cosa ti è rimasto?', null, '[]'::jsonb, 2, 'viaggi_primo_viaggio', 'standard', false, false, 'Do you remember our first trip, even just a day trip? What stayed with you?', null, '[]'::jsonb),
  ('rivivete-045', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Qual è la prima cena cucinata da uno di noi che ricordi? Com’è andata?', null, '[]'::jsonb, 1, 'casa_prima_cena_cucinata', 'light', false, true, 'What’s the first dinner cooked by one of us that you remember? How did it go?', null, '[]'::jsonb),
  ('rivivete-046', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale oggetto che abbiamo racconta meglio la nostra storia?', null, '[]'::jsonb, 2, 'casa_oggetto_della_nostra_storia', 'standard', false, false, 'Which thing we own tells our story best?', null, '[]'::jsonb),
  ('rivivete-047', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Quale nostra abitudine è nata quasi per caso?', null, '["Un modo di salutarci","Una cosa che mangiamo sempre","Una parola o una battuta","Un rito della sera"]'::jsonb, 1, 'casa_abitudine_nata_per_caso', 'light', false, false, 'Which habit of ours started almost by chance?', null, '["A way of saying hello","Something we always eat","A word or a joke","An evening ritual"]'::jsonb),
  ('rivivete-048', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Qual è il primo posto che abbiamo sentito un po’ casa, anche solo per una notte?', null, '[]'::jsonb, 2, 'casa_primo_posto_come_casa', 'standard', false, true, 'What’s the first place that felt a bit like home to us, even just for one night?', null, '[]'::jsonb),
  ('rivivete-049', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale storia della mia infanzia ti ha fatto più tenerezza quando te l’ho raccontata?', null, '[]'::jsonb, 2, 'infanzia_storia_della_mia_infanzia', 'standard', false, false, 'Which story from my childhood touched you most when I told it?', null, '[]'::jsonb),
  ('rivivete-050', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Quando hai visto le foto della mia infanzia, cosa hai pensato?', null, '["Che tenerezza","Ma che capelli!","Hai la stessa faccia di adesso","Non le ho ancora viste!"]'::jsonb, 1, 'infanzia_foto_della_mia_infanzia', 'light', false, true, 'When you saw my childhood photos, what did you think?', null, '["So sweet","What hair!","Same face as now","I haven’t seen them yet!"]'::jsonb),
  ('rivivete-051', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale racconto d’infanzia, tuo o mio, citiamo ancora tra noi come una battuta?', null, '[]'::jsonb, 2, 'infanzia_racconto_che_citiamo', 'standard', false, false, 'Which childhood story, yours or mine, do we still quote like an inside joke?', null, '[]'::jsonb),
  ('rivivete-052', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Al nostro primo appuntamento, cosa c’era da mangiare o da bere?', null, '["Un caffè","Un aperitivo","Una cena vera","Non me lo ricordo proprio"]'::jsonb, 1, 'cibo_primo_appuntamento_a_tavola', 'light', false, false, 'On our first date, what was there to eat or drink?', null, '["A coffee","Drinks","A proper dinner","I really can’t remember"]'::jsonb),
  ('rivivete-053', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Qual è stato il nostro disastro più bello in cucina?', null, '[]'::jsonb, 1, 'cibo_disastro_in_cucina', 'light', false, true, 'What was our best disaster in the kitchen?', null, '[]'::jsonb),
  ('rivivete-054', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale locale o ristorante è legato a un nostro momento importante?', null, '[]'::jsonb, 2, 'cibo_locale_importante', 'standard', false, false, 'Which café or restaurant is tied to an important moment of ours?', null, '[]'::jsonb),
  ('rivivete-055', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Quale piatto mangiato insieme vorresti rifare a casa?', null, '["Uno di un viaggio","Uno di una cena speciale","Uno di un pranzo di famiglia","Uno inventato da noi"]'::jsonb, 1, 'cibo_piatto_da_rifare_a_casa', 'light', false, true, 'Which dish we ate together would you like to make at home?', null, '["One from a trip","One from a special dinner","One from a family lunch","One we made up"]'::jsonb),
  ('rivivete-056', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale canzone ti riporta subito a un nostro momento?', null, '[]'::jsonb, 2, 'musica_film_canzone_di_un_momento', 'standard', false, false, 'Which song takes you straight back to a moment of ours?', null, '[]'::jsonb),
  ('rivivete-057', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Ti ricordi il primo film che abbiamo visto insieme? Cosa ricordi, a parte il film?', null, '[]'::jsonb, 1, 'musica_film_primo_film_insieme', 'light', false, false, 'Do you remember the first film we watched together? What do you remember, apart from the film?', null, '[]'::jsonb),
  ('rivivete-058', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Quale nostro momento con la musica di sottofondo ricordi meglio?', null, '["Un concerto","Un viaggio in macchina","Un ballo improvvisato","Una canzone dedicata"]'::jsonb, 2, 'musica_film_musica_di_sottofondo', 'standard', false, true, 'Which moment of ours with music in the background do you remember best?', null, '["A concert","A car journey","An impromptu dance","A song dedicated to one of us"]'::jsonb),
  ('rivivete-059', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale serie abbiamo divorato più in fretta, e chi voleva sempre un altro episodio?', null, '[]'::jsonb, 1, 'musica_film_serie_divorata', 'light', false, false, 'Which series did we binge fastest, and who always wanted one more episode?', null, '[]'::jsonb),
  ('rivivete-060', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale cosa detta all’inizio tra noi si è avverata?', null, '[]'::jsonb, 3, 'futuro_detto_all_inizio', 'deep', false, true, 'Which thing we said to each other early on has come true?', null, '[]'::jsonb),
  ('rivivete-061', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Da quando stiamo insieme, cosa è cambiato di più in te?', null, '["Rido di più","Ho più pazienza","Mi lancio di più","Ho imparato a fermarmi"]'::jsonb, 2, 'futuro_cosa_e_cambiato_in_te', 'standard', false, false, 'Since we got together, what has changed most in you?', null, '["I laugh more","I have more patience","I take more chances","I’ve learnt to slow down"]'::jsonb),
  ('rivivete-062', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale decisione presa insieme ti fa dire ancora «abbiamo fatto bene»?', null, '[]'::jsonb, 2, 'futuro_decisione_giusta', 'standard', false, false, 'Which decision we made together still makes you say “we got that right”?', null, '[]'::jsonb),
  ('rivivete-063', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Di tutto quello che abbiamo vissuto finora, cosa vorresti raccontare tra molti anni?', null, '[]'::jsonb, 3, 'futuro_da_raccontare_tra_anni', 'deep', false, true, 'Of everything we’ve been through so far, what would you want to tell people many years from now?', null, '[]'::jsonb),
  ('rivivete-064', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Com’è andata la prima volta con i miei amici? Cosa ti ricordi?', null, '[]'::jsonb, 1, 'amici_famiglia_prima_volta_con_gli_amici', 'light', false, false, 'How did the first time with my friends go? What do you remember?', null, '[]'::jsonb),
  ('rivivete-065', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'La prima volta con la mia famiglia, com’è andata?', null, '["Benissimo, da subito","Un po’ di imbarazzo, poi bene","Domande a raffica","Non è ancora successo"]'::jsonb, 2, 'amici_famiglia_prima_volta_in_famiglia', 'standard', false, true, 'The first time with my family, how did it go?', null, '["Great, right away","A bit awkward, then fine","Questions nonstop","It hasn’t happened yet"]'::jsonb),
  ('rivivete-066', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Qual è l’aneddoto su di noi che raccontiamo sempre a tutti?', null, '[]'::jsonb, 1, 'amici_famiglia_aneddoto_su_di_noi', 'light', false, false, 'What’s the story about us we always tell everyone?', null, '[]'::jsonb),
  ('rivivete-067', 1, 'rivivete', 'curated', 'reciprocal', 'choice', 'Il nostro primo bacio: com’era?', null, '["Timido","Atteso da tanto","Improvviso","Buffo, ma perfetto"]'::jsonb, 2, 'tenerezza_primo_bacio', 'standard', false, false, 'Our first kiss: what was it like?', null, '["Shy","Long awaited","Sudden","Funny, but perfect"]'::jsonb),
  ('rivivete-068', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Ricordi un momento in cui ti ho fatto stare meglio senza dire niente?', null, '[]'::jsonb, 3, 'tenerezza_stare_meglio_senza_parole', 'deep', false, true, 'Do you remember a time I made you feel better without saying a word?', null, '[]'::jsonb),
  ('rivivete-069', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Ricordi un ritorno, dopo qualche giorno senza vederci, che ti è rimasto in mente?', null, '[]'::jsonb, 2, 'tenerezza_ritorno_dopo_qualche_giorno', 'standard', false, false, 'Do you remember a reunion, after a few days apart, that has stayed with you?', null, '[]'::jsonb),
  ('rivivete-070', 1, 'rivivete', 'curated', 'reciprocal', 'open', 'Quale mio messaggio hai riletto più di una volta?', null, '[]'::jsonb, 2, 'tenerezza_messaggio_riletto', 'standard', false, true, 'Which message of mine have you reread more than once?', null, '[]'::jsonb)
on conflict (id) do nothing;

-- Questo o quello: 32 new cards (12 plus), Italian and English.
insert into private.game_swipe_v1_catalog (id, version, question_text, options, topic, active, plus, question_text_en, options_en) values
  ('swipe-103', 1, 'In viaggio: zaino leggero o valigia per ogni evenienza?', '["Zaino leggero","Valigia enorme"]'::jsonb, 'viaggi_zaino_o_valigia', true, false, 'Travelling: a light backpack or a suitcase for every scenario?', '["Light backpack","Huge suitcase"]'::jsonb),
  ('swipe-104', 1, 'Una vacanza: tutto il tempo in un posto o tante tappe?', '["Un posto solo","Tante tappe"]'::jsonb, 'viaggi_un_posto_o_tante_tappe', true, false, 'A holiday: one place the whole time or lots of stops?', '["One place","Lots of stops"]'::jsonb),
  ('swipe-105', 1, 'Si parte: all’alba o con calma dopo pranzo?', '["All’alba","Dopo pranzo"]'::jsonb, 'viaggi_alba_o_dopo_pranzo', true, true, 'Setting off: at dawn or calmly after lunch?', '["At dawn","After lunch"]'::jsonb),
  ('swipe-106', 1, 'Un viaggio insieme: in treno o in macchina?', '["In treno","In macchina"]'::jsonb, 'viaggi_treno_o_macchina', true, false, 'A trip together: by train or by car?', '["By train","By car"]'::jsonb),
  ('swipe-107', 1, 'Una mattina libera: colazione a letto o al bar?', '["A letto","Al bar"]'::jsonb, 'casa_colazione_a_letto_o_al_bar', true, true, 'A free morning: breakfast in bed or at a café?', '["In bed","At a café"]'::jsonb),
  ('swipe-108', 1, 'Per dormire: buio totale o un filo di luce?', '["Buio totale","Un filo di luce"]'::jsonb, 'casa_buio_o_filo_di_luce', true, false, 'For sleeping: total darkness or a sliver of light?', '["Total darkness","A sliver of light"]'::jsonb),
  ('swipe-109', 1, 'Il letto la mattina: rifatto subito o lasciato così?', '["Rifatto subito","Lasciato così"]'::jsonb, 'casa_letto_rifatto_o_no', true, false, 'The bed in the morning: made right away or left as it is?', '["Made right away","Left as it is"]'::jsonb),
  ('swipe-110', 1, 'Una casa piena di piante o piena di libri?', '["Piante","Libri"]'::jsonb, 'casa_piante_o_libri', true, true, 'A home full of plants or full of books?', '["Plants","Books"]'::jsonb),
  ('swipe-111', 1, 'La sera, sul divano: tisana o un bicchiere di vino?', '["Tisana","Un bicchiere di vino"]'::jsonb, 'casa_tisana_o_vino', true, false, 'Evening on the couch: herbal tea or a glass of wine?', '["Herbal tea","A glass of wine"]'::jsonb),
  ('swipe-112', 1, 'La merenda dell’infanzia: pane e cioccolato o pane e olio?', '["Pane e cioccolato","Pane e olio"]'::jsonb, 'infanzia_merenda_cioccolato_o_olio', true, true, 'The snack of your childhood: bread and chocolate or bread and olive oil?', '["Bread and chocolate","Bread and olive oil"]'::jsonb),
  ('swipe-113', 1, 'Il sabato mattina dell’infanzia: cartoni in TV o giochi in cortile?', '["Cartoni in TV","Giochi in cortile"]'::jsonb, 'infanzia_cartoni_o_cortile', true, false, 'Childhood Saturday mornings: cartoons on TV or games outside?', '["Cartoons","Games outside"]'::jsonb),
  ('swipe-114', 1, 'Alle giostre: autoscontro o ruota panoramica?', '["Autoscontro","Ruota panoramica"]'::jsonb, 'infanzia_autoscontro_o_ruota', true, false, 'At the funfair: bumper cars or the Ferris wheel?', '["Bumper cars","Ferris wheel"]'::jsonb),
  ('swipe-115', 1, 'Se dovessi scegliere una portata sola: primo o secondo?', '["Primo","Secondo"]'::jsonb, 'cibo_primo_o_secondo', true, true, 'If you could only have one course: pasta or the main?', '["Pasta","The main"]'::jsonb),
  ('swipe-116', 1, 'Il gelato: cono o coppetta?', '["Cono","Coppetta"]'::jsonb, 'cibo_cono_o_coppetta', true, false, 'Ice cream: cone or cup?', '["Cone","Cup"]'::jsonb),
  ('swipe-117', 1, 'Il caffè: al bar o fatto in casa?', '["Al bar","Fatto in casa"]'::jsonb, 'cibo_caffe_al_bar_o_a_casa', true, true, 'Coffee: at a café or made at home?', '["At a café","Made at home"]'::jsonb),
  ('swipe-118', 1, 'A tavola: piccante o delicato?', '["Piccante","Delicato"]'::jsonb, 'cibo_piccante_o_delicato', true, false, 'At the table: spicy or mild?', '["Spicy","Mild"]'::jsonb),
  ('swipe-119', 1, 'Al cinema: prima fila o ultima fila?', '["Prima fila","Ultima fila"]'::jsonb, 'musica_film_prima_o_ultima_fila', true, false, 'At the cinema: front row or back row?', '["Front row","Back row"]'::jsonb),
  ('swipe-120', 1, 'Un film già visto cento volte o uno mai visto?', '["Già visto","Mai visto"]'::jsonb, 'musica_film_film_rivisto_o_nuovo', true, true, 'A film seen a hundred times or one never seen?', '["Seen it","Never seen"]'::jsonb),
  ('swipe-121', 1, 'Le canzoni: tutte le parole a memoria o solo il ritornello?', '["Tutte le parole","Solo il ritornello"]'::jsonb, 'musica_film_parole_o_ritornello', true, false, 'Songs: every word by heart or just the chorus?', '["Every word","Just the chorus"]'::jsonb),
  ('swipe-122', 1, 'Una serie nuova: un episodio a sera o tutta in un weekend?', '["Uno a sera","Tutta in un weekend"]'::jsonb, 'musica_film_episodio_o_maratona', true, true, 'A new series: one episode a night or all in one weekend?', '["One a night","All in a weekend"]'::jsonb),
  ('swipe-123', 1, 'Tra dieci anni: città o campagna?', '["Città","Campagna"]'::jsonb, 'futuro_citta_o_campagna', true, false, 'Ten years from now: city or countryside?', '["City","Countryside"]'::jsonb),
  ('swipe-124', 1, 'I risparmi: per un viaggio o per la casa?', '["Per un viaggio","Per la casa"]'::jsonb, 'futuro_risparmi_viaggio_o_casa', true, false, 'Savings: for a trip or for a home?', '["For a trip","For a home"]'::jsonb),
  ('swipe-125', 1, 'Un progetto insieme: deciso a tavolino o nato per caso?', '["A tavolino","Per caso"]'::jsonb, 'futuro_progetto_pianificato_o_per_caso', true, true, 'A project together: carefully planned or born by chance?', '["Planned","By chance"]'::jsonb),
  ('swipe-126', 1, 'Il prossimo anniversario: sorpresa o deciso insieme?', '["Sorpresa","Deciso insieme"]'::jsonb, 'futuro_anniversario_sorpresa_o_insieme', true, false, 'The next anniversary: a surprise or planned together?', '["Surprise","Planned together"]'::jsonb),
  ('swipe-127', 1, 'A una festa: tanta gente nuova o i soliti amici?', '["Gente nuova","I soliti amici"]'::jsonb, 'amici_famiglia_gente_nuova_o_soliti_amici', true, true, 'At a party: lots of new people or the usual friends?', '["New people","The usual friends"]'::jsonb),
  ('swipe-128', 1, 'Il compleanno: festa grande o cena con pochi intimi?', '["Festa grande","Cena con pochi intimi"]'::jsonb, 'amici_famiglia_festa_grande_o_cena', true, false, 'Birthdays: a big party or dinner with a close few?', '["Big party","A close few"]'::jsonb),
  ('swipe-129', 1, 'Una bella notizia: la dico prima agli amici o in famiglia?', '["Agli amici","In famiglia"]'::jsonb, 'amici_famiglia_notizia_amici_o_famiglia', true, false, 'Good news: do I tell my friends or my family first?', '["My friends","My family"]'::jsonb),
  ('swipe-130', 1, 'Il bacio del buongiorno: subito o dopo il caffè?', '["Subito","Dopo il caffè"]'::jsonb, 'tenerezza_bacio_del_buongiorno', true, true, 'The good-morning kiss: right away or after coffee?', '["Right away","After coffee"]'::jsonb),
  ('swipe-131', 1, 'A distanza: videochiamata o vocale lungo?', '["Videochiamata","Vocale lungo"]'::jsonb, 'tenerezza_videochiamata_o_vocale', true, false, 'Apart: a video call or a long voice note?', '["Video call","Voice note"]'::jsonb),
  ('swipe-132', 1, 'Grattini: sulla testa o sulla schiena?', '["Sulla testa","Sulla schiena"]'::jsonb, 'tenerezza_grattini_testa_o_schiena', true, true, 'Scratches: on the head or on the back?', '["On the head","On the back"]'::jsonb),
  ('swipe-133', 1, 'Un «ti amo»: detto a voce o scritto a sorpresa?', '["A voce","Scritto a sorpresa"]'::jsonb, 'tenerezza_ti_amo_a_voce_o_scritto', true, false, 'An “I love you”: said out loud or written as a surprise?', '["Out loud","Written surprise"]'::jsonb),
  ('swipe-134', 1, 'Un abbraccio: lungo e lento o forte e veloce?', '["Lungo e lento","Forte e veloce"]'::jsonb, 'tenerezza_abbraccio_lento_o_stretto', true, false, 'A hug: long and slow or tight and quick?', '["Long and slow","Tight and quick"]'::jsonb)
on conflict (id) do nothing;

-- content-1-2:end

-- Postcondition: the bodies written above, grants as before, English on every
-- active row, and no plus row in the existing catalog (ids below the new ones).
do $content_1_2_check$
declare r record; fn pg_catalog.pg_proc%rowtype;
begin
  for r in select * from (values
    ('private.game_v2_candidates(uuid,text,timestamp with time zone)', 'a6ce0564d58ddd2caa1e5ac74b92ba04', false),
    ('public.start_swipe_round(uuid)', '3eeee19d8ae10f350c912ac870fb8acb', true),
    ('public.play_us_answer(uuid,boolean)', 'f158d123c77a27eabd11e6a17c2b1b42', true)
  ) v(sig, target, client) loop
    select p.* into fn from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure(r.sig);
    if not found or pg_catalog.md5(pg_catalog.replace(fn.prosrc, E'\r', '')) <> r.target
      or fn.proconfig is distinct from array['search_path=""']::text[]
      or pg_catalog.has_function_privilege('anon', fn.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', fn.oid, 'EXECUTE') <> r.client then
      raise exception using errcode = 'P0001', message = 'content 1.2: ' || r.sig || ' drift';
    end if;
  end loop;
  if exists (select 1 from public.game_v2_catalog where active and (question_text_en is null
      or (predict_text is not null and predict_text_en is null) or options_en is null)) then
    raise exception using errcode = 'P0001', message = 'content 1.2: an active Game V2 prompt has no English';
  end if;
  if exists (select 1 from private.game_swipe_v1_catalog where active and (question_text_en is null or options_en is null)) then
    raise exception using errcode = 'P0001', message = 'content 1.2: an active Swipe card has no English';
  end if;
  if exists (select 1 from public.game_v2_catalog where plus and pg_catalog.split_part(id, '-', 2)::integer < case family
        when 'quanto_mi_conosci' then 77 when 'ridete' then 61 when 'scopritevi' then 59 when 'confrontatevi' then 53
        when 'rivivete' then 41 else 1000 end)
    or exists (select 1 from private.game_swipe_v1_catalog where plus and pg_catalog.split_part(id, '-', 2)::integer < 103) then
    raise exception using errcode = 'P0001', message = 'content 1.2: an existing prompt became plus';
  end if;
end;
$content_1_2_check$;
