-- Gate 1.5A: additive reliability foundation for idempotent Ti penso sends.
-- Remote schema baseline verified on 2026-09-10. No legacy table is replaced or dropped.
-- Stable relationship roles preserve ownership across claim_us_role re-pair.

create table public.think_send_receipts (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  actor_role text not null check (actor_role in ('francesco', 'beatrice')),
  operation_id uuid not null,
  message_id uuid not null unique references public.shared_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (couple_id, actor_role, operation_id)
);

create index think_send_receipts_couple_created_idx
  on public.think_send_receipts(couple_id, created_at desc);

alter table public.think_send_receipts enable row level security;
alter table public.think_send_receipts force row level security;
revoke all on public.think_send_receipts from public, anon, authenticated;

create or replace function public.send_think_signal(operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_couple uuid;
  v_actor_role text;
  partner_id uuid;
  partner_role text;
  existing_receipt public.think_send_receipts%rowtype;
  created_message_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if operation_id is null then
    raise exception using errcode = '22004', message = 'operation_id required';
  end if;

  select profile.couple_id, profile.role
    into current_couple, v_actor_role
  from public.profiles as profile
  where profile.id = actor_id
    and profile.couple_id = private.current_couple_id()
    and profile.role in ('francesco', 'beatrice');

  if current_couple is null or v_actor_role is null then
    raise exception using errcode = '42501', message = 'couple membership required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_couple::text || ':' || v_actor_role || ':' || operation_id::text, 0)
  );

  select receipt.* into existing_receipt
  from public.think_send_receipts as receipt
  where receipt.couple_id = current_couple
    and receipt.actor_role = v_actor_role
    and receipt.operation_id = send_think_signal.operation_id;

  if existing_receipt.id is not null then
    return jsonb_build_object(
      'status', 'confirmed',
      'duplicate', true,
      'operation_id', operation_id,
      'message_id', existing_receipt.message_id
    );
  end if;

  select profile.id, profile.role
    into partner_id, partner_role
  from public.profiles as profile
  where profile.couple_id = current_couple
    and profile.id <> actor_id
    and profile.role in ('francesco', 'beatrice')
  order by profile.role, profile.id
  limit 1;

  if partner_id is null or partner_role is null or partner_role = v_actor_role then
    raise exception using errcode = 'P0001', message = 'partner missing';
  end if;

  insert into public.shared_messages(couple_id, sender_id, recipient_id, kind, body)
  values (current_couple, actor_id, partner_id, 'think', 'Ti penso')
  returning id into created_message_id;

  insert into public.think_send_receipts(
    couple_id, actor_role, operation_id, message_id
  ) values (
    current_couple, v_actor_role, operation_id, created_message_id
  );

  return jsonb_build_object(
    'status', 'confirmed',
    'duplicate', false,
    'operation_id', operation_id,
    'message_id', created_message_id
  );
end;
$$;

revoke all on function public.send_think_signal(uuid) from public, anon, authenticated;
grant execute on function public.send_think_signal(uuid) to authenticated;

comment on table public.think_send_receipts is
  'Domain-specific idempotency receipts for authenticated Ti penso sends, scoped by couple and stable actor role.';
