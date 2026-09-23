-- M5B security hardening — server-authoritative unseen lifecycle.
--
-- INVARIANT (M5B contract): a client MUST NOT be able to INSERT an item with
-- seen_at already populated. The only transition to seen is the recipient-only
-- RPC mark_left_item_seen; there is no client UPDATE/DELETE path.
--
-- AUDIT FINDING (remote state at application time): the live
-- left_for_you_insert_own policy validated couple/sender/recipient/kind/path
-- but did NOT constrain seen_at, and authenticated holds an INSERT grant on
-- the table, so a client could forge an already-"seen" item, bypassing the
-- server-authoritative lifecycle.
--
-- FIX: drop and recreate the INSERT policy adding `seen_at is null` to
-- WITH CHECK. The policy otherwise matches the applied
-- 20260922182210 fix (explicit same-couple partner lookup, photo namespace).
-- The RPC mark_left_item_seen is untouched: it transitions state via UPDATE
-- (owner postgres, bypassrls), never via INSERT, so this policy change is
-- invisible to it.
--
-- Forward-only. Touches only public.left_for_you. No client UPDATE/DELETE
-- grants or policies are introduced.

drop policy if exists left_for_you_insert_own on public.left_for_you;

create policy left_for_you_insert_own
  on public.left_for_you
  for insert to authenticated
  with check (
    couple_id = private.current_couple_id()
    and sender_id = auth.uid()
    and recipient_id <> sender_id
    and seen_at is null
    and exists (
      select 1 from public.profiles as partner
      where partner.id = left_for_you.recipient_id
        and partner.couple_id = private.current_couple_id()
    )
    and (
      kind <> 'photo'
      or starts_with(
        media_path,
        couple_id::text || '/' || auth.uid()::text || '/'
      )
    )
  );
