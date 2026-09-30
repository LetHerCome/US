-- M12B.3 — Game V2: a Moment kept from a lived fact is the SAME real-life
-- source as that fact.
--
-- Problem: once a Moment can come from a lived Da vivere item (or an Event
-- completion), the moment adapter and the Da vivere adapter would offer
-- "moment:<m>" and "da_vivere:<b>" for one experience: two different sources,
-- two different cooldowns, possibly both in one round.
--
-- Rule: a candidate's source is its canonical ORIGIN. For a Moment linked in
-- public.living_provenance the source becomes the provenance source key
-- (source_kind:source_ref), e.g. 'da_vivere:<bucket_item id>', which is
-- exactly the key the Da vivere adapter already emits. The existing selector
-- ("one candidate per source_type:source_ref per round") and the existing
-- source cooldown (game_v2_cooldowns.source_days) then treat the Moment and
-- its lived fact as one experience, with no selector, cooldown or client
-- change. An unlinked Moment keeps 'moment:<id>' exactly as in M11C.
--
-- Only private.game_v2_ctx_moments is replaced (same signature, same window,
-- same caption-only title, same weekly rotation, same exception guard). It
-- reads living_provenance of the same couple only; nothing else is read.
-- Rollback: re-create the M11C body (20260930153749_m11c_game_v2_context.sql,
-- section 3); the provenance table can stay.
--
-- NOT applied in production by this milestone. Apply after
-- 20260930233000_m12b_3_living_provenance.sql.

create or replace function private.game_v2_ctx_moments(target_couple uuid, target_family text, at_time timestamptz)
returns setof private.game_v2_candidate language plpgsql stable set search_path = '' as $$
declare src jsonb; at_date date := (at_time at time zone 'Europe/Rome')::date;
  week text := private.game_v2_week_start(at_time)::text;
begin
  select coalesce(jsonb_agg(x.src), '[]'::jsonb) into src from (
    select jsonb_build_object('id', coalesce(p.source_ref, m.id)::text, 'title', t.title,
      'when', private.game_v2_when_label(t.on_day, at_date), 'origin', coalesce(p.source_kind, 'moment')) src
    from public.moments m
    left join public.living_provenance p
      on p.target_kind = 'moment' and p.target_ref = m.id and p.couple_id = m.couple_id
    cross join lateral (select private.game_v2_clean_title(m.caption) title,
      coalesce(m.moment_date, (m.created_at at time zone 'Europe/Rome')::date) as on_day) t
    where m.couple_id = target_couple and t.title is not null and t.on_day between at_date - 730 and at_date - 14
    order by md5(target_couple::text || ':' || m.id::text || ':' || week) limit 4) x;
  return query select * from private.game_v2_recipe_candidates(target_family, 'moment', 'moment',
    (select coalesce(jsonb_agg(s), '[]'::jsonb) from jsonb_array_elements(src) s where s->>'origin' = 'moment'), at_time);
  return query select * from private.game_v2_recipe_candidates(target_family, 'moment', 'da_vivere',
    (select coalesce(jsonb_agg(s), '[]'::jsonb) from jsonb_array_elements(src) s where s->>'origin' = 'da_vivere'), at_time);
  return query select * from private.game_v2_recipe_candidates(target_family, 'moment', 'shared_event_completion',
    (select coalesce(jsonb_agg(s), '[]'::jsonb) from jsonb_array_elements(src) s where s->>'origin' = 'shared_event_completion'), at_time);
exception when others then
  raise warning 'game_v2 context adapter moments skipped: %', sqlerrm;
  return;
end;
$$;

revoke all on function private.game_v2_ctx_moments(uuid, text, timestamptz) from public, anon, authenticated;
