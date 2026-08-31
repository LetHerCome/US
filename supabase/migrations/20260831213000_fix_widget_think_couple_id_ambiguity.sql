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
      return query select receipt.message_id, credential.profile_id, partner_id, credential.couple_id, true;
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

  insert into public.shared_messages(couple_id, sender_id, recipient_id, kind, body)
  values (credential.couple_id, credential.profile_id, partner_id, 'think', 'Ti penso')
  returning id into created_message_id;

  update public.widget_action_receipts as action_receipt
  set status = 'sent', message_id = created_message_id, completed_at = now()
  where action_receipt.token_id = credential.id
    and action_receipt.action_id = p_action_id;

  update public.widget_action_tokens as action_token
  set last_used_at = now(), last_action_at = now()
  where action_token.id = credential.id;

  return query select created_message_id, credential.profile_id, partner_id, credential.couple_id, false;
end;
$$;
