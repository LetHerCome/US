-- M5C — Lasciato per te: rich media (audio, video, music + nota opzionale).
--
-- Estende il dominio M5B (text, photo) a:
--   * audio: media_path privato nel bucket us-media + nota breve opzionale
--   * video: media_path privato nel bucket us-media + nota breve opzionale
--   * music: URL esterno HTTPS provider-neutral + nota breve opzionale
--
-- NESSUN sistema parallelo: stessa tabella, stesso bucket us-media, stesse
-- policy di ownership (couple_id/sender_id/...) per ogni media caricato.
-- Il bucket resta privato: viene solo esteso il MIME allowlist e rilassato
-- il size ceiling globale (Supabase non supporta limiti per-kind su un
-- singolo bucket: la scelta è documentata qui sotto).
--
-- TRADEOFF SIZE CEILING (documentato, non nascosto):
--   il bucket configuration Supabase supporta UN SOLO file_size_limit per
--   bucket, non limiti per-kind. Il ceiling globale viene portato da 8 MB a
--   25 MB per rendere utilizzabili brevi clip video. Conseguenza onesta:
--   anche photo/audio potrebbero ora occupare fino a 25 MB ciascuna.
--   Il contratto DB (media_path <= 512, note <= 280) NON limita i byte:
--   il limite reale resta quello del bucket.
--
-- MUSIC: provider-neutral. Nessuna API Spotify/Apple, nessun OAuth,
-- nessun embed/HTML/JS, nessuno scraping di metadati. Solo un URL HTTPS
-- esterno in media_path. Il contratto VIETA che un item music punti a un
-- path del bucket (nessun media caricato travestito da music).
--
-- Forward-only. NON riscrive le migration M5B (20260922180436,
-- 20260922182210, 20260923100236): solo drop/recreate del constraint kind e
-- della insert policy, estesi. Realtime, seen lifecycle, grants, RLS
-- select: INVARIATI.

-- 1) kind esteso: text, photo, audio, video, music.
alter table public.left_for_you
  drop constraint left_for_you_kind_v1_check;

alter table public.left_for_you
  add constraint left_for_you_kind_m5c_check
  check (kind in ('text', 'photo', 'audio', 'video', 'music'));

-- 2) audio/video contract: media privato obbligatorio, nota breve opzionale
--    (stesso contratto della photo M5B: nessuna deriva semantica).
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

-- 3) music contract: URL esterno HTTPS obbligatorio, provider-neutral.
--    Nessuno spazio (URL unica, non lista), lunghezza limitata, nota breve
--    opzionale. Il check non ammette schema http:// (solo https).
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

-- 4) Insert policy estesa (stessa semantica M5B, namespace esteso).
--    * photo/audio/video: media_path DEVE stare nella cartella di ownership
--      del sender nel bucket us-media: couple_id/sender_id/...
--    * music: media_path è un URL esterno e NON DEVE puntare a un path del
--      bucket di ownership (il media caricato non è un music item).
--    * seen_at is null: invariante M5B invariato (insert sempre unseen).
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

-- 5) Bucket esteso: STESSO bucket us-media, nessun bucket parallelo.
--    Il bucket resta privato (public non toccato). MIME allowlist
--    conservativo: formati realistici di cattura/sceelta su iOS + Android +
--    web. Solo l'id us-media è toccato.
--    TRADEOFF documentato sopra: ceiling globale unico 8 MB -> 25 MB.
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
where id = 'us-media';