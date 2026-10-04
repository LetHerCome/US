-- Production ledger 20260930105724 m11a_game_sessions_custom_questions: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 b48fa11ab40b5e955e41237992656d77; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- M11A candidate only. Additive, RPC-only reciprocal sessions and couple-authored
-- questions. No existing quiz, reward, push, or claim_us_role authority changes.
-- Session ownership is couple + stable relationship role; a legitimate re-pair
-- replaces the profile UID without transferring these rows.

create schema if not exists private;

create table public.couple_questions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_role text not null check (author_role in ('francesco', 'beatrice')),
  create_request_id uuid not null,
  question_text text not null check (char_length(btrim(question_text)) between 1 and 300),
  answer_kind text not null check (answer_kind in ('open', 'choice')),
  options jsonb not null default '[]'::jsonb,
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (couple_id, author_role, create_request_id),
  check (case when jsonb_typeof(options) = 'array' then
    (answer_kind = 'open' and jsonb_array_length(options) = 0) or
    (answer_kind = 'choice' and jsonb_array_length(options) between 2 and 4)
    else false end)
);
create index couple_questions_library_idx on public.couple_questions (couple_id, created_at desc) where archived_at is null;

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  game_family text not null check (char_length(game_family) between 1 and 48),
  content_source text not null check (content_source in ('curated', 'partner_knowledge', 'couple_custom', 'us_context')),
  started_by_role text not null check (started_by_role in ('francesco', 'beatrice')),
  create_request_id uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (couple_id, started_by_role, create_request_id)
);
create index game_sessions_couple_recent_idx on public.game_sessions (couple_id, started_at desc);

-- The item is the immutable gameplay snapshot. Editing or archiving its library
-- source never changes the prompt/options that the couple actually played.
create table public.game_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  source_question_id uuid references public.couple_questions(id),
  source_version integer check (source_version is null or source_version > 0),
  question_text text not null check (char_length(btrim(question_text)) between 1 and 300),
  answer_kind text not null check (answer_kind in ('open', 'choice')),
  options jsonb not null default '[]'::jsonb,
  unique (session_id, position),
  check (case when jsonb_typeof(options) = 'array' then
    (answer_kind = 'open' and jsonb_array_length(options) = 0) or
    (answer_kind = 'choice' and jsonb_array_length(options) between 2 and 4)
    else false end)
);

create table public.game_session_sides (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  actor_role text not null check (actor_role in ('francesco', 'beatrice')),
  completed_at timestamptz,
  reveal_seen_at timestamptz,
  primary key (session_id, actor_role)
);

create table public.game_session_answers (
  item_id uuid not null references public.game_session_items(id) on delete cascade,
  actor_role text not null check (actor_role in ('francesco', 'beatrice')),
  answer_text text,
  answer_index smallint,
  updated_at timestamptz not null default now(),
  primary key (item_id, actor_role),
  check ((answer_text is not null and answer_index is null and char_length(btrim(answer_text)) between 1 and 1000)
      or (answer_text is null and answer_index is not null and answer_index >= 0))
);

-- No direct client access, including reads or Realtime row subscriptions.
alter table public.couple_questions enable row level security;
alter table public.couple_questions force row level security;
alter table public.game_sessions enable row level security;
alter table public.game_sessions force row level security;
alter table public.game_session_items enable row level security;
alter table public.game_session_items force row level security;
alter table public.game_session_sides enable row level security;
alter table public.game_session_sides force row level security;
alter table public.game_session_answers enable row level security;
alter table public.game_session_answers force row level security;
revoke all on public.couple_questions, public.game_sessions, public.game_session_items,
  public.game_session_sides, public.game_session_answers from public, anon, authenticated;

create function private.m11a_actor()
returns table (caller_couple uuid, caller_role text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  return query
    select p.couple_id, p.role from public.profiles p
    where p.id = auth.uid() and p.couple_id is not null
      and p.role in ('francesco', 'beatrice') for share;
  if not found then
    raise exception using errcode = '42501', message = 'couple membership required';
  end if;
end;
$$;
revoke all on function private.m11a_actor() from public, anon, authenticated;

-- Returns normalized options or rejects the authored content. The same limits
-- are checked by answer RPCs against the immutable session item.
create function private.m11a_valid_options(target_kind text, target_question text, raw_options jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare item jsonb; label text; cleaned jsonb := '[]'::jsonb;
begin
  if target_question is null or char_length(btrim(target_question)) not between 1 and 300
     or target_kind not in ('open', 'choice') then
    raise exception using errcode = '22023', message = 'invalid question';
  end if;
  if raw_options is null or jsonb_typeof(raw_options) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid options';
  end if;
  if target_kind = 'open' then
    if jsonb_array_length(raw_options) <> 0 then
      raise exception using errcode = '22023', message = 'invalid options';
    end if;
    return cleaned;
  end if;
  if jsonb_array_length(raw_options) not between 2 and 4 then
    raise exception using errcode = '22023', message = 'invalid options';
  end if;
  for item in select value from jsonb_array_elements(raw_options) loop
    if jsonb_typeof(item) <> 'string' then
      raise exception using errcode = '22023', message = 'invalid options';
    end if;
    label := btrim(item #>> '{}');
    if char_length(label) not between 1 and 120 or cleaned ? label then
      raise exception using errcode = '22023', message = 'invalid options';
    end if;
    cleaned := cleaned || jsonb_build_array(label);
  end loop;
  return cleaned;
end;
$$;
revoke all on function private.m11a_valid_options(text, text, jsonb) from public, anon, authenticated;

create function private.m11a_question_json(q public.couple_questions)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', q.id, 'question_text', q.question_text,
    'answer_kind', q.answer_kind, 'options', q.options, 'version', q.version,
    'author_role', q.author_role, 'created_at', q.created_at);
$$;
revoke all on function private.m11a_question_json(public.couple_questions) from public, anon, authenticated;

create function public.create_couple_question(request_id uuid, question_text text, answer_kind text, options jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; normalized jsonb; q public.couple_questions%rowtype;
begin
  select * into actor from private.m11a_actor();
  if request_id is null then raise exception using errcode = '22023', message = 'request id required'; end if;
  normalized := private.m11a_valid_options(answer_kind, question_text, options);
  insert into public.couple_questions(couple_id, author_role, create_request_id, question_text, answer_kind, options)
  values (actor.caller_couple, actor.caller_role, request_id, btrim(question_text), answer_kind, normalized)
  on conflict (couple_id, author_role, create_request_id) do nothing returning * into q;
  if q.id is null then
    select * into q from public.couple_questions
    where couple_id = actor.caller_couple and author_role = actor.caller_role and create_request_id = request_id;
    if q.question_text <> btrim(question_text) or q.answer_kind <> answer_kind or q.options <> normalized then
      raise exception using errcode = '22023', message = 'request already used';
    end if;
  end if;
  return private.m11a_question_json(q);
end;
$$;

create function public.list_couple_questions()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor record; result jsonb;
begin
  select * into actor from private.m11a_actor();
  select coalesce(jsonb_agg(private.m11a_question_json(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
    into result from public.couple_questions q
    where q.couple_id = actor.caller_couple and q.archived_at is null;
  return result;
end;
$$;

create function public.update_couple_question(target_question_id uuid, expected_version integer,
  question_text text, answer_kind text, options jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; normalized jsonb; q public.couple_questions%rowtype;
begin
  select * into actor from private.m11a_actor();
  normalized := private.m11a_valid_options(answer_kind, question_text, options);
  select * into q from public.couple_questions
    where id = target_question_id and couple_id = actor.caller_couple for update;
  if q.id is null then raise exception using errcode = '42501', message = 'question unavailable'; end if;
  if q.author_role <> actor.caller_role then raise exception using errcode = '42501', message = 'author only'; end if;
  if q.archived_at is not null then raise exception using errcode = '22023', message = 'question archived'; end if;
  if expected_version is distinct from q.version then raise exception using errcode = '40001', message = 'version conflict'; end if;
  update public.couple_questions set question_text = btrim(update_couple_question.question_text),
    answer_kind = update_couple_question.answer_kind, options = normalized,
    version = version + 1, updated_at = now() where id = q.id returning * into q;
  return private.m11a_question_json(q);
end;
$$;

create function public.archive_couple_question(target_question_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; q public.couple_questions%rowtype;
begin
  select * into actor from private.m11a_actor();
  select * into q from public.couple_questions
    where id = target_question_id and couple_id = actor.caller_couple for update;
  if q.id is null then raise exception using errcode = '42501', message = 'question unavailable'; end if;
  if q.author_role <> actor.caller_role then raise exception using errcode = '42501', message = 'author only'; end if;
  update public.couple_questions set archived_at = coalesce(archived_at, now()), updated_at = now()
    where id = q.id and archived_at is null;
  return jsonb_build_object('id', q.id, 'archived', true);
end;
$$;

-- Only this helper can expose partner answer fields. Before both sides complete,
-- the partner values are SQL NULL even if a partner draft row exists.
create function private.m11a_session_state(target_session_id uuid, current_couple uuid, caller_role text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'couple_id', s.couple_id, 'game_family', s.game_family,
    'content_source', s.content_source, 'started_by_role', s.started_by_role,
    'started_at', s.started_at, 'completed_at', s.completed_at,
    'my_complete', mine.completed_at is not null, 'my_completed_at', mine.completed_at,
    'partner_complete', partner.completed_at is not null, 'partner_completed_at', partner.completed_at,
    'reveal_ready', s.completed_at is not null, 'my_reveal_seen_at', mine.reveal_seen_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'position', i.position, 'question_text', i.question_text,
        'answer_kind', i.answer_kind, 'options', i.options,
        'source_question_id', i.source_question_id, 'source_version', i.source_version,
        'my_answer_text', a.answer_text, 'my_answer_index', a.answer_index,
        'partner_answer_text', case when s.completed_at is not null then pa.answer_text end,
        'partner_answer_index', case when s.completed_at is not null then pa.answer_index end
      ) order by i.position) from public.game_session_items i
      left join public.game_session_answers a on a.item_id = i.id and a.actor_role = caller_role
      left join public.game_session_answers pa on pa.item_id = i.id and pa.actor_role <> caller_role
      where i.session_id = s.id
    ), '[]'::jsonb)
  )
  from public.game_sessions s
  join public.game_session_sides mine on mine.session_id = s.id and mine.actor_role = caller_role
  join public.game_session_sides partner on partner.session_id = s.id and partner.actor_role <> caller_role
  where s.id = target_session_id and s.couple_id = current_couple;
$$;
revoke all on function private.m11a_session_state(uuid, uuid, text) from public, anon, authenticated;

create function public.start_custom_game_session(target_question_id uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; q public.couple_questions%rowtype; sid uuid; original_question uuid;
begin
  select * into actor from private.m11a_actor();
  if request_id is null then raise exception using errcode = '22023', message = 'request id required'; end if;
  -- Check the receipt first: a retry must still work after the source is edited
  -- or archived. Unique (couple, role, request) resolves concurrent first calls.
  select s.id, i.source_question_id into sid, original_question
    from public.game_sessions s join public.game_session_items i on i.session_id = s.id and i.position = 1
    where s.couple_id = actor.caller_couple and s.started_by_role = actor.caller_role
      and s.create_request_id = request_id;
  if sid is not null then
    if original_question is distinct from target_question_id then
      raise exception using errcode = '22023', message = 'request already used';
    end if;
    return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role);
  end if;
  select * into q from public.couple_questions
    where id = target_question_id and couple_id = actor.caller_couple and archived_at is null for share;
  if q.id is null then raise exception using errcode = '42501', message = 'question unavailable'; end if;
  insert into public.game_sessions(couple_id, game_family, content_source, started_by_role, create_request_id)
    values(actor.caller_couple, 'couple_custom', 'couple_custom', actor.caller_role, request_id)
    on conflict (couple_id, started_by_role, create_request_id) do nothing returning id into sid;
  if sid is null then
    select s.id, i.source_question_id into sid, original_question
      from public.game_sessions s join public.game_session_items i on i.session_id = s.id and i.position = 1
      where s.couple_id = actor.caller_couple and s.started_by_role = actor.caller_role
        and s.create_request_id = request_id;
    if sid is null or original_question is distinct from target_question_id then
      raise exception using errcode = '22023', message = 'request already used';
    end if;
  else
    insert into public.game_session_items(session_id, position, source_question_id, source_version,
      question_text, answer_kind, options)
      values(sid, 1, q.id, q.version, q.question_text, q.answer_kind, q.options);
    insert into public.game_session_sides(session_id, actor_role)
      values(sid, 'francesco'), (sid, 'beatrice');
  end if;
  return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role);
end;
$$;

create function public.list_game_sessions()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor record; result jsonb;
begin
  select * into actor from private.m11a_actor();
  select coalesce(jsonb_agg(row_data.data order by row_data.started_at desc, row_data.id desc), '[]'::jsonb)
    into result from (
      select s.id, s.started_at, jsonb_build_object(
        'id', s.id, 'game_family', s.game_family, 'content_source', s.content_source,
        'started_by_role', s.started_by_role, 'started_at', s.started_at,
        'my_complete', mine.completed_at is not null,
        'partner_complete', partner.completed_at is not null,
        'reveal_ready', s.completed_at is not null,
        'my_reveal_seen_at', mine.reveal_seen_at,
        'question_preview', first_item.question_text
      ) data
      from public.game_sessions s
      join public.game_session_sides mine on mine.session_id = s.id and mine.actor_role = actor.caller_role
      join public.game_session_sides partner on partner.session_id = s.id and partner.actor_role <> actor.caller_role
      left join lateral (select i.question_text from public.game_session_items i
        where i.session_id = s.id order by i.position limit 1) first_item on true
      where s.couple_id = actor.caller_couple
      order by s.started_at desc, s.id desc limit 50
    ) row_data;
  return result;
end;
$$;

create function public.get_game_session(target_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor record; result jsonb;
begin
  select * into actor from private.m11a_actor();
  result := private.m11a_session_state(target_session_id, actor.caller_couple, actor.caller_role);
  if result is null then raise exception using errcode = '42501', message = 'session unavailable'; end if;
  return result;
end;
$$;

create function public.save_game_session_answer(target_session_id uuid, target_item_id uuid,
  target_answer_text text, target_answer_index smallint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; s public.game_sessions%rowtype; i public.game_session_items%rowtype;
  locked_at timestamptz; existing public.game_session_answers%rowtype; normalized_text text;
begin
  select * into actor from private.m11a_actor();
  select * into s from public.game_sessions
    where id = target_session_id and couple_id = actor.caller_couple for update;
  if s.id is null then raise exception using errcode = '42501', message = 'session unavailable'; end if;
  select * into i from public.game_session_items
    where id = target_item_id and session_id = s.id;
  if i.id is null then raise exception using errcode = '42501', message = 'item unavailable'; end if;
  if i.answer_kind = 'open' then
    normalized_text := btrim(target_answer_text);
    if target_answer_index is not null or normalized_text is null
      or char_length(normalized_text) not between 1 and 1000 then
      raise exception using errcode = '22023', message = 'invalid answer';
    end if;
  elsif target_answer_text is not null or target_answer_index is null
    or target_answer_index < 0 or target_answer_index >= jsonb_array_length(i.options) then
    raise exception using errcode = '22023', message = 'invalid answer';
  end if;
  select completed_at into locked_at from public.game_session_sides
    where session_id = s.id and actor_role = actor.caller_role;
  if locked_at is not null then
    select * into existing from public.game_session_answers
      where item_id = i.id and actor_role = actor.caller_role;
    if existing.item_id is not null and existing.answer_text is not distinct from normalized_text
      and existing.answer_index is not distinct from target_answer_index then
      return private.m11a_session_state(s.id, actor.caller_couple, actor.caller_role);
    end if;
    raise exception using errcode = '42501', message = 'answer locked';
  end if;
  insert into public.game_session_answers(item_id, actor_role, answer_text, answer_index)
    values(i.id, actor.caller_role, normalized_text, target_answer_index)
    on conflict (item_id, actor_role) do update
      set answer_text = excluded.answer_text, answer_index = excluded.answer_index, updated_at = now();
  return private.m11a_session_state(s.id, actor.caller_couple, actor.caller_role);
end;
$$;

create function public.complete_game_session_side(target_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; s public.game_sessions%rowtype; required_count integer; answered_count integer;
  locked_at timestamptz;
begin
  select * into actor from private.m11a_actor();
  -- One lock order for save/finalize/seen. Concurrent partner completions
  -- serialize here; the second one sets completed_at exactly once.
  select * into s from public.game_sessions
    where id = target_session_id and couple_id = actor.caller_couple for update;
  if s.id is null then raise exception using errcode = '42501', message = 'session unavailable'; end if;
  select completed_at into locked_at from public.game_session_sides
    where session_id = s.id and actor_role = actor.caller_role;
  if locked_at is not null then
    return private.m11a_session_state(s.id, actor.caller_couple, actor.caller_role);
  end if;
  select count(*), count(a.item_id) into required_count, answered_count
    from public.game_session_items i
    left join public.game_session_answers a on a.item_id = i.id and a.actor_role = actor.caller_role
    where i.session_id = s.id;
  if required_count = 0 or answered_count <> required_count then
    raise exception using errcode = '22023', message = 'answer required';
  end if;
  update public.game_session_sides set completed_at = now()
    where session_id = s.id and actor_role = actor.caller_role;
  if (select count(*) from public.game_session_sides side
      where side.session_id = s.id and side.completed_at is not null) = 2 then
    update public.game_sessions set completed_at = coalesce(completed_at, now()) where id = s.id;
  end if;
  return private.m11a_session_state(s.id, actor.caller_couple, actor.caller_role);
end;
$$;

create function public.mark_game_session_reveal_seen(target_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; s public.game_sessions%rowtype;
begin
  select * into actor from private.m11a_actor();
  select * into s from public.game_sessions
    where id = target_session_id and couple_id = actor.caller_couple for update;
  if s.id is null then raise exception using errcode = '42501', message = 'session unavailable'; end if;
  if s.completed_at is null then raise exception using errcode = '42501', message = 'reveal not ready'; end if;
  update public.game_session_sides set reveal_seen_at = coalesce(reveal_seen_at, now())
    where session_id = s.id and actor_role = actor.caller_role;
  return private.m11a_session_state(s.id, actor.caller_couple, actor.caller_role);
end;
$$;

revoke all on function public.create_couple_question(uuid, text, text, jsonb) from public, anon;
revoke all on function public.list_couple_questions() from public, anon;
revoke all on function public.update_couple_question(uuid, integer, text, text, jsonb) from public, anon;
revoke all on function public.archive_couple_question(uuid) from public, anon;
revoke all on function public.start_custom_game_session(uuid, uuid) from public, anon;
revoke all on function public.list_game_sessions() from public, anon;
revoke all on function public.get_game_session(uuid) from public, anon;
revoke all on function public.save_game_session_answer(uuid, uuid, text, smallint) from public, anon;
revoke all on function public.complete_game_session_side(uuid) from public, anon;
revoke all on function public.mark_game_session_reveal_seen(uuid) from public, anon;
grant execute on function public.create_couple_question(uuid, text, text, jsonb) to authenticated;
grant execute on function public.list_couple_questions() to authenticated;
grant execute on function public.update_couple_question(uuid, integer, text, text, jsonb) to authenticated;
grant execute on function public.archive_couple_question(uuid) to authenticated;
grant execute on function public.start_custom_game_session(uuid, uuid) to authenticated;
grant execute on function public.list_game_sessions() to authenticated;
grant execute on function public.get_game_session(uuid) to authenticated;
grant execute on function public.save_game_session_answer(uuid, uuid, text, smallint) to authenticated;
grant execute on function public.complete_game_session_side(uuid) to authenticated;
grant execute on function public.mark_game_session_reveal_seen(uuid) to authenticated;;
