-- Ritocchi dei testi (controllo del 28/11/2026).
-- Play Us: il pegno «Una foto di te appena sveglia» presumeva il femminile:
-- diventa «Una foto di te al risveglio» (stessa lista in play-us.js).
-- Catalogo: due frasi corrette, solo se sono ancora quelle sbagliate.

create or replace function public.play_us_move(p_session uuid, p_step integer, p_kind text, p_slot integer, p_payload jsonb)
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
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_slot integer := coalesce(p_slot, 0);
  n integer;
  prefix text;
  v_path text;
  pegni text[] := array['Mi devi un caffè', 'Stasera il film lo scelgo io', 'Un vocale della buonanotte', 'Una foto di te al risveglio', 'Un massaggio di dieci minuti', 'La prossima pizza la offri tu'];
  note_id uuid;
begin
  if uid is null or cid is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  select * into s from public.play_us_sessions ps where ps.id = p_session and ps.couple_id = cid;
  if s.id is null then raise exception using errcode = '42501', message = 'not your game'; end if;
  if p_kind = 'pegno' then
    if s.status <> 'done' or p_step <> 8 then raise exception using errcode = '22023', message = 'not now'; end if;
    if (s.result->>'winner') is distinct from uid::text then raise exception using errcode = '42501', message = 'only the winner'; end if;
    if not coalesce(v_payload->>'text' = any (pegni), false) then raise exception using errcode = '22023', message = 'pegno invalid'; end if;
    if exists (select 1 from public.play_us_moves pm where pm.session_id = s.id and pm.kind = 'pegno') then
      return private.play_us_state(s.id);
    end if;
    note_id := gen_random_uuid();
    insert into public.couple_notes (id, couple_id, title, body, created_by, updated_by, color)
    values (note_id, cid, 'Pegno di Play Us', v_payload->>'text', uid, uid, 'pink');
    insert into public.play_us_moves as pm (session_id, couple_id, user_id, step, kind, slot, payload)
    values (s.id, cid, uid, 8, 'pegno', 0, pg_catalog.jsonb_build_object('text', v_payload->>'text', 'note_id', note_id));
    return private.play_us_state(s.id);
  end if;
  if s.status <> 'playing' or s.step <> p_step then raise exception using errcode = '22023', message = 'not this step'; end if;
  if pg_catalog.now() < s.step_started_at - interval '1 second'
     or pg_catalog.now() > s.step_started_at + pg_catalog.make_interval(secs => private.play_us_step_seconds(s.step) + 3) then
    raise exception using errcode = '22023', message = 'time is up';
  end if;
  if not ((p_step = 1 and p_kind in ('answer', 'done')) or (p_step = 2 and p_kind in ('photo', 'done'))
       or (p_step = 3 and p_kind in ('edit', 'done')) or (p_step = 4 and p_kind in ('guess', 'done'))
       or (p_step = 5 and p_kind in ('voice', 'gesture', 'done')) or (p_step = 6 and p_kind in ('score', 'done'))
       or (p_step = 7 and p_kind = 'ready')) then
    raise exception using errcode = '22023', message = 'kind invalid';
  end if;
  prefix := cid::text || '/' || uid::text || '/play-us/' || s.id::text || '/';
  if p_kind = 'answer' then
    if v_slot not between 0 and 2 then raise exception using errcode = '22023', message = 'slot invalid'; end if;
    n := pg_catalog.jsonb_array_length(s.items->v_slot->'o');
    if pg_catalog.jsonb_typeof(v_payload->'i') is distinct from 'number' or (v_payload->>'i')::integer not between 0 and n - 1 then
      raise exception using errcode = '22023', message = 'answer invalid';
    end if;
    v_payload := pg_catalog.jsonb_build_object('i', (v_payload->>'i')::integer);
  elsif p_kind = 'guess' then
    if v_slot not between 0 and 1 then raise exception using errcode = '22023', message = 'slot invalid'; end if;
    n := pg_catalog.jsonb_array_length(s.items->(3 + v_slot)->'o');
    if pg_catalog.jsonb_typeof(v_payload->'self') is distinct from 'number' or pg_catalog.jsonb_typeof(v_payload->'guess') is distinct from 'number'
       or (v_payload->>'self')::integer not between 0 and n - 1 or (v_payload->>'guess')::integer not between 0 and n - 1 then
      raise exception using errcode = '22023', message = 'guess invalid';
    end if;
    v_payload := pg_catalog.jsonb_build_object('self', (v_payload->>'self')::integer, 'guess', (v_payload->>'guess')::integer);
  elsif p_kind in ('photo', 'edit', 'voice') then
    v_path := v_payload->>'path';
    if p_kind = 'photo' and coalesce((v_payload->>'skipped')::boolean, false) then
      v_payload := '{"skipped": true}'::jsonb;
    elsif v_path is null or pg_catalog.left(v_path, pg_catalog.length(prefix)) <> prefix
          or v_path !~ '^[0-9a-z/_.-]+$' or pg_catalog.strpos(v_path, '..') > 0 or pg_catalog.length(v_path) > 300 then
      raise exception using errcode = '22023', message = 'path invalid';
    else
      v_payload := pg_catalog.jsonb_build_object('path', v_path);
    end if;
  elsif p_kind = 'gesture' then
    if not coalesce(v_payload->>'g' = any (array['abbraccio', 'bacio', 'cuore']), false) then raise exception using errcode = '22023', message = 'gesture invalid'; end if;
    v_payload := pg_catalog.jsonb_build_object('g', v_payload->>'g');
  elsif p_kind = 'score' then
    if pg_catalog.jsonb_typeof(v_payload->'score') is distinct from 'number' or (v_payload->>'score')::integer not between 0 and 5000 then
      raise exception using errcode = '22023', message = 'score invalid';
    end if;
    v_payload := pg_catalog.jsonb_build_object('score', (v_payload->>'score')::integer);
  else
    v_payload := '{}'::jsonb;
    v_slot := 0;
  end if;
  if p_kind in ('answer', 'guess') then
    insert into public.play_us_moves as pm (session_id, couple_id, user_id, step, kind, slot, payload)
    values (s.id, cid, uid, p_step, p_kind, v_slot, v_payload)
    on conflict on constraint play_us_moves_pkey do nothing;
  else
    insert into public.play_us_moves as pm (session_id, couple_id, user_id, step, kind, slot, payload)
    values (s.id, cid, uid, p_step, p_kind, v_slot, v_payload)
    on conflict on constraint play_us_moves_pkey do update set payload = excluded.payload, created_at = pg_catalog.now();
  end if;
  return private.play_us_state(s.id);
end;
$$;

revoke all on function public.play_us_move(uuid, integer, text, integer, jsonb) from public, anon;
grant execute on function public.play_us_move(uuid, integer, text, integer, jsonb) to authenticated;

update public.game_v2_catalog
   set question_text = pg_catalog.replace(question_text, 'per cosa lo faresti?', 'per cosa lo faremmo?'), version = version + 1
 where id = 'confrontatevi-074' and pg_catalog.strpos(question_text, 'per cosa lo faresti?') > 0;
update public.game_v2_catalog
   set question_text = pg_catalog.replace(question_text, 'un po’ casa', 'un po’ come casa'), version = version + 1
 where id = 'rivivete-048' and pg_catalog.strpos(question_text, 'un po’ casa') > 0;
