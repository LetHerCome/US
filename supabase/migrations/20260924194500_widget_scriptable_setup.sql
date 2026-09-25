create table public.widget_scriptable_setup_codes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz
);

create index widget_scriptable_setup_codes_profile_idx
  on public.widget_scriptable_setup_codes(profile_id, created_at desc);

alter table public.widget_scriptable_setup_codes enable row level security;
revoke all on table public.widget_scriptable_setup_codes from public, anon, authenticated;

create table public.widget_scriptable_installations (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id_hash text not null check (device_id_hash ~ '^[a-f0-9]{64}$'),
  state_token_hash text not null unique check (state_token_hash ~ '^[a-f0-9]{64}$'),
  action_token_id uuid not null unique references public.widget_action_tokens(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index widget_scriptable_installations_profile_idx
  on public.widget_scriptable_installations(profile_id, created_at desc);
create unique index widget_scriptable_installations_active_device_idx
  on public.widget_scriptable_installations(profile_id, device_id_hash)
  where revoked_at is null;
create index widget_scriptable_installations_expiry_idx
  on public.widget_scriptable_installations(expires_at)
  where revoked_at is null;

alter table public.widget_scriptable_installations enable row level security;
revoke all on table public.widget_scriptable_installations from public, anon, authenticated;

create or replace function public.widget_scriptable_issue_code_internal(
  p_profile_id uuid,
  p_couple_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = p_profile_id and profile.couple_id = p_couple_id
  ) then
    raise exception using errcode = '28000', message = 'widget_profile_not_linked';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(0, pg_catalog.hashtext(p_profile_id::text));
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_expires_at <= now() or p_expires_at > now() + interval '15 minutes' then
    raise exception using errcode = '22023', message = 'invalid_setup_code';
  end if;

  update public.widget_scriptable_setup_codes as setup_code
  set revoked_at = now()
  where setup_code.profile_id = p_profile_id
    and setup_code.consumed_at is null
    and setup_code.revoked_at is null;

  insert into public.widget_scriptable_setup_codes(couple_id, profile_id, token_hash, expires_at)
  values (p_couple_id, p_profile_id, p_token_hash, p_expires_at);
end;
$$;

create or replace function public.widget_scriptable_exchange_internal(
  p_setup_token_hash text,
  p_device_id_hash text,
  p_state_token_hash text,
  p_action_token_hash text
)
returns table (installation_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  setup_code public.widget_scriptable_setup_codes%rowtype;
  setup_profile_id uuid;
  current_profile_couple_id uuid;
  action_token_id uuid;
  new_installation_id uuid;
  action_expiry timestamptz := now() + interval '180 days';
begin
  if p_setup_token_hash !~ '^[a-f0-9]{64}$'
     or p_device_id_hash !~ '^[a-f0-9]{64}$'
     or p_state_token_hash !~ '^[a-f0-9]{64}$'
     or p_action_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_setup_request';
  end if;

  select code.profile_id into setup_profile_id
  from public.widget_scriptable_setup_codes as code
  where code.token_hash = p_setup_token_hash;
  if setup_profile_id is null then
    raise exception using errcode = '28000', message = 'invalid_or_expired_setup_code';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1, pg_catalog.hashtext(p_device_id_hash));
  perform pg_catalog.pg_advisory_xact_lock(0, pg_catalog.hashtext(setup_profile_id::text));

  select code.* into setup_code
  from public.widget_scriptable_setup_codes as code
  where code.token_hash = p_setup_token_hash
    and code.consumed_at is null
    and code.revoked_at is null
    and code.expires_at > now()
  for update;

  if setup_code.id is null then
    raise exception using errcode = '28000', message = 'invalid_or_expired_setup_code';
  end if;

  select profile.couple_id
  into current_profile_couple_id
  from public.profiles as profile
  where profile.id = setup_code.profile_id
  for update;

  if not found or current_profile_couple_id is distinct from setup_code.couple_id then
    raise exception using errcode = '28000', message = 'widget_profile_not_linked';
  end if;

  update public.widget_scriptable_installations as old_installation
  set revoked_at = now()
  where old_installation.profile_id = setup_code.profile_id
    and old_installation.couple_id = setup_code.couple_id
    and old_installation.device_id_hash = p_device_id_hash
    and old_installation.revoked_at is null;

  update public.widget_tokens as state_token
  set revoked_at = now()
  where state_token.token_hash in (
    select old_installation.state_token_hash
    from public.widget_scriptable_installations as old_installation
    where old_installation.profile_id = setup_code.profile_id
      and old_installation.couple_id = setup_code.couple_id
      and old_installation.device_id_hash = p_device_id_hash
      and old_installation.revoked_at is not null
  )
    and state_token.revoked_at is null;

  update public.widget_action_tokens as action_token
  set revoked_at = now()
  where action_token.id in (
    select old_installation.action_token_id
    from public.widget_scriptable_installations as old_installation
    where old_installation.profile_id = setup_code.profile_id
      and old_installation.couple_id = setup_code.couple_id
      and old_installation.device_id_hash = p_device_id_hash
      and old_installation.revoked_at is not null
  )
    and action_token.revoked_at is null;

  insert into public.widget_action_tokens(
    couple_id, profile_id, device_id_hash, token_hash, scope, expires_at
  ) values (
    setup_code.couple_id, setup_code.profile_id, p_device_id_hash,
    p_action_token_hash, 'think:send', action_expiry
  ) returning id into action_token_id;

  insert into public.widget_tokens(couple_id, profile_id, device_label, token_hash)
  values (setup_code.couple_id, setup_code.profile_id, 'Scriptable', p_state_token_hash);

  insert into public.widget_scriptable_installations(
    couple_id, profile_id, device_id_hash, state_token_hash, action_token_id, expires_at
  ) values (
    setup_code.couple_id, setup_code.profile_id, p_device_id_hash,
    p_state_token_hash, action_token_id, action_expiry
  ) returning id into new_installation_id;

  update public.widget_scriptable_setup_codes as code
  set consumed_at = now()
  where code.id = setup_code.id;

  return query select new_installation_id, action_expiry;
end;
$$;

create or replace function public.widget_scriptable_revoke_internal(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(0, pg_catalog.hashtext(p_profile_id::text));
  update public.widget_scriptable_installations as installation
  set revoked_at = now()
  where installation.profile_id = p_profile_id
    and installation.revoked_at is null;
  get diagnostics revoked_count = row_count;

  update public.widget_tokens as state_token
  set revoked_at = now()
  where state_token.token_hash in (
    select installation.state_token_hash
    from public.widget_scriptable_installations as installation
    where installation.profile_id = p_profile_id
      and installation.revoked_at is not null
  )
    and state_token.revoked_at is null;

  update public.widget_action_tokens as action_token
  set revoked_at = now()
  where action_token.id in (
    select installation.action_token_id
    from public.widget_scriptable_installations as installation
    where installation.profile_id = p_profile_id
      and installation.revoked_at is not null
  )
    and action_token.revoked_at is null;

  update public.widget_scriptable_setup_codes as setup_code
  set revoked_at = now()
  where setup_code.profile_id = p_profile_id
    and setup_code.consumed_at is null
    and setup_code.revoked_at is null;

  return revoked_count;
end;
$$;

revoke all on function public.widget_scriptable_issue_code_internal(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.widget_scriptable_exchange_internal(text, text, text, text) from public, anon, authenticated;
revoke all on function public.widget_scriptable_revoke_internal(uuid) from public, anon, authenticated;
grant execute on function public.widget_scriptable_issue_code_internal(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.widget_scriptable_exchange_internal(text, text, text, text) to service_role;
grant execute on function public.widget_scriptable_revoke_internal(uuid) to service_role;

-- Legacy/native widget_tokens without a Scriptable installation remain unbounded and unchanged.
-- Cleanup only: release must also enforce installation.expires_at at request time in us-widget-state.
-- The deployed endpoint checks revoked_at, so this scoped job revokes expired Scriptable state tokens.
select cron.schedule(
  'us-widget-scriptable-state-expiry',
  '* * * * *',
  $cron$
    update public.widget_tokens as state_token
    set revoked_at = now()
    from public.widget_scriptable_installations as installation
    where state_token.token_hash = installation.state_token_hash
      and installation.expires_at <= now()
      and installation.revoked_at is null
      and state_token.revoked_at is null;
  $cron$
);
