-- Promemoria degli impegni (audit della produzione, 05/11/2026, punto 12).
--
-- The insert rule of calendar_reminders compared columns with themselves
-- (p.couple_id = p.couple_id, e.couple_id = e.couple_id): inside the
-- subqueries the unqualified couple_id resolved to the subquery's own table.
-- It was never exploitable: authenticated has no INSERT on calendar_reminders
-- (only SELECT, baseline), and the RLS of profiles and calendar_entries already
-- hides the other couples' rows from those subqueries (checked on 05/11 with
-- the old rule in PGlite). The rule now says what it means, before reminders
-- come back in the app. Bringing them back also needs an RPC or EXECUTE on the
-- two CHECK functions, revoked from the app by F1B.
--
-- Only the rule changes: same name, same role, same intent. Nothing is
-- granted, no row is touched. Re-applying it changes nothing.

alter policy calendar_reminders_insert_couple on public.calendar_reminders
  with check (
    couple_id = (select private.current_couple_id())
    and requested_by = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = calendar_reminders.recipient_id
        and p.couple_id = calendar_reminders.couple_id)
    and exists (
      select 1 from public.calendar_entries e
      where e.id = calendar_reminders.entry_id
        and e.couple_id = calendar_reminders.couple_id
        and (e.entry_type = 'shared' or e.owner_id = (select auth.uid())))
  );
