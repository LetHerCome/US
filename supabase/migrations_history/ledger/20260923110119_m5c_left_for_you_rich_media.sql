-- Production ledger 20260923110119 m5c_left_for_you_rich_media: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 c0c458ea29a44c21f3a481fdbaeca28d; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.


alter table public.left_for_you
  drop constraint left_for_you_kind_v1_check;

alter table public.left_for_you
  add constraint left_for_you_kind_m5c_check
  check (kind in ('text', 'photo', 'audio', 'video', 'music'));

alter table public.left_for_you
  add constraint left_for_you_av_contract_check
  check (
    kind not in ('audio', 'video')
    or (
      media_path is not null
      and char_length(media_path) <= 512
      and (body is null or char_length(body) <= 280)
    )
  );

alter table public.left_for_you
  add constraint left_for_you_music_contract_check
  check (
    kind <> 'music'
    or (
      media_path is not null
      and left(media_path, 8) = 'https://'
      and char_length(media_path) <= 512
      and position(' ' in media_path) = 0
      and (body is null or char_length(body) <= 280)
    )
  );

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
      select 1 from public.profiles as partner
      where partner.id = left_for_you.recipient_id
        and partner.couple_id = private.current_couple_id()
    )
    and (
      kind not in ('photo', 'audio', 'video')
      or starts_with(
        media_path,
        couple_id::text || '/' || auth.uid()::text || '/'
      )
    )
    and (
      kind <> 'music'
      or not starts_with(
        media_path,
        couple_id::text || '/' || auth.uid()::text || '/'
      )
    )
  );

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'video/mp4',
  'video/webm',
  'video/quicktime'
]::text[],
  file_size_limit = 26214400
where id = 'us-media';;
