-- Il vostro mese, carta «Dove siete stati» (ritocchi del founder, 28/11/2026):
-- una vera cartina. Ogni posto porta anche le coordinate del suo ricordo (già
-- arrotondate a ~100 m da ricordi_place_v1) e il giorno, per i puntini e la
-- linea in ordine di data. Stessa funzione e stessa autorizzazione: solo i
-- ricordi della coppia (mo.couple_id = p_couple), che la coppia legge già.
--
-- One card as the app shows it: the reference plus what it points to, read
-- now. Gone (the memory deleted, an answer no longer there): «gone».
create or replace function private.us_mese_card(p_couple uuid, p_card jsonb, p_role text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  k text := p_card ->> 'k';
  src text := p_card ->> 'src';
  ref uuid;
  base jsonb := pg_catalog.jsonb_build_object('k', p_card ->> 'k', 'rare', coalesce((p_card ->> 'rare')::boolean, false), 'day', p_card -> 'day');
  body jsonb;
  other text := case when p_role = 'beatrice' then 'francesco' else 'beatrice' end;
begin
  if src in ('moment', 'keepsake', 'question', 'conserva', 'bucket', 'game_item') then ref := (p_card ->> 'id')::uuid; end if;
  if src = 'moment' then
    select pg_catalog.jsonb_build_object('path', mo.storage_path, 'caption', mo.caption, 'place', mo.place_label, 'date', mo.moment_date,
             'by', (select p.role from public.profiles p where p.id = mo.created_by and p.couple_id = p_couple),
             'pin', pg_catalog.jsonb_build_object('source', 'moment', 'id', mo.id),
             'pinned', exists (select 1 from public.us_bacheca_pins x where x.couple_id = p_couple and x.ref_key = 'moment:' || mo.id))
      into body from public.moments mo where mo.id = ref and mo.couple_id = p_couple;
  elsif src = 'keepsake' then
    select pg_catalog.jsonb_build_object('question', k2.question_text,
             'mine', case when p_role = 'beatrice' then k2.beatrice_answer else k2.francesco_answer end,
             'theirs', case when p_role = 'beatrice' then k2.francesco_answer else k2.beatrice_answer end,
             'pin', pg_catalog.jsonb_build_object('source', 'keepsake', 'id', k2.id),
             'pinned', exists (select 1 from public.us_bacheca_pins x where x.couple_id = p_couple and x.ref_key = 'keepsake:' || k2.id))
      into body from public.daily_question_keepsakes k2 where k2.id = ref and k2.couple_id = p_couple;
  elsif src = 'question' then
    -- Both answers still there and both read.
    select pg_catalog.jsonb_build_object('question', q.question,
             'mine', (select a.answer from public.daily_answers a join public.profiles p on p.id = a.user_id and p.couple_id = p_couple and p.role = p_role
                       where a.question_id = q.id and a.couple_id = p_couple limit 1),
             'theirs', (select a.answer from public.daily_answers a join public.profiles p on p.id = a.user_id and p.couple_id = p_couple and p.role = other
                         where a.question_id = q.id and a.couple_id = p_couple limit 1))
      into body from public.daily_questions q
     where q.id = ref
       and (select pg_catalog.count(*) from public.daily_question_reveal_states r where r.couple_id = p_couple and r.question_id = q.id and r.reveal_seen_at is not null) >= 2;
    if body is not null and (body ->> 'mine' is null or body ->> 'theirs' is null) then body := null; end if;
  elsif src = 'conserva' then
    select pg_catalog.jsonb_build_object('body', lf.body,
             'by', (select p.role from public.profiles p where p.id = lf.sender_id and p.couple_id = p_couple),
             'pin', pg_catalog.jsonb_build_object('source', 'conserva', 'id', cc.id),
             'pinned', exists (select 1 from public.us_bacheca_pins x where x.couple_id = p_couple and x.ref_key = 'conserva:' || cc.id))
      into body from public.conserva_contributions cc join public.left_for_you lf on lf.id = cc.source_item_id and lf.couple_id = p_couple
     where cc.id = ref and cc.couple_id = p_couple;
  elsif src = 'bucket' then
    select pg_catalog.jsonb_build_object('title', b.title) into body
      from public.bucket_items b where b.id = ref and b.couple_id = p_couple and b.status = 'lived';
  elsif src = 'game_item' then
    select pg_catalog.jsonb_build_object('question', i.question_text,
             'chosen', i.options ->> a.answer_index::int, 'other', i.options ->> (1 - a.answer_index)::int)
      into body
      from public.game_session_items i
      join public.game_sessions s on s.id = i.session_id and s.couple_id = p_couple
      join public.game_session_answers a on a.item_id = i.id and a.answer_index in (0, 1)
     where i.id = ref limit 1;
  elsif src = 'numeri' or src = 'intesa' then
    body := coalesce(p_card -> 'v', '{}'::jsonb);
  elsif src = 'posti' then
    select pg_catalog.jsonb_build_object(
             'places', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('label', mo.place_label, 'nuovo', coalesce(p_card -> 'v' -> 'nuovi', '[]'::jsonb) ? mo.id::text,
                                                                         'lat', mo.place_lat, 'lon', mo.place_lon, 'day', mo.moment_date) order by t.n),
             'nuovi', (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements_text(coalesce(p_card -> 'v' -> 'nuovi', '[]'::jsonb)) e(v)
                        where exists (select 1 from public.moments o where o.id = e.v::uuid and o.couple_id = p_couple)),
             'count', (p_card -> 'v' ->> 'count')::int)
      into body
      from pg_catalog.jsonb_array_elements_text(coalesce(p_card -> 'v' -> 'ids', '[]'::jsonb)) with ordinality t(e, n)
      join public.moments mo on mo.id = t.e::uuid and mo.couple_id = p_couple and mo.place_label is not null;
    if body -> 'places' is null or pg_catalog.jsonb_typeof(body -> 'places') <> 'array' then body := null; end if;
  end if;
  if body is null then return base || '{"gone": true}'::jsonb; end if;
  return base || body || '{"gone": false}'::jsonb;
end;
$fn$;
revoke all on function private.us_mese_card(uuid, jsonb, text) from public, anon, authenticated;
