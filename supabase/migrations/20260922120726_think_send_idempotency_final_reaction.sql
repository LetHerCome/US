-- M4A Ti penso backend reconciliation.
-- This migration preserves existing shared_messages/think_reactions rows,
-- adds Web idempotency, makes reactions terminal, and enables reaction Realtime.

alter table public.shared_messages
  add column if not exists think_operation_id uuid;

create unique index if not exists shared_messages_think_operation_idx
  on public.shared_messages(sender_id, think_operation_id)
  where kind = 'think' and think_operation_id is not null;

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
  on conflict (sender_id, think_operation_id)
  do nothing
  returning * into created;

  if created.id is null then
    select message.* into existing
    from public.shared_messages as message
    where message.kind = 'think'
      and message.sender_id = actor
      and message.think_operation_id = operation_id;

    return query select existing.id, existing.sender_id, existing.recipient_id,
      existing.couple_id, true;
    return;
  end if;

  return query select created.id, created.sender_id, created.recipient_id,
    created.couple_id, false;
end;
$$;

revoke all on function public.send_think(uuid) from public, anon, authenticated;
grant execute on function public.send_think(uuid) to authenticated;

-- Align the existing widget path with the same logical operation id.
create or replace function public.widget_send_think_internal(
  p_token_hash text,
  p_action_id uuid
)
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
  credential public.widget_action_tokens%rowtype;
  receipt public.widget_action_receipts%rowtype;
  partner_id uuid;
  created_message_id uuid;
begin
  select token.* into credential
  from public.widget_action_tokens as token
  where token.token_hash = p_token_hash
    and token.scope = 'think:send'
    and token.revoked_at is null
    and token.expires_at > now()
  for update;

  if credential.id is null then
    raise exception using errcode = '28000', message = 'invalid_widget_credential';
  end if;

  select existing_receipt.* into receipt
  from public.widget_action_receipts as existing_receipt
  where existing_receipt.token_id = credential.id
    and existing_receipt.action_id = p_action_id;

  if receipt.id is not null then
    if receipt.status = 'sent' and receipt.message_id is not null then
      select message.recipient_id into partner_id
      from public.shared_messages as message
      where message.id = receipt.message_id;
      return query select receipt.message_id, credential.profile_id, partner_id,
        credential.couple_id, true;
      return;
    end if;
    raise exception using errcode = '55000', message = 'widget_action_in_progress';
  end if;

  if credential.last_action_at is not null
     and credential.last_action_at > now() - interval '2500 milliseconds' then
    raise exception using errcode = 'P0001', message = 'widget_action_rate_limited';
  end if;

  select partner.id into partner_id
  from public.profiles as partner
  where partner.couple_id = credential.couple_id
    and partner.id <> credential.profile_id
  order by partner.created_at, partner.id
  limit 1;

  if partner_id is null then
    raise exception using errcode = 'P0001', message = 'widget_partner_missing';
  end if;

  insert into public.widget_action_receipts(token_id, action_id, action_type, status)
  values (credential.id, p_action_id, 'think:send', 'processing');

  insert into public.shared_messages(
    couple_id, sender_id, recipient_id, kind, body, think_operation_id
  )
  values (
    credential.couple_id, credential.profile_id, partner_id, 'think', 'Ti penso', p_action_id
  )
  returning id into created_message_id;

  update public.widget_action_receipts as action_receipt
  set status = 'sent', message_id = created_message_id, completed_at = now()
  where action_receipt.token_id = credential.id
    and action_receipt.action_id = p_action_id;

  update public.widget_action_tokens as action_token
  set last_used_at = now(), last_action_at = now()
  where action_token.id = credential.id;

  return query select created_message_id, credential.profile_id, partner_id,
    credential.couple_id, false;
end;
$$;

revoke all on function public.widget_send_think_internal(text, uuid)
  from public, anon, authenticated;
grant execute on function public.widget_send_think_internal(text, uuid)
  to service_role;

create or replace function public.set_think_reaction(
  target_message_id uuid,
  target_reaction text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_couple uuid;
  message public.shared_messages%rowtype;
  existing public.think_reactions%rowtype;
  result public.think_reactions%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if target_reaction not in ('heart', 'hug', 'miss_you') then
    raise exception using errcode = '22023', message = 'invalid think reaction';
  end if;

  current_couple := private.current_couple_id();
  select message.* into message
  from public.shared_messages as message
  where message.id = target_message_id
    and message.kind = 'think'
    and message.couple_id = current_couple
    and message.recipient_id = auth.uid()
  for update;

  if message.id is null then
    raise exception using errcode = '42501', message = 'think recipient required';
  end if;

  select reaction.* into existing
  from public.think_reactions as reaction
  where reaction.message_id = target_message_id
  for update;

  if existing.id is not null then
    if existing.reaction = target_reaction then
      return jsonb_build_object(
        'status', 'duplicate', 'id', existing.id,
        'message_id', existing.message_id, 'reaction', existing.reaction,
        'updated_at', existing.updated_at
      );
    end if;
    raise exception using errcode = '23505', message = 'already_reacted';
  end if;

  insert into public.think_reactions (message_id, reaction)
  values (target_message_id, target_reaction)
  returning * into result;

  return jsonb_build_object(
    'status', 'saved', 'id', result.id,
    'message_id', result.message_id, 'reaction', result.reaction,
    'updated_at', result.updated_at
  );
end;
$$;

revoke all on function public.set_think_reaction(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_think_reaction(uuid, text)
  to authenticated;

-- A final reaction is not cancellable by the normal authenticated client.
revoke all on function public.delete_think_reaction(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_think_reaction(uuid)
  to service_role;

-- Realtime is required for sender feedback after a recipient reacts.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'think_reactions'
  ) then
    alter publication supabase_realtime add table public.think_reactions;
  end if;
end
$$;
