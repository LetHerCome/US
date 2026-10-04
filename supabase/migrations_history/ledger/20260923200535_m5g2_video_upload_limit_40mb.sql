-- Production ledger 20260923200535 m5g2_video_upload_limit_40mb: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 8a4a42610342cf037c02100fd102396c; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

update storage.buckets
set file_size_limit = 41943040
where id = 'us-media';;
