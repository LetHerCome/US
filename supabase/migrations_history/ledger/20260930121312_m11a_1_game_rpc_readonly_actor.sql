-- Production ledger 20260930121312 m11a_1_game_rpc_readonly_actor: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 3ee33980e7ba10a9fb8d360e9e4eaece; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- M11A.1 production hotfix: read-only RPCs must not take row locks.
-- PostgREST runs STABLE functions in a READ ONLY transaction, where the
-- SELECT ... FOR SHARE inside private.m11a_actor() fails with SQLSTATE 25006.
-- Additive: no table, grant or signature changes.
--   * private.m11a_actor()        -> same membership validation, no row lock
--                                    (list_couple_questions, list_game_sessions,
--                                     get_game_session pick this up unchanged).
--   * private.m11a_actor_locked() -> same validation with FOR SHARE, used by the
--                                    mutating RPCs to keep the M11A re-pair lock.
-- CREATE OR REPLACE preserves the existing owner and EXECUTE grants.

create or replace function private.m11a_actor()
returns table (caller_couple uuid, caller_role text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  return query
    select p.couple_id, p.role from public.profiles p
    where p.id = auth.uid() and p.couple_id is not null
      and p.role in ('francesco', 'beatrice');
  if not found then
    raise exception using errcode = '42501', message = 'couple membership required';
  end if;
end;
$$;
revoke all on function private.m11a_actor() from public, anon, authenticated;

create function private.m11a_actor_locked()
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
revoke all on function private.m11a_actor_locked() from public, anon, authenticated;

create or replace function public.create_couple_question(request_id uuid, question_text text, answer_kind text, options jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; normalized jsonb; q public.couple_questions%rowtype;
begin
  select * into actor from private.m11a_actor_locked();
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

create or replace function public.update_couple_question(target_question_id uuid, expected_version integer,
  question_text text, answer_kind text, options jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; normalized jsonb; q public.couple_questions%rowtype;
begin
  select * into actor from private.m11a_actor_locked();
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

create or replace function public.archive_couple_question(target_question_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; q public.couple_questions%rowtype;
begin
  select * into actor from private.m11a_actor_locked();
  select * into q from public.couple_questions
    where id = target_question_id and couple_id = actor.caller_couple for update;
  if q.id is null then raise exception using errcode = '42501', message = 'question unavailable'; end if;
  if q.author_role <> actor.caller_role then raise exception using errcode = '42501', message = 'author only'; end if;
  update public.couple_questions set archived_at = coalesce(archived_at, now()), updated_at = now()
    where id = q.id and archived_at is null;
  return jsonb_build_object('id', q.id, 'archived', true);
end;
$$;

create or replace function public.start_custom_game_session(target_question_id uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; q public.couple_questions%rowtype; sid uuid; original_question uuid;
begin
  select * into actor from private.m11a_actor_locked();
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

create or replace function public.save_game_session_answer(target_session_id uuid, target_item_id uuid,
  target_answer_text text, target_answer_index smallint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; s public.game_sessions%rowtype; i public.game_session_items%rowtype;
  locked_at timestamptz; existing public.game_session_answers%rowtype; normalized_text text;
begin
  select * into actor from private.m11a_actor_locked();
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

create or replace function public.complete_game_session_side(target_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; s public.game_sessions%rowtype; required_count integer; answered_count integer;
  locked_at timestamptz;
begin
  select * into actor from private.m11a_actor_locked();
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

create or replace function public.mark_game_session_reveal_seen(target_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; s public.game_sessions%rowtype;
begin
  select * into actor from private.m11a_actor_locked();
  select * into s from public.game_sessions
    where id = target_session_id and couple_id = actor.caller_couple for update;
  if s.id is null then raise exception using errcode = '42501', message = 'session unavailable'; end if;
  if s.completed_at is null then raise exception using errcode = '42501', message = 'reveal not ready'; end if;
  update public.game_session_sides set reveal_seen_at = coalesce(reveal_seen_at, now())
    where session_id = s.id and actor_role = actor.caller_role;
  return private.m11a_session_state(s.id, actor.caller_couple, actor.caller_role);
end;
$$;;
