-- US 2.0 F1C — Authority / RLS write-boundary hardening.
--
-- RLS decides WHICH rows a role may touch; a table-wide UPDATE grant then lets
-- that role rewrite EVERY column of those rows, including the columns that
-- decide identity, couple membership, sender/recipient and ownership. F1C
-- reproduced (rollback-only) on production, as an authenticated partner:
--   profiles           couple_id -> null / another couple (re-scopes
--                      private.current_couple_id() and every policy on it),
--                      role changed once the couple slot is free;
--   shared_messages    the recipient rewrites sender_id, body and kind;
--   shared_events      any couple member rewrites created_by;
--   calendar_reminders the requester re-points entry_id / recipient_id
--                      (UPDATE WITH CHECK never re-validates them).
--
-- Fix: grants only, sized to what the shipped client actually writes (see
-- docs/us-2.0/F1C_AUTHORITY_RLS_HARDENING.md). No policy, trigger, function,
-- row or service_role change. Revoking the table-level privilege first is
-- required: a table-wide UPDATE grant would otherwise override column grants.

-- profiles: the client only ever writes avatar_path (app.js profile photo).
revoke update on table public.profiles from authenticated, anon;
grant update (avatar_path) on table public.profiles to authenticated;

-- shared_messages: the client never updates a message (sends go through the
-- send_think RPC, reads are SELECT/Realtime). No UPDATE at all.
revoke update on table public.shared_messages from authenticated, anon;

-- shared_events: the editor updates exactly these content columns
-- (events.js saveEvent payload); updated_at is set by its BEFORE UPDATE
-- trigger. couple_id / created_by / id / created_at stay immutable.
revoke update on table public.shared_events from authenticated, anon;
grant update (title, event_date, event_time, location, note, recurs_yearly) on table public.shared_events to authenticated;

-- calendar_reminders: client writes were removed in M9C (89fd9a1); only the
-- service-role worker writes (sent_at). Browser keeps SELECT only.
revoke insert, update, delete on table public.calendar_reminders from authenticated, anon;

-- Self-check: abort the migration if the intended boundary does not hold.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.profiles', 'couple_id'), ('public.profiles', 'role'), ('public.profiles', 'id'),
      ('public.profiles', 'display_name'), ('public.profiles', 'created_at'),
      ('public.shared_messages', 'sender_id'), ('public.shared_messages', 'recipient_id'),
      ('public.shared_messages', 'couple_id'), ('public.shared_messages', 'body'),
      ('public.shared_messages', 'kind'), ('public.shared_messages', 'opened_at'),
      ('public.shared_events', 'couple_id'), ('public.shared_events', 'created_by'),
      ('public.shared_events', 'id'), ('public.shared_events', 'created_at'),
      ('public.calendar_reminders', 'entry_id'), ('public.calendar_reminders', 'recipient_id'),
      ('public.calendar_reminders', 'requested_by'), ('public.calendar_reminders', 'couple_id'),
      ('public.calendar_reminders', 'sent_at')
    ) as t(tbl, col)
  loop
    if has_column_privilege('authenticated', r.tbl, r.col, 'UPDATE') or has_column_privilege('anon', r.tbl, r.col, 'UPDATE') then
      raise exception 'F1C: %.% is still updatable by a client role', r.tbl, r.col;
    end if;
  end loop;

  if not has_column_privilege('authenticated', 'public.profiles', 'avatar_path', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.shared_events', 'title', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.shared_events', 'recurs_yearly', 'UPDATE') then
    raise exception 'F1C: a legitimate client edit lost its UPDATE grant';
  end if;

  if has_table_privilege('authenticated', 'public.calendar_reminders', 'INSERT')
     or has_table_privilege('authenticated', 'public.calendar_reminders', 'DELETE')
     or not has_table_privilege('authenticated', 'public.calendar_reminders', 'SELECT')
     or not has_table_privilege('service_role', 'public.calendar_reminders', 'UPDATE') then
    raise exception 'F1C: calendar_reminders boundary is wrong';
  end if;
end
$$;
