-- Production ledger 20260922182210 fix_left_for_you_partner_scope_and_grants: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 5dba9ef028d4ca49fdfeba83fd83669a; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.


-- M5B follow-up hardening: disambiguate recipient/couple scope,
-- restrict client table privileges, and keep seen transition explicit/idempotent.

alter policy left_for_you_insert_own
  on public.left_for_you
  with check (
    left_for_you.couple_id = private.current_couple_id()
    and left_for_you.sender_id = auth.uid()
    and left_for_you.recipient_id <> left_for_you.sender_id
    and exists (
      select 1
      from public.profiles as partner
      where partner.id = left_for_you.recipient_id
        and partner.couple_id = private.current_couple_id()
    )
    and (
      left_for_you.kind <> 'photo'
      or starts_with(
        left_for_you.media_path,
        left_for_you.couple_id::text || '/' || auth.uid()::text || '/'
      )
    )
  );

revoke all on table public.left_for_you from public, anon, authenticated;
grant select, insert on table public.left_for_you to authenticated;
grant all on table public.left_for_you to service_role;

create or replace function public.mark_left_item_seen(target_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_item public.left_for_you%rowtype;
  result_seen_at timestamptz;
  was_unseen boolean;
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
    raise exception using errcode = '42501', message = 'left_item_recipient_required';
  end if;

  was_unseen := target_item.seen_at is null;

  if was_unseen then
    update public.left_for_you as entry
    set seen_at = now()
    where entry.id = target_item.id
      and entry.seen_at is null
    returning entry.seen_at into result_seen_at;

    if result_seen_at is null then
      select entry.seen_at into result_seen_at
      from public.left_for_you as entry
      where entry.id = target_item.id;
    end if;
  else
    result_seen_at := target_item.seen_at;
  end if;

  return jsonb_build_object(
    'id', target_item.id,
    'status', case when was_unseen then 'seen' else 'already_seen' end,
    'seen_at', result_seen_at
  );
end;
$$;

revoke all on function public.mark_left_item_seen(uuid) from public, anon, authenticated;
grant execute on function public.mark_left_item_seen(uuid) to authenticated;;
