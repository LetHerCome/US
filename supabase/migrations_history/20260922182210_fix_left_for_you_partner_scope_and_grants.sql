-- M5B fix — allineamento allo stato remote corretto di left_for_you.
-- Preserva il primo deploy (20260922180436) e applica, in modo forward-only,
-- le correzioni già applicate e verificate in remote:
--   * recipient same-couple esplicito nella insert policy;
--   * grants tabella: authenticated limitato a SELECT + INSERT
--     (UPDATE/DELETE/TRUNCATE ecc. solo a service_role/postgres);
--   * nessuna policy UPDATE/DELETE per il client;
--   * mark_left_item_seen con alias espliciti (target_item) e idempotenza
--     (transizione unica NULL -> now(), retry senza mutazione del timestamp).

-- 1) Recipient same-couple esplicito: il partner lookup confronta
--    partner.couple_id con private.current_couple_id() (colonna della tabella
--    lasciata ambigua dalla V1 quando la query viene riscritta dal planner).
drop policy if exists left_for_you_insert_own on public.left_for_you;
create policy left_for_you_insert_own
  on public.left_for_you
  for insert to authenticated
  with check (
    couple_id = private.current_couple_id()
    and sender_id = auth.uid()
    and recipient_id <> sender_id
    and exists (
      select 1 from public.profiles as partner
      where partner.id = left_for_you.recipient_id
        and partner.couple_id = private.current_couple_id()
    )
    and (
      kind <> 'photo'
      or starts_with(
        media_path,
        couple_id::text || '/' || auth.uid()::text || '/'
      )
    )
  );

-- 2) Grants: authenticated solo SELECT + INSERT. Nessun UPDATE/DELETE client.
revoke update, delete, truncate, references, trigger, maintain
  on table public.left_for_you from authenticated;
revoke all on table public.left_for_you from anon;
grant select, insert on table public.left_for_you to authenticated;

-- 3) mark_left_item_seen: alias espliciti e idempotenza hard (la seconda
--    lettura protegge da una concurrent transition tra select e update).
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
grant execute on function public.mark_left_item_seen(uuid) to authenticated;
