-- Widget «Nota» V1 (founder, 31/10/2026). Spec and security design:
-- docs/missions/widget-nota-v1.md.
--
-- * The Android widget shows one note of the couple, ticks its items and,
--   from a small window over the Home screen, saves it. It never holds a
--   Supabase session: it sends a device token (scope "note:rw", separate
--   from Ti penso's "think:send") to the Edge widget-note, which calls this
--   function with service_role and the token's SHA-256.
-- * The function decides everything: a live note token, its person still in
--   the token's couple, the note in that couple (otherwise "not found", so
--   nothing about other couples leaks), the app's limits, and the author,
--   time and revision. couple_notes_guard lets non-app roles through
--   unchanged, so they are written here explicitly; couple_id and created_by
--   are never touched.
-- * A tick changes only that item, in one update, so it never erases what
--   the partner wrote meanwhile; a save replaces the note (last save wins,
--   as in the app). A brake of 250 ms between writes of one token.

alter table public.widget_action_tokens drop constraint if exists widget_action_tokens_scope_check;
alter table public.widget_action_tokens add constraint widget_action_tokens_scope_check
  check (scope = any (array['think:send'::text, 'note:rw'::text]));

create or replace function public.widget_note_internal(p_token_hash text, p_op text, p_note_id uuid, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  credential public.widget_action_tokens%rowtype;
  note public.couple_notes%rowtype;
  v_item text;
  v_done boolean;
  v_items jsonb;
  v_title text;
  v_body text;
begin
  if p_op is null or p_op not in ('get', 'toggle', 'save') then
    raise exception using errcode = '22023', message = 'widget_note_invalid_op';
  end if;

  select token.* into credential
  from public.widget_action_tokens as token
  where token.token_hash = p_token_hash
    and token.scope = 'note:rw'
    and token.revoked_at is null
    and token.expires_at > pg_catalog.now()
  for update;
  if credential.id is null then
    raise exception using errcode = '28000', message = 'invalid_widget_credential';
  end if;
  -- Leaving the couple (or moving to another) ends the widget's access at once.
  if not exists (
    select 1 from public.profiles as person
    where person.id = credential.profile_id and person.couple_id = credential.couple_id
  ) then
    raise exception using errcode = '28000', message = 'invalid_widget_credential';
  end if;

  select n.* into note
  from public.couple_notes as n
  where n.id = p_note_id and n.couple_id = credential.couple_id
  for update;
  if note.id is null then
    raise exception using errcode = 'P0002', message = 'widget_note_not_found';
  end if;

  if p_op <> 'get' then
    if credential.last_action_at is not null
       and credential.last_action_at > pg_catalog.now() - interval '250 milliseconds' then
      raise exception using errcode = 'P0001', message = 'widget_action_rate_limited';
    end if;
  end if;

  if p_op = 'toggle' then
    v_item := p_payload->>'item_id';
    if pg_catalog.jsonb_typeof(p_payload->'done') is distinct from 'boolean'
       or v_item is null or pg_catalog.char_length(v_item) not between 1 and 40 then
      raise exception using errcode = '22023', message = 'widget_note_invalid';
    end if;
    v_done := (p_payload->>'done')::boolean;
    select coalesce(pg_catalog.jsonb_agg(
      case when e.v->>'id' = v_item then pg_catalog.jsonb_set(e.v, '{done}', pg_catalog.to_jsonb(v_done)) else e.v end
      order by e.ord), '[]'::jsonb)
    into v_items
    from pg_catalog.jsonb_array_elements(note.items) with ordinality as e(v, ord);
    -- The same tick again, or an item removed meanwhile: nothing to write.
    if v_items is distinct from note.items then
      update public.couple_notes as n
      set items = v_items, updated_by = credential.profile_id, updated_at = pg_catalog.now(), revision = n.revision + 1
      where n.id = note.id
      returning n.* into note;
    end if;
  elsif p_op = 'save' then
    v_title := pg_catalog.btrim(coalesce(p_payload->>'title', ''));
    v_body := coalesce(p_payload->>'body', '');
    v_items := coalesce(p_payload->'items', '[]'::jsonb);
    if pg_catalog.char_length(v_title) > 80 or pg_catalog.char_length(v_body) > 4000
       or not private.couple_note_items_valid(v_items)
       or (v_title = '' and pg_catalog.btrim(v_body) = '' and pg_catalog.jsonb_array_length(v_items) = 0) then
      raise exception using errcode = '22023', message = 'widget_note_invalid';
    end if;
    update public.couple_notes as n
    set title = v_title, body = v_body, items = v_items,
        updated_by = credential.profile_id, updated_at = pg_catalog.now(), revision = n.revision + 1
    where n.id = note.id
    returning n.* into note;
  end if;

  update public.widget_action_tokens as token
  set last_used_at = pg_catalog.now(),
      last_action_at = case when p_op = 'get' then token.last_action_at else pg_catalog.now() end
  where token.id = credential.id;

  return pg_catalog.jsonb_build_object(
    'id', note.id,
    'title', note.title,
    'body', note.body,
    'items', note.items,
    'updatedAt', note.updated_at,
    'revision', note.revision,
    'byMe', note.updated_by is not distinct from credential.profile_id,
    'byName', case when note.updated_by is null or note.updated_by = credential.profile_id then ''
      else coalesce((select person.display_name from public.profiles as person where person.id = note.updated_by), '') end
  );
end;
$fn$;

revoke all on function public.widget_note_internal(text, text, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.widget_note_internal(text, text, uuid, jsonb) to service_role;
