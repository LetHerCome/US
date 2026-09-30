-- M11D — Game V2 push, on the existing web-push infrastructure.
--
-- Prepared only: apply together with M11B and M11C; deploy the two new Edge
-- Functions game-v2-push and game-v2-push-worker with it. send-web-push is
-- not changed.
--
-- Events (all to the PARTNER or the assigned role, never to the actor):
--   game_waiting         "<nome> ha risposto. Ora tocca a te."
--   game_reveal          "Le vostre risposte sono pronte ♡" to whoever finished first
--   game_weekly_created  "<nome> ha lasciato la domanda della settimana ♡" (never its text)
--   game_weekly_turn     the assigned role, once per Europe/Rome week, if not created yet
-- No payload ever carries a question, an answer, a prediction result or a
-- context source. There is no standalone "Per voi" nudge: Per voi rounds use
-- the waiting and reveal events like every other round.
--
-- Authority: the events are derived here, in SQL, from the same tables and
-- the same clock as Game V2. game-v2-push (fast path, called by the actor's
-- client with an id) and game-v2-push-worker (recovery + weekly turn, cron
-- only, dedicated vault key) both ask these service-role functions what to
-- send; neither trusts a client-supplied role, couple or recipient. Dedupe
-- keys are role-based, so a re-pair never re-notifies:
--   game-waiting:<session>:<role>        game-reveal:<session>:<role>
--   game-weekly-created:<couple>:<week>  game-weekly-turn:<couple>:<week>
--
-- Additive. The "games" preference joins notification_preferences (default
-- on, like every other key); the preference RPCs are re-created with it.

-- ---------------------------------------------------------------------------
-- 1. Preference.
-- ---------------------------------------------------------------------------

alter table public.notification_preferences
  add column if not exists games boolean not null default true;

create or replace function public.get_notification_preferences()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prefs public.notification_preferences%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into prefs from public.notification_preferences where user_id = uid;
  if not found then
    insert into public.notification_preferences(user_id) values(uid)
    on conflict(user_id) do nothing;
    select * into prefs from public.notification_preferences where user_id = uid;
  end if;
  return jsonb_build_object(
    'think', prefs.think,
    'today', prefs.today,
    'bond', prefs.bond,
    'relationship', prefs.relationship,
    'left_for_you', prefs.left_for_you,
    'games', prefs.games
  );
end;
$$;

create or replace function public.set_notification_preference(target_key text, target_value boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prefs public.notification_preferences%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if target_key not in ('think', 'today', 'bond', 'relationship', 'left_for_you', 'games') then
    raise exception 'Invalid preference';
  end if;
  insert into public.notification_preferences(user_id) values(uid)
  on conflict(user_id) do nothing;
  if target_key = 'think' then
    update public.notification_preferences set think = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'today' then
    update public.notification_preferences set today = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'bond' then
    update public.notification_preferences set bond = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'relationship' then
    update public.notification_preferences set relationship = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'left_for_you' then
    update public.notification_preferences set left_for_you = target_value, updated_at = now() where user_id = uid;
  else
    update public.notification_preferences set games = target_value, updated_at = now() where user_id = uid;
  end if;
  select * into prefs from public.notification_preferences where user_id = uid;
  return jsonb_build_object(
    'think', prefs.think,
    'today', prefs.today,
    'bond', prefs.bond,
    'relationship', prefs.relationship,
    'left_for_you', prefs.left_for_you,
    'games', prefs.games
  );
end;
$$;

-- create or replace keeps the existing privileges of both RPCs.

-- ---------------------------------------------------------------------------
-- 2. Event authority (service role only).
-- ---------------------------------------------------------------------------

create function private.game_v2_push_event(kind text, couple uuid, recipient text, sender text, reference text)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('kind', kind, 'couple_id', couple, 'recipient_role', recipient, 'sender_role', sender,
    'reference', reference,
    'dedupe_key', case kind
      when 'game_waiting' then 'game-waiting:' || reference || ':' || recipient
      when 'game_reveal' then 'game-reveal:' || reference || ':' || recipient
      when 'game_weekly_created' then 'game-weekly-created:' || couple::text || ':' || reference
      when 'game_weekly_turn' then 'game-weekly-turn:' || couple::text || ':' || reference end);
$$;
revoke all on function private.game_v2_push_event(text, uuid, text, text, text) from public, anon, authenticated;

-- Fast path after a finalize: the actor's own side must be complete.
--   partner still to answer            -> game_waiting to the partner
--   round revealed, partner was first  -> game_reveal to the partner
--   anything else                      -> null (nothing to send)
create function public.game_v2_push_for_session(target_session_id uuid, actor_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a_couple uuid; a_role text; session_couple uuid; session_done timestamptz;
  my_done timestamptz; p_role text; partner_done timestamptz; partner_seen timestamptz;
begin
  select p.couple_id, p.role into a_couple, a_role from public.profiles p where p.id = actor_id;
  if a_couple is null or a_role not in ('francesco', 'beatrice') then return null; end if;
  select s.couple_id, s.completed_at into session_couple, session_done from public.game_sessions s
    where s.id = target_session_id and s.couple_id = a_couple and s.engine_version = 2;
  if session_couple is null then return null; end if;
  select d.completed_at into my_done from public.game_session_sides d
    where d.session_id = target_session_id and d.actor_role = a_role;
  select d.actor_role, d.completed_at, d.reveal_seen_at into p_role, partner_done, partner_seen
    from public.game_session_sides d where d.session_id = target_session_id and d.actor_role <> a_role;
  if my_done is null or p_role is null then return null; end if;
  if session_done is null then
    return private.game_v2_push_event('game_waiting', a_couple, p_role, a_role, target_session_id::text);
  end if;
  -- Whoever finished first (ties broken by role) is the one still waiting.
  if partner_done is not null and (partner_done, p_role) < (my_done, a_role) and partner_seen is null then
    return private.game_v2_push_event('game_reveal', a_couple, p_role, null, target_session_id::text);
  end if;
  return null;
end;
$$;

-- Fast path after creating this week's question: only its author, only for
-- the current Europe/Rome week.
create function public.game_v2_push_for_weekly(target_question_id uuid, actor_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a_couple uuid; a_role text; week date := private.game_v2_week_start(private.game_v2_clock());
begin
  select p.couple_id, p.role into a_couple, a_role from public.profiles p where p.id = actor_id;
  if a_couple is null or a_role not in ('francesco', 'beatrice') then return null; end if;
  if not exists (select 1 from public.couple_questions q
      where q.id = target_question_id and q.couple_id = a_couple and q.origin = 'weekly'
        and q.author_role = a_role and q.week_start = week and q.archived_at is null) then
    return null;
  end if;
  return private.game_v2_push_event('game_weekly_created', a_couple, private.game_v2_partner_role(a_role),
    a_role, week::text);
end;
$$;

-- Recovery and the weekly turn, for the cron worker. Events older than two
-- minutes that the fast path may have missed (offline client, closed PWA),
-- within 48 hours; dedupe makes a double send impossible.
create function public.game_v2_pending_pushes()
returns jsonb language sql stable security definer set search_path = '' as $$
  with clock as (select private.game_v2_clock() t),
  week as (select private.game_v2_week_start(t) w from clock),
  events as (
    select private.game_v2_push_event('game_weekly_turn', c.id, private.game_v2_weekly_role(week.w), null, week.w::text) e
    from public.couples c cross join week
    where (select count(distinct p.role) from public.profiles p
        where p.couple_id = c.id and p.role in ('francesco', 'beatrice')) = 2
      and not exists (select 1 from public.couple_questions q
        where q.couple_id = c.id and q.origin = 'weekly' and q.week_start = week.w)
    union all
    select private.game_v2_push_event('game_weekly_created', q.couple_id, private.game_v2_partner_role(q.author_role),
      q.author_role, q.week_start::text)
    from public.couple_questions q cross join week cross join clock
    where q.origin = 'weekly' and q.week_start = week.w and q.archived_at is null
      and q.created_at <= clock.t - interval '2 minutes'
    union all
    select private.game_v2_push_event('game_waiting', s.couple_id, open_side.actor_role, done_side.actor_role, s.id::text)
    from public.game_sessions s cross join clock
    join public.game_session_sides done_side on done_side.session_id = s.id and done_side.completed_at is not null
    join public.game_session_sides open_side on open_side.session_id = s.id and open_side.completed_at is null
    where s.engine_version = 2 and s.completed_at is null
      and done_side.completed_at between clock.t - interval '48 hours' and clock.t - interval '2 minutes'
    union all
    select private.game_v2_push_event('game_reveal', s.couple_id, first_side.actor_role, null, s.id::text)
    from public.game_sessions s cross join clock
    join public.game_session_sides first_side on first_side.session_id = s.id
    join public.game_session_sides last_side on last_side.session_id = s.id and last_side.actor_role <> first_side.actor_role
    where s.engine_version = 2 and s.completed_at between clock.t - interval '48 hours' and clock.t - interval '2 minutes'
      and (first_side.completed_at, first_side.actor_role) < (last_side.completed_at, last_side.actor_role)
      and first_side.reveal_seen_at is null
  )
  select coalesce(jsonb_agg(events.e order by events.e->>'dedupe_key'), '[]'::jsonb) from events;
$$;

revoke all on function public.game_v2_push_for_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.game_v2_push_for_weekly(uuid, uuid) from public, anon, authenticated;
revoke all on function public.game_v2_pending_pushes() from public, anon, authenticated;
grant execute on function public.game_v2_push_for_session(uuid, uuid) to service_role;
grant execute on function public.game_v2_push_for_weekly(uuid, uuid) to service_role;
grant execute on function public.game_v2_pending_pushes() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Worker key and schedule (pattern of M10C).
-- ---------------------------------------------------------------------------

create or replace function public.get_internal_game_v2_push_cron_key()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'us_game_v2_push_cron_key' limit 1
$$;

revoke all on function public.get_internal_game_v2_push_cron_key() from public, anon, authenticated;
grant execute on function public.get_internal_game_v2_push_cron_key() to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'us_game_v2_push_cron_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'us_game_v2_push_cron_key'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'us-game-v2-push') then
    perform cron.schedule(
      'us-game-v2-push',
      '*/10 * * * *',
      $cron$
        select net.http_post(
          url := 'https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/game-v2-push-worker',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-us-cron-key',(select decrypted_secret from vault.decrypted_secrets where name = 'us_game_v2_push_cron_key' limit 1)
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
  end if;
end
$$;
