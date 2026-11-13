-- «La cosa di oggi» (founder, 13/11/2026, docs/DECISIONS.md «La cosa di oggi:
-- riquadro unico, settimana guidata e serie gentile»). One read for the Oggi
-- card: the gentle streak and the first week's steps, counted by the server
-- from the rows US already keeps. No new user data is stored.
--
-- * Streak: a day of Europe/Rome counts when both members did at least one
--   gesture (daily answer, Ti penso or another message, a finished game side,
--   a Ricordo or one of its photos, a post-it written or changed, Lasciato per
--   te, a lavagna stroke, a calendar commitment or an event). One missed day
--   in seven is forgiven; a second one ends the streak, which starts again
--   from 1 with the next counted day. Today never counts as missed: it is not
--   over. The record is the longest streak; best_before the longest before
--   the current one (the client celebrates beating it once).
-- * First week: only for couples completed (the second account joined) after
--   this migration ran. Six steps of the couple, one a day: the question (both
--   answered the same one), the first Ti penso, the first game, the first
--   Ricordo, a calendar commitment, Lasciato per te; then the widget on the
--   caller's own phone, only where the phone has widgets. A step done before
--   its turn is skipped; after a step is done the next one is ready the day
--   after. The week closes 21 days after it started. When the caller's steps
--   are all done, 100 Sintonia points, once per couple
--   (private.progression_award, milestone 'guided-week', not in the Ritmo).
-- * private.cosa_di_oggi_state takes the day and the widget state as
--   arguments (tests); public.cosa_di_oggi is the only entry point, for the
--   caller's own couple.
-- Re-applying this migration changes nothing.

create table if not exists private.feature_launches (
  feature text primary key,
  launched_at timestamptz not null default now()
);
alter table private.feature_launches enable row level security;
revoke all on table private.feature_launches from public, anon, authenticated, service_role;
insert into private.feature_launches(feature) values ('guided_week') on conflict (feature) do nothing;

create or replace function private.cosa_di_oggi_state(target_couple uuid, target_user uuid, target_day date, widget text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  members uuid[];
  partner uuid;
  since_at timestamptz := ((target_day - 400)::timestamp) at time zone 'Europe/Rome';
  day_at timestamptz := (target_day::timestamp) at time zone 'Europe/Rome';
  until_at timestamptz := ((target_day + 1)::timestamp) at time zone 'Europe/Rome';
  counted date[] := '{}';
  today_me boolean := false;
  today_partner boolean := false;
  my_think boolean := false;
  d date;
  run integer := 0;
  best_before integer := 0;
  last_miss date;
  started_at timestamptz;
  launched timestamptz;
  started_on date;
  finished date;
  keys text[];
  k text;
  done_on date;
  avail date;
  cur text;
  n_done integer := 0;
  steps jsonb := '[]'::jsonb;
  step_state text;
  week jsonb;
begin
  select array_agg(p.id order by p.id) into members from public.profiles p where p.couple_id = target_couple;
  if coalesce(array_length(members, 1), 0) <> 2 or target_user is null or not (target_user = any(members)) then
    return jsonb_build_object('streak', 0, 'record', 0, 'best_before', 0,
      'today', jsonb_build_object('counted', false, 'me', false, 'partner', false, 'my_think', false),
      'week', null);
  end if;
  partner := case when members[1] = target_user then members[2] else members[1] end;

  with acts(actor, at) as (
    select a.user_id, a.created_at from public.daily_answers a
     where a.couple_id = target_couple and a.created_at >= since_at and a.created_at < until_at
    union all
    select m.sender_id, m.created_at from public.shared_messages m
     where m.couple_id = target_couple and m.created_at >= since_at and m.created_at < until_at
    union all
    select p.id, sd.completed_at from public.game_sessions s
      join public.game_session_sides sd on sd.session_id = s.id
      join public.profiles p on p.couple_id = target_couple and p.role = sd.actor_role
     where s.couple_id = target_couple and sd.completed_at >= since_at and sd.completed_at < until_at
    union all
    select mo.created_by, mo.created_at from public.moments mo
     where mo.couple_id = target_couple and mo.created_at >= since_at and mo.created_at < until_at
    union all
    select ph.created_by, ph.created_at from public.moment_photos ph
     where ph.couple_id = target_couple and ph.created_at >= since_at and ph.created_at < until_at
    union all
    select n.created_by, n.created_at from public.couple_notes n
     where n.couple_id = target_couple and n.created_at >= since_at and n.created_at < until_at
    union all
    select n.updated_by, n.updated_at from public.couple_notes n
     where n.couple_id = target_couple and n.updated_at >= since_at and n.updated_at < until_at
    union all
    select l.sender_id, l.created_at from public.left_for_you l
     where l.couple_id = target_couple and l.created_at >= since_at and l.created_at < until_at
    union all
    select st.author_id, st.created_at from public.lavagna_strokes st
     where st.couple_id = target_couple and st.created_at >= since_at and st.created_at < until_at
    union all
    select c.created_by, c.created_at from public.calendar_entries c
     where c.couple_id = target_couple and c.created_at >= since_at and c.created_at < until_at
    union all
    select e.created_by, e.created_at from public.shared_events e
     where e.couple_id = target_couple and e.created_at >= since_at and e.created_at < until_at
  ), per_day as (
    select (a.at at time zone 'Europe/Rome')::date as day,
           count(distinct a.actor) as people,
           bool_or(a.actor = target_user) as has_me,
           bool_or(a.actor = partner) as has_partner
      from acts a
     where a.actor = any(members)
     group by 1
  )
  select coalesce(array_agg(x.day order by x.day) filter (where x.people = 2), '{}'),
         coalesce(bool_or(x.day = target_day and x.has_me), false),
         coalesce(bool_or(x.day = target_day and x.has_partner), false)
    into counted, today_me, today_partner
    from per_day x;

  -- As lived, day by day: the streak each day showed.
  if coalesce(array_length(counted, 1), 0) > 0 then
    d := counted[1];
    while d <= target_day loop
      if d = any(counted) then
        run := run + 1;
      elsif d < target_day and run > 0 then
        if last_miss is not null and d - last_miss < 7 then
          best_before := greatest(best_before, run);
          run := 0;
          last_miss := null;
        else
          last_miss := d;
        end if;
      end if;
      d := d + 1;
    end loop;
  end if;

  select exists(
    select 1 from public.shared_messages m
     where m.couple_id = target_couple and m.sender_id = target_user and m.kind = 'think'
       and m.created_at >= day_at and m.created_at < until_at
  ) into my_think;

  select max(i.used_at) into started_at
    from public.couple_invites i
   where i.couple_id = target_couple and i.used_by is not null;
  select f.launched_at into launched from private.feature_launches f where f.feature = 'guided_week';
  if started_at is not null and launched is not null and started_at >= launched then
    started_on := (started_at at time zone 'Europe/Rome')::date;
    select e.action_day into finished
      from public.progression_events e
     where e.couple_id = target_couple and e.source_kind = 'milestone' and e.source_key = 'guided-week';
    if target_day >= started_on and (target_day < started_on + 21 or finished = target_day) then
      keys := array['daily', 'think', 'game', 'moment', 'calendar', 'left'];
      if widget is distinct from 'unsupported' then keys := keys || 'widget'::text; end if;
      avail := started_on;
      foreach k in array keys loop
        if cur is not null then
          step_state := 'next';
        else
          done_on := case k
            when 'daily' then (
              select min(x.day) from (
                select max((a.created_at at time zone 'Europe/Rome')::date) as day
                  from public.daily_answers a
                 where a.couple_id = target_couple and a.user_id = any(members) and a.created_at < until_at
                 group by a.question_id
                having count(distinct a.user_id) = 2
              ) x)
            when 'think' then (
              select min((m.created_at at time zone 'Europe/Rome')::date) from public.shared_messages m
               where m.couple_id = target_couple and m.kind = 'think' and m.created_at < until_at)
            when 'game' then (
              select min((sd.completed_at at time zone 'Europe/Rome')::date) from public.game_sessions s
                join public.game_session_sides sd on sd.session_id = s.id
               where s.couple_id = target_couple and sd.completed_at < until_at)
            when 'moment' then (
              select min((mo.created_at at time zone 'Europe/Rome')::date) from public.moments mo
               where mo.couple_id = target_couple and mo.created_at < until_at)
            when 'calendar' then least(
              (select min((c.created_at at time zone 'Europe/Rome')::date) from public.calendar_entries c
                where c.couple_id = target_couple and c.created_at < until_at),
              (select min((e.created_at at time zone 'Europe/Rome')::date) from public.shared_events e
                where e.couple_id = target_couple and e.created_at < until_at))
            when 'left' then (
              select min((l.created_at at time zone 'Europe/Rome')::date) from public.left_for_you l
               where l.couple_id = target_couple and l.created_at < until_at)
            -- On the caller's phone now: counted as done before its turn.
            when 'widget' then case when widget = 'done' then started_on - 1 end
          end;
          if done_on is not null and done_on < avail then
            step_state := 'skipped';
            n_done := n_done + 1;
          elsif done_on is not null then
            step_state := 'done';
            n_done := n_done + 1;
            avail := done_on + 1;
          else
            step_state := 'current';
            cur := k;
          end if;
        end if;
        steps := steps || jsonb_build_object('key', k, 'state', step_state);
      end loop;
      week := jsonb_build_object(
        'started_on', started_on,
        'ends_on', started_on + 20,
        'total', array_length(keys, 1),
        'done', n_done,
        'steps', steps,
        'current', cur,
        'ready', cur is not null and target_day >= avail,
        'done_today', avail = target_day + 1,
        'all_done', cur is null,
        'finished_on', finished
      );
    end if;
  end if;

  return jsonb_build_object(
    'streak', run,
    'record', greatest(best_before, run),
    'best_before', best_before,
    'today', jsonb_build_object('counted', today_me and today_partner, 'me', today_me, 'partner', today_partner, 'my_think', my_think),
    'week', week
  );
end;
$function$;
revoke all on function private.cosa_di_oggi_state(uuid, uuid, date, text) from public, anon, authenticated, service_role;

create or replace function public.cosa_di_oggi(widget text default 'unsupported')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  cid uuid;
  today date := (now() at time zone 'Europe/Rome')::date;
  result jsonb;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if widget is null or widget not in ('done', 'todo', 'unsupported') then
    raise exception using errcode = '22023', message = 'widget must be done, todo or unsupported';
  end if;
  select p.couple_id into cid from public.profiles p where p.id = uid;
  if cid is null then
    raise exception using errcode = '42501', message = 'couple membership required';
  end if;
  result := private.cosa_di_oggi_state(cid, uid, today, widget);
  if coalesce((result #>> '{week,all_done}')::boolean, false) and result #>> '{week,finished_on}' is null then
    perform private.progression_award(cid, uid, 'milestone', 'guided-week', 100, now(), false, true);
    result := private.cosa_di_oggi_state(cid, uid, today, widget);
  end if;
  return result;
end;
$function$;
revoke all on function public.cosa_di_oggi(text) from public, anon;
grant execute on function public.cosa_di_oggi(text) to authenticated;
