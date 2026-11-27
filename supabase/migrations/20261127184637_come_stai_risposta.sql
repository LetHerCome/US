-- Come stai che conta (grill del founder del 27/11/2026, D7/D16; eccezione
-- alla decisione del 02/11 «nessuna notifica per Come stai», che riguardava
-- i cambi di stato).
--
-- Under the partner's state one fitting gesture, one tap: giù/non sto bene →
-- abbraccio, stanco → riposati, nervoso → respira, felice/innamorato → cuore,
-- festa → festa, lavoro/studio → forza, palestra → spacca, viaggio →
-- buon_viaggio, tavola → buon_appetito. One answer per state shown (keyed by
-- its set_at); then the button says «Mandato ♡» and the other person gets a
-- push (send-web-push status_response) and sees it on their character.
--
-- * Minimal, no history (D12): the answer sits on the row of the person whose
--   state it answers (reply_gesture, reply_at) and goes away with that state:
--   a new state, or none, clears it (the trigger). reply_sent_at, on the row
--   of who answered, is only the rate limit (one answer every 2 minutes).
-- * Only respond_member_status writes the three columns: a phone updating its
--   own row (RLS lets the owner update it) cannot write, move or clear them.
-- * respond_member_status is SECURITY DEFINER (it writes the partner's row):
--   pinned search_path, the caller's couple from the server, the partner must
--   still be in it, the state must still be showing and be the same instance
--   the phone saw, and the gesture must be the one of that state.
-- * Realtime and RLS are unchanged: the couple already reads both rows, so the
--   answer reaches the other phone on the app's one channel.
-- Re-applying this migration changes nothing.

alter table public.member_status add column if not exists reply_gesture text;
alter table public.member_status add column if not exists reply_at timestamp with time zone;
alter table public.member_status add column if not exists reply_sent_at timestamp with time zone;

alter table public.member_status drop constraint if exists member_status_reply_gesture_check;
alter table public.member_status add constraint member_status_reply_gesture_check check (reply_gesture is null or reply_gesture in (
  'abbraccio', 'riposati', 'respira', 'cuore', 'festa', 'forza', 'spacca', 'buon_viaggio', 'buon_appetito'));
alter table public.member_status drop constraint if exists member_status_reply_times_check;
alter table public.member_status add constraint member_status_reply_times_check check ((reply_gesture is null) = (reply_at is null));

comment on column public.member_status.reply_gesture is 'Come stai che conta (27/11/2026): the gesture the partner sent to this state (one per state); cleared with the state.';
comment on column public.member_status.reply_at is 'When the partner sent reply_gesture (server time).';
comment on column public.member_status.reply_sent_at is 'When this person last answered the partner''s state: the rate limit of respond_member_status only.';

-- The one gesture that fits each of the twelve (member-status.js GESTURES).
create or replace function private.member_status_gesture(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'giu' then 'abbraccio'
    when 'malato' then 'abbraccio'
    when 'stanco' then 'riposati'
    when 'nervoso' then 'respira'
    when 'felice' then 'cuore'
    when 'innamorato' then 'cuore'
    when 'festa' then 'festa'
    when 'lavoro' then 'forza'
    when 'studio' then 'forza'
    when 'palestra' then 'spacca'
    when 'viaggio' then 'buon_viaggio'
    when 'tavola' then 'buon_appetito'
  end;
$$;
revoke all on function private.member_status_gesture(text) from public, anon, authenticated;

-- The times are the server's (as in member_status_v1), and now the answer:
-- written only by respond_member_status (its owner, never a client role), and
-- gone as soon as the state it answered is gone.
create or replace function private.member_status_server_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.reply_gesture := null;
      new.reply_at := null;
      new.reply_sent_at := null;
    else
      new.reply_gesture := old.reply_gesture;
      new.reply_at := old.reply_at;
      new.reply_sent_at := old.reply_sent_at;
    end if;
  end if;
  if new.status is null then
    new.set_at := null;
    new.expires_at := null;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status
        or old.expires_at is null or old.expires_at <= pg_catalog.now() then
    new.set_at := pg_catalog.now();
    new.expires_at := pg_catalog.now() + interval '12 hours';
  else
    new.set_at := old.set_at;
    new.expires_at := old.expires_at;
  end if;
  -- A new state, or none: the answer to the old one goes with it.
  if new.set_at is null or tg_op = 'INSERT' or new.set_at is distinct from old.set_at then
    new.reply_gesture := null;
    new.reply_at := null;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function private.member_status_server_time() from public, anon, authenticated;

-- One gesture to the partner's state (D7/D16). p_status_set_at: the set_at the
-- phone shows, so an answer never lands on a newer state. The same answer
-- again returns what is saved (already: true), so a retry is harmless.
create or replace function public.respond_member_status(p_status_set_at timestamp with time zone, p_gesture text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid := private.current_couple_id();
  now_at timestamp with time zone := pg_catalog.now();
  target record;
  last_sent timestamp with time zone;
begin
  if uid is null or cid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_gesture is null or p_gesture not in ('abbraccio', 'riposati', 'respira', 'cuore', 'festa', 'forza', 'spacca', 'buon_viaggio', 'buon_appetito') then
    raise exception using errcode = '22023', message = 'gesture invalid';
  end if;

  select s.user_id, s.status, s.set_at, s.expires_at, s.reply_gesture, s.reply_at into target
  from public.member_status s
  join public.profiles p on p.id = s.user_id and p.couple_id = s.couple_id
  where s.couple_id = cid and s.user_id <> uid
  limit 1
  for update of s;

  if target.user_id is null or target.status is null or target.expires_at <= now_at then
    raise exception using errcode = 'P0002', message = 'status gone';
  end if;
  if p_status_set_at is null
     or pg_catalog.date_trunc('milliseconds', target.set_at) <> pg_catalog.date_trunc('milliseconds', p_status_set_at) then
    raise exception using errcode = 'P0002', message = 'status changed';
  end if;
  if p_gesture <> private.member_status_gesture(target.status) then
    raise exception using errcode = '22023', message = 'gesture invalid';
  end if;
  if target.reply_gesture is not null then
    return pg_catalog.jsonb_build_object('gesture', target.reply_gesture, 'at', target.reply_at, 'set_at', target.set_at, 'already', true);
  end if;

  select s.reply_sent_at into last_sent from public.member_status s where s.user_id = uid;
  if last_sent is not null and last_sent > now_at - interval '2 minutes' then
    raise exception using errcode = 'P0001', message = 'rate limited';
  end if;

  update public.member_status s
  set reply_gesture = p_gesture, reply_at = now_at
  where s.user_id = target.user_id;

  insert into public.member_status as s (user_id, couple_id, reply_sent_at)
  values (uid, cid, now_at)
  on conflict (user_id) do update
    set couple_id = excluded.couple_id, reply_sent_at = excluded.reply_sent_at;

  return pg_catalog.jsonb_build_object('gesture', p_gesture, 'at', now_at, 'set_at', target.set_at, 'already', false);
end;
$$;
revoke all on function public.respond_member_status(timestamp with time zone, text) from public, anon;
grant execute on function public.respond_member_status(timestamp with time zone, text) to authenticated;
