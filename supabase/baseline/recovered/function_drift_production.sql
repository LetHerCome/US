-- US backend recovered source: function_drift_production.sql
-- Production definitions of the 8 functions whose body differed from the latest repo file (F2A D3).
-- GENERATED from the production capture by scripts/build-supabase-baseline.mjs.
-- A documentation slice of supabase/baseline (same text, same order). It is not
-- a migration and is not applied by itself; the baseline files are.

-- from 30_functions.sql
-- private.bucket_items_guard_calendar_link(p_couple_id uuid, p_calendar_entry_id uuid)
CREATE OR REPLACE FUNCTION private.bucket_items_guard_calendar_link(p_couple_id uuid, p_calendar_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- Prefixed v_*: a bare `entry_type` here would be ambiguous with
  -- calendar_entries.entry_type in the SELECT below (PL/pgSQL cannot tell
  -- whether the target-list identifier means the variable or the column),
  -- so the source column is also alias-qualified (ce.*) to make the query
  -- side unambiguous too, not just the variable side.
  v_couple_id uuid;
  v_entry_type text;
begin
  if p_calendar_entry_id is null then
    return;
  end if;

  select ce.couple_id, ce.entry_type
  into v_couple_id, v_entry_type
  from public.calendar_entries ce
  where ce.id = p_calendar_entry_id;

  if v_couple_id is null then
    raise exception using errcode = '23503', message = 'bucket_items_calendar_entry_not_found';
  end if;

  if v_couple_id <> p_couple_id then
    raise exception using errcode = '42501', message = 'bucket_items_calendar_entry_cross_couple';
  end if;

  if v_entry_type <> 'shared' then
    raise exception using errcode = '42501', message = 'bucket_items_calendar_entry_not_shared';
  end if;
end;
$function$;

-- private.bucket_items_guard_delete()
CREATE OR REPLACE FUNCTION private.bucket_items_guard_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.status not in ('idea', 'archived') or old.calendar_entry_id is not null then
    raise exception using errcode = '42501', message = 'bucket_items_delete_requires_unlinked_idea_or_archived';
  end if;

  return old;
end;
$function$;

-- private.calendar_entries_guard_update()
CREATE OR REPLACE FUNCTION private.calendar_entries_guard_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  repair_transfer boolean := coalesce(current_setting('us.calendar_entries_repair_transfer', true), '') = 'on';
begin
  if new.entry_type <> old.entry_type then
    raise exception using errcode = '42501', message = 'calendar_entries_entry_type_immutable';
  end if;
  if new.couple_id <> old.couple_id then
    raise exception using errcode = '42501', message = 'calendar_entries_couple_id_immutable';
  end if;
  if new.created_by <> old.created_by and not repair_transfer then
    raise exception using errcode = '42501', message = 'calendar_entries_created_by_immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

-- public.claim_left_for_you_cleanup(target_batch_size integer)
CREATE OR REPLACE FUNCTION public.claim_left_for_you_cleanup(target_batch_size integer DEFAULT 100)
 RETURNS TABLE(item_id uuid, couple_id uuid, sender_id uuid, kind text, media_path text, source_deleted_at timestamp with time zone, claimed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requested_batch integer := greatest(1, least(coalesce(target_batch_size, 100), 500));
begin
  update private.left_for_you_cleanup_queue as stale
  set claimed_at = null
  where stale.completed_at is null
    and stale.claimed_at < now() - interval '15 minutes';

  insert into private.left_for_you_cleanup_queue
    (item_id, couple_id, sender_id, kind, media_path)
  select
    item.id,
    item.couple_id,
    item.sender_id,
    item.kind,
    item.media_path
  from public.left_for_you as item
  where item.cleanup_eligible_at is not null
    and item.seen_at is not null
    and item.seen_at < now() - interval '30 days'
    and not exists (
      select 1
      from public.conserva_contributions as contribution
      where contribution.source_item_id = item.id
    )
    and not exists (
      select 1
      from private.left_for_you_cleanup_queue as queued
      where queued.item_id = item.id
        and queued.completed_at is null
    )
  on conflict on constraint left_for_you_cleanup_queue_pkey do nothing;

  return query
  with claimable as (
    select queue.item_id
    from private.left_for_you_cleanup_queue as queue
    where queue.completed_at is null
      and queue.claimed_at is null
    order by queue.source_deleted_at nulls first, queue.item_id
    limit requested_batch
    for update skip locked
  )
  update private.left_for_you_cleanup_queue as queue
  set claimed_at = now()
  from claimable
  where queue.item_id = claimable.item_id
  returning queue.item_id, queue.couple_id, queue.sender_id, queue.kind,
    queue.media_path, queue.source_deleted_at, queue.claimed_at;
end;
$function$;

-- public.claim_us_role(invite_code text, chosen_role text)
CREATE OR REPLACE FUNCTION public.claim_us_role(invite_code text, chosen_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare
  uid uuid := auth.uid();
  inv public.couple_invites%rowtype;
  old_uid uuid;
  old_avatar text;
  old_created_at timestamptz;
  display text;
  is_anon boolean;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  select coalesce((raw_app_meta_data->>'provider') = 'anonymous', false)
      or coalesce((raw_user_meta_data->>'is_anonymous')::boolean, false)
      or email is null
  into is_anon
  from auth.users where id = uid;

  if not coalesce(is_anon, false) then
    raise exception 'Anonymous session required for private pairing';
  end if;

  if chosen_role not in ('francesco','beatrice') then
    raise exception 'Invalid role';
  end if;

  select * into inv
  from public.couple_invites
  where code_hash = encode(extensions.digest(upper(trim(invite_code))::text, 'sha256'::text), 'hex')
    and role = chosen_role
  for update;

  if inv.id is null then
    raise exception 'Invalid private code';
  end if;

  if exists (
    select 1 from public.profiles
    where id = uid and (couple_id is distinct from inv.couple_id or role is distinct from chosen_role)
  ) then
    raise exception 'This device is already linked to another profile';
  end if;

  select id, avatar_path, created_at
  into old_uid, old_avatar, old_created_at
  from public.profiles
  where couple_id = inv.couple_id and role = chosen_role
  limit 1
  for update;

  display := case chosen_role when 'francesco' then 'Francesco' else 'Beatrice' end;

  if old_uid is not null and old_uid <> uid then
    -- Temporarily remove the old profile from the partial unique index
    -- (couple_id, role) while keeping the profile row alive for FK safety.
    update public.profiles
    set couple_id = null
    where id = old_uid;

    -- Create the replacement profile BEFORE moving profile-owned foreign keys.
    insert into public.profiles(id, display_name, couple_id, role, created_at, avatar_path)
    values (uid, display, inv.couple_id, chosen_role, coalesce(old_created_at, now()), old_avatar)
    on conflict (id) do update
      set display_name = excluded.display_name,
          couple_id = excluded.couple_id,
          role = excluded.role,
          avatar_path = coalesce(excluded.avatar_path, public.profiles.avatar_path);

    -- Core historical data.
    update public.daily_answers set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.quiz_responses set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    -- M7A: bucket_items now carries a created_by-immutability guard trigger
    -- (20260929090000). The trigger blocks this reassignment by default;
    -- this session-local flag authorises exactly this one statement, for
    -- exactly this transfer, mirroring the calendar_entries carve-out below.
    perform set_config('us.bucket_items_repair_transfer', 'on', true);
    update public.bucket_items set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;
    perform set_config('us.bucket_items_repair_transfer', 'off', true);
    update public.shared_messages set sender_id = uid where sender_id = old_uid and couple_id = inv.couple_id;
    update public.shared_messages set recipient_id = uid where recipient_id = old_uid and couple_id = inv.couple_id;
    update public.moods set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.activity set actor_id = uid where actor_id = old_uid and couple_id = inv.couple_id;

    -- Current US 1.0 profile-owned data.
    update public.couple_locations set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.device_push_tokens set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.moments set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;
    update public.moment_photos set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;
    update public.notification_preferences set user_id = uid where user_id = old_uid;
    update public.partner_knowledge_attempts set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.push_event_log set sender_id = uid where sender_id = old_uid and couple_id = inv.couple_id;
    update public.push_subscriptions set user_id = uid where user_id = old_uid and couple_id = inv.couple_id;
    update public.shared_event_completions set completed_by = uid where completed_by = old_uid and couple_id = inv.couple_id;
    update public.shared_events set created_by = uid where created_by = old_uid and couple_id = inv.couple_id;
    update public.stories set author_id = uid where author_id = old_uid and couple_id = inv.couple_id;
    update public.story_views set viewer_id = uid where viewer_id = old_uid;
    update public.widget_tokens set profile_id = uid where profile_id = old_uid and couple_id = inv.couple_id;

    -- M6A: calendar_entries (added by 20260928071749, not part of the
    -- original production function). owner_id and created_by move together
    -- in one statement so a personal row never has owner_id <> created_by
    -- mid-transfer (calendar_entries_personal_owner_is_creator_check would
    -- otherwise reject it); shared rows keep owner_id null and only
    -- created_by moves. The guard trigger blocks created_by changes by
    -- default, so this session-local flag authorises exactly this transfer,
    -- for exactly this one statement.
    perform set_config('us.calendar_entries_repair_transfer', 'on', true);
    update public.calendar_entries
    set created_by = uid,
        owner_id = case when owner_id = old_uid then uid else owner_id end
    where couple_id = inv.couple_id
      and (created_by = old_uid or owner_id = old_uid);
    perform set_config('us.calendar_entries_repair_transfer', 'off', true);

    update public.couple_invites set used_by = uid, used_at = now() where id = inv.id;

    -- All references now point to the new profile, so this delete is safe.
    delete from public.profiles where id = old_uid;
  else
    insert into public.profiles(id, display_name, couple_id, role, avatar_path)
    values (uid, display, inv.couple_id, chosen_role, old_avatar)
    on conflict (id) do update
      set display_name = excluded.display_name,
          couple_id = excluded.couple_id,
          role = excluded.role,
          avatar_path = coalesce(excluded.avatar_path, public.profiles.avatar_path);
  end if;

  update public.couple_invites
  set used_by = uid, used_at = now()
  where id = inv.id;

  return jsonb_build_object('couple_id', inv.couple_id, 'role', chosen_role, 'display_name', display);
end;
$function$;
comment on function public.claim_us_role(invite_code text, chosen_role text) is 'RETIRED (US 2.0 F1A): legacy anonymous pairing. EXECUTE revoked from public/anon/authenticated; login is email + password only. Kept for migration-history compatibility; do not re-grant.';

-- public.send_think(operation_id uuid)
CREATE OR REPLACE FUNCTION public.send_think(operation_id uuid)
 RETURNS TABLE(message_id uuid, sender_id uuid, recipient_id uuid, couple_id uuid, duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- public.set_think_reaction(target_message_id uuid, target_reaction text)
CREATE OR REPLACE FUNCTION public.set_think_reaction(target_message_id uuid, target_reaction text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  select msg.* into message
  from public.shared_messages as msg
  where msg.id = target_message_id
    and msg.kind = 'think'
    and msg.couple_id = current_couple
    and msg.recipient_id = auth.uid()
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
        'status', 'duplicate',
        'id', existing.id,
        'message_id', existing.message_id,
        'reaction', existing.reaction,
        'updated_at', existing.updated_at
      );
    end if;

    raise exception using errcode = '23505', message = 'already_reacted';
  end if;

  insert into public.think_reactions (message_id, reaction)
  values (target_message_id, target_reaction)
  returning * into result;

  return jsonb_build_object(
    'status', 'saved',
    'id', result.id,
    'message_id', result.message_id,
    'reaction', result.reaction,
    'updated_at', result.updated_at
  );
end;
$function$;

-- public.widget_send_think_internal(p_token_hash text, p_action_id uuid)
CREATE OR REPLACE FUNCTION public.widget_send_think_internal(p_token_hash text, p_action_id uuid)
 RETURNS TABLE(message_id uuid, sender_id uuid, recipient_id uuid, couple_id uuid, duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    credential.couple_id, credential.profile_id, partner_id,
    'think', 'Ti penso', p_action_id
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
$function$;

-- from 70_grants.sql
revoke all on function private.bucket_items_guard_calendar_link(p_couple_id uuid, p_calendar_entry_id uuid) from public, anon, authenticated, service_role;
revoke all on function private.bucket_items_guard_delete() from public, anon, authenticated, service_role;
revoke all on function private.calendar_entries_guard_update() from public, anon, authenticated, service_role;
revoke all on function public.claim_left_for_you_cleanup(target_batch_size integer) from public, anon, authenticated, service_role;
grant all on function public.claim_left_for_you_cleanup(target_batch_size integer) to service_role;
revoke all on function public.claim_us_role(invite_code text, chosen_role text) from public, anon, authenticated, service_role;
grant all on function public.claim_us_role(invite_code text, chosen_role text) to service_role;
revoke all on function public.send_think(operation_id uuid) from public, anon, authenticated, service_role;
grant all on function public.send_think(operation_id uuid) to service_role;
grant all on function public.send_think(operation_id uuid) to authenticated;
revoke all on function public.set_think_reaction(target_message_id uuid, target_reaction text) from public, anon, authenticated, service_role;
grant all on function public.set_think_reaction(target_message_id uuid, target_reaction text) to service_role;
grant all on function public.set_think_reaction(target_message_id uuid, target_reaction text) to authenticated;
revoke all on function public.widget_send_think_internal(p_token_hash text, p_action_id uuid) from public, anon, authenticated, service_role;
grant all on function public.widget_send_think_internal(p_token_hash text, p_action_id uuid) to service_role;
