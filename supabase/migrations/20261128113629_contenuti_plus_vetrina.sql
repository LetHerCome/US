-- US Plus in vetrina (founder, 28/11/2026): the Plus questions of content 1.2
-- are played only with Plus, but they are seen in Gioca: a tile «Sbloccabili
-- con US Plus» and, inside, every one of them with a lock. The catalog stays
-- server-only; this function returns only the words to read (no answers, no
-- ids), in the reader's language, and whether the couple already has Plus.
create or replace function public.get_plus_preview_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid := private.current_couple_id();
  en boolean;
begin
  if uid is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  en := coalesce((select p.locale from public.profiles p where p.id = uid), 'it') like 'en%';
  return pg_catalog.jsonb_build_object(
    'has_plus', cid is not null and private.couple_has_plus(cid, pg_catalog.now()),
    'items', coalesce((
      select pg_catalog.jsonb_agg(x.item order by x.family, x.topic, x.q)
        from (
          select c.family, c.topic, c.question_text as q,
                 pg_catalog.jsonb_build_object('family', c.family, 'theme', pg_catalog.split_part(c.topic, '_', 1),
                   'q', case when en then coalesce(c.question_text_en, c.question_text) else c.question_text end) as item
            from public.game_v2_catalog c
           where c.active and c.plus
          union all
          select 'swipe', s.topic, s.question_text,
                 pg_catalog.jsonb_build_object('family', 'swipe', 'theme', pg_catalog.split_part(s.topic, '_', 1),
                   'q', case when en then coalesce(s.question_text_en, s.question_text) else s.question_text end)
            from private.game_swipe_v1_catalog s
           where s.active and s.plus
        ) x), '[]'::jsonb));
end;
$$;
revoke all on function public.get_plus_preview_v1() from public, anon;
grant execute on function public.get_plus_preview_v1() to authenticated;
