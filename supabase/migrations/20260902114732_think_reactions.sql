-- M4 Ti penso: one-tap reaction, dedicated authority.
-- Ownership is derived from the think message recipient so claim_us_role
-- continues to migrate only shared_messages sender/recipient IDs.

create table public.think_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.shared_messages(id) on delete cascade,
  reaction text not null check (reaction in ('heart', 'hug', 'miss_you')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


alter table public.think_reactions enable row level security;
alter table public.think_reactions force row level security;
revoke all on public.think_reactions from public, anon, authenticated;
grant select on public.think_reactions to authenticated;

create policy think_reactions_select_couple_members
on public.think_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.shared_messages as message
    where message.id = think_reactions.message_id
      and message.kind = 'think'
      and message.couple_id = private.current_couple_id()
      and (message.sender_id = auth.uid() or message.recipient_id = auth.uid())
  )
);

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
  result public.think_reactions%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if target_reaction not in ('heart', 'hug', 'miss_you') then
    raise exception using errcode = '22023', message = 'invalid think reaction';
  end if;

  current_couple := private.current_couple_id();
  select * into message
    from public.shared_messages
   where id = target_message_id
     and kind = 'think'
     and couple_id = current_couple
     and recipient_id = auth.uid()
   for update;
  if message.id is null then
    raise exception using errcode = '42501', message = 'think recipient required';
  end if;

  insert into public.think_reactions (message_id, reaction)
  values (target_message_id, target_reaction)
  on conflict (message_id) do update
    set reaction = excluded.reaction, updated_at = now()
  returning * into result;

  return jsonb_build_object('status', 'saved', 'id', result.id, 'message_id', result.message_id, 'reaction', result.reaction, 'updated_at', result.updated_at);
end;
$$;

create or replace function public.delete_think_reaction(target_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_couple uuid;
  message public.shared_messages%rowtype;
  deleted_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  current_couple := private.current_couple_id();
  select * into message
    from public.shared_messages
   where id = target_message_id
     and kind = 'think'
     and couple_id = current_couple
     and recipient_id = auth.uid()
   for update;
  if message.id is null then
    raise exception using errcode = '42501', message = 'think recipient required';
  end if;

  delete from public.think_reactions
   where message_id = target_message_id
  returning id into deleted_id;

  return jsonb_build_object('status', case when deleted_id is null then 'already_absent' else 'deleted' end, 'message_id', target_message_id);
end;
$$;

revoke all on function public.set_think_reaction(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_think_reaction(uuid) from public, anon, authenticated;
grant execute on function public.set_think_reaction(uuid, text) to authenticated;
grant execute on function public.delete_think_reaction(uuid) to authenticated;

comment on table public.think_reactions is
  'M4-only one-tap reactions to think messages; recipient-owned and intentionally not a generic reaction system.';
