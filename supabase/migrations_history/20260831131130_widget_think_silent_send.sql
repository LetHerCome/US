create table public.widget_action_tokens (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id_hash text not null check (device_id_hash ~ '^[a-f0-9]{64}$'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  scope text not null default 'think:send' check (scope = 'think:send'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_action_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create unique index widget_action_tokens_active_device_idx
  on public.widget_action_tokens(profile_id, device_id_hash, scope)
  where revoked_at is null;

alter table public.widget_action_tokens enable row level security;
revoke all on table public.widget_action_tokens from public, anon, authenticated;

create table public.widget_action_receipts (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.widget_action_tokens(id) on delete cascade,
  action_id uuid not null,
  action_type text not null check (action_type = 'think:send'),
  message_id uuid references public.shared_messages(id) on delete set null,
  status text not null check (status in ('processing', 'sent')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (token_id, action_id)
);

alter table public.widget_action_receipts enable row level security;
revoke all on table public.widget_action_receipts from public, anon, authenticated;

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
  select * into credential
  from public.widget_action_tokens
  where token_hash = p_token_hash
    and scope = 'think:send'
    and revoked_at is null
    and expires_at > now()
  for update;

  if credential.id is null then
    raise exception using errcode = '28000', message = 'invalid_widget_credential';
  end if;

  select * into receipt
  from public.widget_action_receipts
  where token_id = credential.id and action_id = p_action_id;

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

  select id into partner_id
  from public.profiles
  where couple_id = credential.couple_id and id <> credential.profile_id
  order by created_at, id
  limit 1;

  if partner_id is null then
    raise exception using errcode = 'P0001', message = 'widget_partner_missing';
  end if;

  insert into public.widget_action_receipts(token_id, action_id, action_type, status)
  values (credential.id, p_action_id, 'think:send', 'processing');

  insert into public.shared_messages(couple_id, sender_id, recipient_id, kind, body)
  values (credential.couple_id, credential.profile_id, partner_id, 'think', 'Ti penso')
  returning id into created_message_id;

  update public.widget_action_receipts
  set status = 'sent', message_id = created_message_id, completed_at = now()
  where token_id = credential.id and action_id = p_action_id;

  update public.widget_action_tokens
  set last_used_at = now(), last_action_at = now()
  where id = credential.id;

  return query select created_message_id, credential.profile_id, partner_id, credential.couple_id, false;
end;
$$;

revoke all on function public.widget_send_think_internal(text, uuid) from public, anon, authenticated;
grant execute on function public.widget_send_think_internal(text, uuid) to service_role;
