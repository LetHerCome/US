-- Gioca: tre partite al giorno (founder, 13/11/2026, verso l'uscita pubblica).
--
-- Replaces the one round a day of gioca_daily_limit_v1 (D4 del 28/10): the
-- couple starts up to three new rounds per Europe/Rome day, of any mode. The
-- app shows how many are left; unlimited rounds stay for US Plus.
--
-- Only the private budget changes: game_v2_week_usage already reads the day
-- limit from here, and start_game_round, start_swipe_round and
-- get_game_v2_home read everything from game_v2_week_usage. Same payload keys
-- and error messages, so the installed app keeps working (it already counts
-- "N partite da giocare oggi" from limit and used).

create or replace function private.game_v2_week_limits()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('day', 3, 'open', 3);
$$;

revoke all on function private.game_v2_week_limits() from public, anon, authenticated, service_role;
