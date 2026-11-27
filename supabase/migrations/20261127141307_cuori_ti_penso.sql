-- I cuori (founder, 27/11/2026, decision «Uno solo ×N»; prototype
-- https://claude.ai/artifact/2NXZSrS4EypVcsAVBNDRVy): rapid taps on the Ti
-- penso heart add up and, when the person stops, ONE Ti penso leaves with the
-- number of taps. The partner reads «<Nome> ti ha pensato N volte ♡».
--
-- * shared_messages.think_taps: how many taps the Ti penso carries (1..99),
--   only on think rows; null on every older row and on other kinds (= 1).
-- * send_think(operation_id, p_taps default 1): the same idempotent send. An
--   old app (send_think(operation_id)) and the widget path
--   (widget_send_think_internal, unchanged) keep sending 1. A retry with the
--   same operation_id returns the first row untouched, whatever p_taps says.
--   The old one-argument function is dropped, so PostgREST never has to pick
--   between two overloads; named calls without p_taps resolve to the default.
-- Clients cannot UPDATE shared_messages (no table grant), and a direct insert
-- under RLS is held to the same 1..99 by the check.

alter table public.shared_messages add column if not exists think_taps smallint;

alter table public.shared_messages drop constraint if exists shared_messages_think_taps_check;
alter table public.shared_messages add constraint shared_messages_think_taps_check
  check (think_taps is null or (kind = 'think' and think_taps between 1 and 99));

comment on column public.shared_messages.think_taps is
  'I cuori (27/11/2026): taps of one Ti penso combo, 1..99; null = 1 (older rows, widget).';

drop function if exists public.send_think(uuid);

create function public.send_think(operation_id uuid, p_taps integer default 1)
 returns table(message_id uuid, sender_id uuid, recipient_id uuid, couple_id uuid, duplicate boolean)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  actor uuid := auth.uid();
  current_couple uuid;
  partner uuid;
  taps smallint := least(99, greatest(1, coalesce(p_taps, 1)))::smallint;
  existing public.shared_messages%rowtype;
  created public.shared_messages%rowtype;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if operation_id is null then
    raise exception using errcode = '22004', message = 'operation_id required';
  end if;

  select message.* into existing
  from public.shared_messages as message
  where message.kind = 'think'
    and message.sender_id = actor
    and message.think_operation_id = operation_id
  for update;

  if existing.id is not null then
    return query select existing.id, existing.sender_id, existing.recipient_id,
      existing.couple_id, true;
    return;
  end if;

  current_couple := private.current_couple_id();

  select p.id into partner
  from public.profiles as p
  where p.couple_id = current_couple
    and p.id <> actor
  order by p.created_at, p.id
  limit 1;

  if partner is null then
    raise exception using errcode = 'P0001', message = 'think_partner_missing';
  end if;

  insert into public.shared_messages(
    couple_id, sender_id, recipient_id, kind, body, think_operation_id, think_taps
  )
  values (
    current_couple, actor, partner, 'think', 'Ti penso', operation_id, taps
  )
  on conflict do nothing
  returning * into created;

  if created.id is null then
    select message.* into existing
    from public.shared_messages as message
    where message.kind = 'think'
      and message.sender_id = actor
      and message.think_operation_id = operation_id;

    if existing.id is null then
      raise exception using errcode = 'P0001', message = 'think_send_conflict_unresolved';
    end if;

    return query select existing.id, existing.sender_id, existing.recipient_id,
      existing.couple_id, true;
    return;
  end if;

  return query select created.id, created.sender_id, created.recipient_id,
    created.couple_id, false;
end;
$function$;

comment on function public.send_think(uuid, integer) is
  'Ti penso (I cuori, 27/11/2026): one idempotent send per operation_id, with the combo taps (1..99, default 1).';

revoke all on function public.send_think(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.send_think(uuid, integer) to authenticated, service_role;
