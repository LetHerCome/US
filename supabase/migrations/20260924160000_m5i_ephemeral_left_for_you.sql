-- M5I — Ephemeral Left for You lifecycle.
--
-- Additive only. This migration does not schedule or execute cleanup.
-- The cleanup Edge Function is an internal, separately scheduled worker.
--
-- Safety model:
--   * seen_at IS NULL = pending/unconsumed
--   * seen_at IS NOT NULL = consumed
--   * cleanup_eligible_at IS NULL = legacy row, never cleanup-eligible
--   * cleanup_eligible_at is assigned only by a server-side INSERT trigger
--   * Conserva and cleanup serialize on the source left_for_you row lock
--   * source deletion leaves a durable storage outbox record

alter table public.left_for_you
  add column if not exists cleanup_eligible_at timestamptz;

create or replace function private.set_left_for_you_cleanup_eligible_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.cleanup_eligible_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function private.set_left_for_you_cleanup_eligible_at() from public, anon, authenticated;

drop trigger if exists left_for_you_cleanup_eligibility on public.left_for_you;
create trigger left_for_you_cleanup_eligibility
before insert on public.left_for_you
for each row execute function private.set_left_for_you_cleanup_eligible_at();

-- Tighten the sender media namespace to the dedicated Left for You prefix.
drop policy if exists left_for_you_insert_own on public.left_for_you;
create policy left_for_you_insert_own
  on public.left_for_you
  for insert to authenticated
  with check (
    couple_id = private.current_couple_id()
    and sender_id = auth.uid()
    and recipient_id <> sender_id
    and seen_at is null
    and exists (
      select 1
      from public.profiles as partner
      where partner.id = left_for_you.recipient_id
        and partner.couple_id = private.current_couple_id()
    )
    and (
      kind <> all (array['photo'::text, 'audio'::text, 'video'::text])
      or starts_with(media_path, (((couple_id)::text || '/'::text) || (auth.uid())::text) || '/left/'::text)
    )
    and (
      kind <> 'music'::text
      or not starts_with(media_path, (((couple_id)::text || '/'::text) || (auth.uid())::text) || '/left/'::text)
    )
  );

create table if not exists private.left_for_you_cleanup_queue (
  item_id uuid primary key,
  couple_id uuid not null,
  sender_id uuid not null,
  kind text not null,
  media_path text,
  claimed_at timestamptz,
  source_deleted_at timestamptz,
  completed_at timestamptz
);

revoke all on table private.left_for_you_cleanup_queue from public, anon, authenticated;

create or replace function public.claim_left_for_you_cleanup(target_batch_size integer default 100)
returns table (
  item_id uuid,
  couple_id uuid,
  sender_id uuid,
  kind text,
  media_path text,
  source_deleted_at timestamptz,
  claimed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_batch integer := greatest(1, least(coalesce(target_batch_size, 100), 500));
begin
  -- A crashed worker leaves a lease. Releasing leases after 15 minutes makes
  -- both pre-delete claims and post-delete storage outbox rows retryable.
  update private.left_for_you_cleanup_queue as stale
  set claimed_at = null
  where stale.completed_at is null
    and stale.claimed_at < now() - interval '15 minutes';

  -- Existing rows have cleanup_eligible_at NULL and are therefore excluded.
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
  on conflict (item_id) do nothing;

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
$$;

revoke all on function public.claim_left_for_you_cleanup(integer) from public, anon, authenticated;
grant execute on function public.claim_left_for_you_cleanup(integer) to service_role;

-- This RPC locks the source, rechecks Conserva, and deletes only the DB row.
-- The queue row survives as a durable storage outbox record.
create or replace function public.finalize_left_for_you_cleanup(target_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued_item private.left_for_you_cleanup_queue%rowtype;
  source_item public.left_for_you%rowtype;
  deleted_id uuid;
begin
  select * into queued_item
  from private.left_for_you_cleanup_queue
  where item_id = target_item_id
    and completed_at is null
  for update;

  if queued_item.item_id is null then
    return jsonb_build_object('status', 'absent', 'item_id', target_item_id);
  end if;

  if queued_item.source_deleted_at is not null then
    update private.left_for_you_cleanup_queue
    set claimed_at = null
    where item_id = queued_item.item_id;
    return jsonb_build_object(
      'status', 'source_deleted',
      'item_id', queued_item.item_id,
      'couple_id', queued_item.couple_id,
      'sender_id', queued_item.sender_id,
      'kind', queued_item.kind,
      'media_path', queued_item.media_path
    );
  end if;

  select * into source_item
  from public.left_for_you
  where id = queued_item.item_id
  for update;

  if source_item.id is null then
    update private.left_for_you_cleanup_queue
    set source_deleted_at = now(), claimed_at = null
    where item_id = queued_item.item_id;
    return jsonb_build_object(
      'status', 'source_deleted',
      'item_id', queued_item.item_id,
      'couple_id', queued_item.couple_id,
      'sender_id', queued_item.sender_id,
      'kind', queued_item.kind,
      'media_path', queued_item.media_path
    );
  end if;

  if exists (
    select 1
    from public.conserva_contributions as contribution
    where contribution.source_item_id = source_item.id
  ) then
    delete from private.left_for_you_cleanup_queue
    where item_id = queued_item.item_id;
    return jsonb_build_object('status', 'conserved', 'item_id', queued_item.item_id);
  end if;

  if source_item.cleanup_eligible_at is null
     or source_item.seen_at is null
     or source_item.seen_at >= now() - interval '30 days' then
    delete from private.left_for_you_cleanup_queue
    where item_id = queued_item.item_id;
    return jsonb_build_object('status', 'not_eligible', 'item_id', queued_item.item_id);
  end if;

  delete from public.left_for_you
  where id = source_item.id
    and not exists (
      select 1
      from public.conserva_contributions as contribution
      where contribution.source_item_id = source_item.id
    )
  returning id into deleted_id;

  if deleted_id is null then
    return jsonb_build_object('status', 'conserved_or_raced', 'item_id', queued_item.item_id);
  end if;

  update private.left_for_you_cleanup_queue
  set source_deleted_at = now(), claimed_at = null
  where item_id = queued_item.item_id;

  return jsonb_build_object(
    'status', 'source_deleted',
    'item_id', deleted_id,
    'couple_id', queued_item.couple_id,
    'sender_id', queued_item.sender_id,
    'kind', queued_item.kind,
    'media_path', queued_item.media_path
  );
end;
$$;

revoke all on function public.finalize_left_for_you_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.finalize_left_for_you_cleanup(uuid) to service_role;

create or replace function public.complete_left_for_you_cleanup(target_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_item private.left_for_you_cleanup_queue%rowtype;
begin
  update private.left_for_you_cleanup_queue
  set completed_at = now(), claimed_at = null
  where item_id = target_item_id
    and source_deleted_at is not null
    and completed_at is null
  returning * into completed_item;

  if completed_item.item_id is null then
    return jsonb_build_object('status', 'absent', 'item_id', target_item_id);
  end if;

  return jsonb_build_object('status', 'completed', 'item_id', target_item_id);
end;
$$;

revoke all on function public.complete_left_for_you_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.complete_left_for_you_cleanup(uuid) to service_role;

-- Serialize Conserva with cleanup finalization. Both operations lock the
-- source row before checking/inserting the contribution.
create or replace function public.conserve_left_for_you(target_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_item public.left_for_you%rowtype;
  existing_row public.conserva_contributions%rowtype;
  created_row public.conserva_contributions%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select entry.* into target_item
  from public.left_for_you as entry
  where entry.id = target_item_id
    and entry.couple_id = private.current_couple_id()
    and entry.recipient_id = auth.uid()
  for update;

  if target_item.id is null then
    raise exception using errcode = '42501', message = 'conserva_recipient_required';
  end if;

  insert into public.conserva_contributions as c
    (couple_id, source_item_id, source_sender_id, conserved_by)
  values
    (target_item.couple_id, target_item.id, target_item.sender_id, auth.uid())
  on conflict (source_item_id) do nothing
  returning c.* into created_row;

  if created_row.id is not null then
    return jsonb_build_object(
      'id', created_row.id,
      'status', 'created',
      'couple_id', created_row.couple_id,
      'source_item_id', created_row.source_item_id,
      'source_sender_id', created_row.source_sender_id,
      'conserved_by', created_row.conserved_by,
      'created_at', created_row.created_at
    );
  end if;

  select e.* into existing_row
  from public.conserva_contributions as e
  where e.source_item_id = target_item.id;

  return jsonb_build_object(
    'id', existing_row.id,
    'status', 'existing',
    'couple_id', existing_row.couple_id,
    'source_item_id', existing_row.source_item_id,
    'source_sender_id', existing_row.source_sender_id,
    'conserved_by', existing_row.conserved_by,
    'created_at', existing_row.created_at
  );
end;
$$;

revoke all on function public.conserve_left_for_you(uuid) from public, anon, authenticated;
grant execute on function public.conserve_left_for_you(uuid) to authenticated;
