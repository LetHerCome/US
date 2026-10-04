-- Swipe V1: isolated 8-card binary-choice rounds on top of the existing
-- Game V2 session/reveal authority. Existing six editorial families and the
-- weekly-question family selector are intentionally unchanged.

alter table public.game_sessions drop constraint game_sessions_v2_family_check;
alter table public.game_sessions add constraint game_sessions_v2_family_check
  check (
    engine_version = 1
    or game_family in ('per_voi', 'swipe')
    or game_family = any (private.game_v2_families())
  );

create table private.game_swipe_v1_catalog (
  id text primary key check (id ~ '^swipe-[0-9]{3}$'),
  version integer not null default 1 check (version > 0),
  question_text text not null check (char_length(btrim(question_text)) between 12 and 240),
  options jsonb not null,
  topic text not null check (topic ~ '^[a-z_]+$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) = 2
    and jsonb_typeof(options->0) = 'string'
    and jsonb_typeof(options->1) = 'string'
    and btrim(options->>0) <> ''
    and btrim(options->>1) <> ''
    and options->>0 <> options->>1
  )
);

comment on table private.game_swipe_v1_catalog is
  'Swipe V1 curated binary-choice cards. Private server-only catalog; materialized into immutable Game V2 session items.';

insert into private.game_swipe_v1_catalog (id, version, question_text, options, topic) values
  ('swipe-001', 1, 'Una serata perfetta per noi sarebbe più bella fuori casa o sul divano?', '["Fuori casa","Sul divano"]'::jsonb, 'serata_perfetta'),
  ('swipe-002', 1, 'Se partissimo domani senza programmi, ti divertirebbe davvero?', '["Sì, andiamo","No, organizziamo"]'::jsonb, 'partire_senza_programmi'),
  ('swipe-003', 1, 'Quando siamo stanchi, preferisci parlare comunque o stare vicini in silenzio?', '["Parlare","Silenzio insieme"]'::jsonb, 'stanchezza'),
  ('swipe-004', 1, 'Per un weekend insieme sceglieresti mare o montagna?', '["Mare","Montagna"]'::jsonb, 'weekend'),
  ('swipe-005', 1, 'Ti piacerebbe avere una nostra tradizione fissa ogni mese?', '["Sì","No, meglio spontanei"]'::jsonb, 'tradizione'),
  ('swipe-006', 1, 'Se abbiamo un giorno libero, preferisci svegliarti presto o senza sveglia?', '["Presto","Senza sveglia"]'::jsonb, 'giorno_libero'),
  ('swipe-007', 1, 'Una sorpresa organizzata dall’altro ti entusiasma o ti mette un po’ in ansia?', '["Mi entusiasma","Preferisco saperlo"]'::jsonb, 'sorpresa'),
  ('swipe-008', 1, 'Se potessimo scegliere adesso, cena elegante o street food?', '["Cena elegante","Street food"]'::jsonb, 'cena'),
  ('swipe-009', 1, 'Ti piacerebbe riguardare insieme tutte le nostre foto una sera?', '["Sì","Non fa per me"]'::jsonb, 'foto'),
  ('swipe-010', 1, 'In viaggio preferisci vedere tantissime cose o prendercela lenta?', '["Vedere tutto","Andare lenti"]'::jsonb, 'viaggio'),
  ('swipe-011', 1, 'Se uno dei due è giù, meglio coccole subito o prima un po’ di spazio?', '["Coccole subito","Un po’ di spazio"]'::jsonb, 'supporto'),
  ('swipe-012', 1, 'Ti divertirebbe scegliere a turno una serata senza poter dire di no?', '["Sì","No"]'::jsonb, 'serata_turno'),
  ('swipe-013', 1, 'Preferisci ricevere un regalo utile o una cosa totalmente inutile ma romantica?', '["Utile","Romantico e inutile"]'::jsonb, 'regali'),
  ('swipe-014', 1, 'Una vacanza insieme: città piena di cose da fare o posto isolato?', '["Città","Posto isolato"]'::jsonb, 'vacanza'),
  ('swipe-015', 1, 'Ti piacerebbe avere più foto spontanee di noi anche se vengono male?', '["Sì","No, poche ma belle"]'::jsonb, 'foto_spontanee'),
  ('swipe-016', 1, 'Quando discutiamo, preferisci risolvere tutto subito o dormirci sopra?', '["Subito","Dormirci sopra"]'::jsonb, 'discussioni'),
  ('swipe-017', 1, 'Se cuciniamo insieme, vuoi una ricetta precisa o improvvisiamo?', '["Ricetta precisa","Improvvisiamo"]'::jsonb, 'cucinare'),
  ('swipe-018', 1, 'Ti piacerebbe fare una lista di posti da vedere insieme e spuntarli?', '["Sì","No, decidiamo al momento"]'::jsonb, 'posti'),
  ('swipe-019', 1, 'Una domenica senza impegni: serie tutto il giorno o uscita improvvisata?', '["Serie tutto il giorno","Uscita improvvisata"]'::jsonb, 'domenica'),
  ('swipe-020', 1, 'Se avessimo una casa insieme, preferiresti minimal o piena di nostre cose?', '["Minimal","Piena di noi"]'::jsonb, 'casa'),
  ('swipe-021', 1, 'Ti piacerebbe festeggiare anche le piccole ricorrenze, non solo quelle importanti?', '["Sì","No"]'::jsonb, 'ricorrenze'),
  ('swipe-022', 1, 'Quando siamo lontani, preferisci più messaggi brevi o una chiamata lunga?', '["Più messaggi","Una chiamata lunga"]'::jsonb, 'distanza'),
  ('swipe-023', 1, 'Se dobbiamo scegliere un film, meglio qualcosa che fa piangere o ridere?', '["Piangere","Ridere"]'::jsonb, 'film'),
  ('swipe-024', 1, 'Ti piacerebbe provare insieme un hobby che nessuno dei due sa fare?', '["Sì","No"]'::jsonb, 'hobby'),
  ('swipe-025', 1, 'Per un anniversario preferisci un’esperienza o un oggetto da conservare?', '["Esperienza","Oggetto"]'::jsonb, 'anniversario'),
  ('swipe-026', 1, 'Se uno propone un piano assurdo all’ultimo minuto, la risposta ideale è sì?', '["Sì","Dipende troppo"]'::jsonb, 'spontaneita'),
  ('swipe-027', 1, 'Preferisci che ci diciamo sempre tutto subito o che ognuno abbia anche cose solo sue?', '["Dirci quasi tutto","Avere spazi propri"]'::jsonb, 'spazi_personali'),
  ('swipe-028', 1, 'Ti piacerebbe avere una canzone nuova che diventa nostra ogni anno?', '["Sì","No"]'::jsonb, 'musica'),
  ('swipe-029', 1, 'Se potessimo vivere sei mesi altrove, sceglieresti una grande città o un posto piccolo?', '["Grande città","Posto piccolo"]'::jsonb, 'vivere_altrove'),
  ('swipe-030', 1, 'Meglio una giornata pianificata benissimo o una che cambia completamente strada facendo?', '["Pianificata","Improvvisata"]'::jsonb, 'programma'),
  ('swipe-031', 1, 'Ti piacerebbe ricevere più piccoli gesti senza occasione particolare?', '["Sì","Non mi serve"]'::jsonb, 'piccoli_gesti'),
  ('swipe-032', 1, 'Se avessimo solo due ore insieme, preferisci fare qualcosa o non fare assolutamente niente?', '["Fare qualcosa","Niente insieme"]'::jsonb, 'tempo_insieme');

create function public.start_swipe_round(request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.start_swipe_round(uuid) from public, anon;
grant execute on function public.start_swipe_round(uuid) to authenticated;
