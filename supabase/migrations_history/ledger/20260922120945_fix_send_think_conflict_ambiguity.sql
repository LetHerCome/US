-- Production ledger 20260922120945 fix_send_think_conflict_ambiguity: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 1bffc334eea01511ebd021f8874af4ef; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.


create or replace function public.send_think(operation_id uuid)
returns table (
  message_id uuid,
  sender_id uuid,
  recipient_id uuid,
  couple_id uuid,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_couple uuid;
  partner uuid;
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
    couple_id, sender_id, recipient_id, kind, body, think_operation_id
  )
  values (
    current_couple, actor, partner, 'think', 'Ti penso', operation_id
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
$$;

revoke all on function public.send_think(uuid)
  from public, anon, authenticated;

grant execute on function public.send_think(uuid)
  to authenticated;;
