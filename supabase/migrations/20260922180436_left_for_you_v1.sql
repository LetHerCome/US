-- M5B — Lasciato per te V1 (dominio dedicato, semantica propria).
-- Contenuto privato da un partner all'altro: persistente (nessuna scadenza),
-- sender/recipient espliciti, unseen/seen server-authoritative, Realtime.
-- V1 kinds: text, photo. Estensibile (audio, video, music) senza nuovi sistemi.
-- Forward-only. NON tocca stories, story_views, moments, moment_photos.
-- V1: nessuna DELETE client (nessuna semantica "ritira il proprio item").

create table public.left_for_you (
  id uuid not null default gen_random_uuid() primary key,
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  body text,
  media_path text,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  constraint left_for_you_kind_v1_check
    check (kind in ('text', 'photo')),
  constraint left_for_you_text_contract_check
    check (
      kind <> 'text'
      or (
        body is not null
        and char_length(btrim(body)) between 1 and 1000
        and media_path is null
      )
    ),
  constraint left_for_you_photo_contract_check
    check (
      kind <> 'photo'
      or (media_path is not null and char_length(media_path) <= 512
          and (body is null or char_length(body) <= 280))
    ),
  constraint left_for_you_no_self_check
    check (sender_id <> recipient_id),
  constraint left_for_you_media_path_unique
    unique (media_path)
);

create index left_for_you_recipient_created_idx
  on public.left_for_you (recipient_id, created_at desc);
create index left_for_you_couple_created_idx
  on public.left_for_you (couple_id, created_at desc);
create index left_for_you_recipient_unseen_idx
  on public.left_for_you (recipient_id, created_at desc)
  where seen_at is null;

alter table public.left_for_you enable row level security;
alter table public.left_for_you force row level security;

-- Solo i due partecipanti della coppia vedono l'item.
create policy left_for_you_select_participants
  on public.left_for_you
  for select to authenticated
  using (
    couple_id = private.current_couple_id()
    and auth.uid() in (sender_id, recipient_id)
  );

-- Solo il sender crea, per il proprio partner nella stessa coppia.
-- text: nessun media. photo: media_path deve essere dentro la propria
-- cartella di ownership nel bucket us-media (couple_id/sender_id/...).
create policy left_for_you_insert_own
  on public.left_for_you
  for insert to authenticated
  with check (
    couple_id = private.current_couple_id()
    and sender_id = auth.uid()
    and recipient_id <> sender_id
    and exists (
      select 1 from public.profiles partner
      where partner.id = recipient_id
        and partner.couple_id = couple_id
    )
    and (
      kind <> 'photo'
      or starts_with(
        media_path,
        couple_id::text || '/' || auth.uid()::text || '/'
      )
    )
  );

-- V1: nessuna policy DELETE/UPDATE per il client. Le operazioni di stato
-- (seen) passano esclusivamente dall RPC server-authoritative.

-- Seen server-authoritative: solo il recipient, idempotente, non revocabile.
create or replace function public.mark_left_item_seen(target_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.left_for_you%rowtype;
  result_seen_at timestamptz;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select item.* into item
  from public.left_for_you as item
  where item.id = target_item_id
    and item.couple_id = private.current_couple_id()
    and item.recipient_id = auth.uid()
  for update;

  if item.id is null then
    raise exception using errcode = '42501', message = 'left_item_recipient_required';
  end if;

  if item.seen_at is null then
    update public.left_for_you as entry
    set seen_at = now()
    where entry.id = item.id
    returning entry.seen_at into result_seen_at;
  else
    result_seen_at := item.seen_at;
  end if;

  return jsonb_build_object(
    'id', item.id,
    'status', case when item.seen_at is null then 'seen' else 'already_seen' end,
    'seen_at', result_seen_at
  );
end;
$$;

revoke all on function public.mark_left_item_seen(uuid) from public, anon, authenticated;
grant execute on function public.mark_left_item_seen(uuid) to authenticated;

-- Grants tabella allineati allo standard Supabase (selettività via RLS).

-- Realtime: nuovo item e transizione seen per il recipient.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'left_for_you'
  ) then
    alter publication supabase_realtime add table public.left_for_you;
  end if;
end
$$;
