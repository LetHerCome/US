-- M5G2 — Lasciato per te: raise the shared private media ceiling for video.
--
-- This migration is prepared only. Do not apply it remotely as part of M5G2.
-- Supabase storage.buckets has one file_size_limit per bucket, so the shared
-- ceiling becomes 40 MiB while the client keeps stricter per-kind limits:
-- photo 25 MiB, audio 25 MiB, video 40 MiB.
--
-- Existing M5C bucket, MIME allowlist, privacy, ownership namespace and
-- left_for_you contracts remain authoritative and unchanged.

update storage.buckets
set file_size_limit = 41943040
where id = 'us-media';
