-- Gate 1.5B: deferred logical notification authority for Ti penso.
-- Depends on 20260910013000_gate_1_5_reliability_foundation.sql.
-- This migration is local and unapplied; it is intentionally outside Gate 1.5A.

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique check (char_length(btrim(dedupe_key)) between 1 and 240),
  couple_id uuid not null references public.couples(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('francesco', 'beatrice')),
  actor_role text check (actor_role in ('francesco', 'beatrice')),
  category text not null check (category in ('partner', 'plans_memories', 'chapters_recaps')),
  event_type text not null check (char_length(btrim(event_type)) between 1 and 80),
  object_type text not null check (char_length(btrim(object_type)) between 1 and 80),
  object_id uuid not null,
  target_surface text not null check (char_length(btrim(target_surface)) between 1 and 80),
  target_state jsonb not null default '{}'::jsonb check (jsonb_typeof(target_state) = 'object'),
  in_app_copy text not null check (char_length(btrim(in_app_copy)) between 1 and 500),
  push_copy_complete text not null check (char_length(btrim(push_copy_complete)) between 1 and 500),
  push_copy_discreet text not null check (char_length(btrim(push_copy_discreet)) between 1 and 500),
  state text not null default 'pending' check (state in ('pending', 'delivered', 'read', 'opened', 'failed')),
  quiet_state text not null default 'immediate' check (quiet_state in ('immediate', 'scheduled', 'released')),
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  opened_at timestamptz
);

create index notification_events_recipient_state_created_idx
  on public.notification_events(couple_id, recipient_role, state, created_at desc);
create index notification_events_couple_object_idx
  on public.notification_events(couple_id, object_type, object_id);

alter table public.notification_events enable row level security;
alter table public.notification_events force row level security;
revoke all on public.notification_events from public, anon, authenticated;
grant select on public.notification_events to authenticated;

create policy notification_events_select_recipient
on public.notification_events
for select
to authenticated
using (
  couple_id = private.current_couple_id()
  and recipient_role = (
    select profile.role
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.couple_id = notification_events.couple_id
  )
);

alter table public.think_send_receipts
  add column notification_event_id uuid unique references public.notification_events(id) on delete cascade;

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
  created_notification_id uuid;
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
      'message_id', existing_receipt.message_id,
      'notification_event_id', existing_receipt.notification_event_id
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

  insert into public.notification_events(
    dedupe_key, couple_id, recipient_role, actor_role, category, event_type,
    object_type, object_id, target_surface, target_state,
    in_app_copy, push_copy_complete, push_copy_discreet
  ) values (
    'think.send:' || v_actor_role || ':' || operation_id::text,
    current_couple,
    partner_role,
    v_actor_role,
    'partner',
    'think_received',
    'think',
    created_message_id,
    'oggi',
    jsonb_build_object('message_id', created_message_id),
    'Il tuo partner ti pensa',
    'Il tuo partner ti pensa in US',
    'Qualcuno ha lasciato qualcosa in US'
  )
  returning id into created_notification_id;

  insert into public.think_send_receipts(
    couple_id, actor_role, operation_id, message_id, notification_event_id
  ) values (
    current_couple, v_actor_role, operation_id, created_message_id, created_notification_id
  );

  return jsonb_build_object(
    'status', 'confirmed',
    'duplicate', false,
    'operation_id', operation_id,
    'message_id', created_message_id,
    'notification_event_id', created_notification_id
  );
end;
$$;

revoke all on function public.send_think_signal(uuid) from public, anon, authenticated;
grant execute on function public.send_think_signal(uuid) to authenticated;

comment on table public.notification_events is
  'Logical notification authority. Stable couple roles survive re-pair; push delivery history remains in push_event_log.';
comment on table public.think_send_receipts is
  'Domain-specific idempotency receipts for authenticated Ti penso sends, scoped by couple and stable actor role.';
