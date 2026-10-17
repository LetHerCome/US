-- US Store S3.2: READ-ONLY foreign key and RLS preflight.
-- Never invoke ALTER, DELETE, TRUNCATE, UPDATE, auth.admin deleteUser or Storage removal.
-- Run on a verified project and retain only aggregate schema evidence.
BEGIN READ ONLY;

SELECT confrelid::regclass::text AS referenced_table,
       CASE confdeltype WHEN 'c' THEN 'CASCADE'
                        WHEN 'n' THEN 'SET NULL'
                        WHEN 'a' THEN 'NO ACTION'
                        WHEN 'r' THEN 'RESTRICT'
                        WHEN 'd' THEN 'SET DEFAULT' END AS on_delete,
       count(*)::integer AS fk_count
FROM pg_constraint
WHERE contype='f'
  AND connamespace='public'::regnamespace
  AND confrelid IN ('auth.users'::regclass,'public.profiles'::regclass,'public.couples'::regclass)
GROUP BY confrelid,confdeltype
ORDER BY referenced_table,on_delete;

SELECT conrelid::regclass::text AS affected_table,
       conname AS constraint_name,
       confrelid::regclass::text AS referenced_table,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype='f'
  AND connamespace='public'::regnamespace
  AND confrelid IN ('auth.users'::regclass,'public.profiles'::regclass,'public.couples'::regclass)
ORDER BY referenced_table,affected_table,constraint_name;

SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls,
       count(p.polname)::integer AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid=c.oid
WHERE n.nspname='public' AND c.relkind='r'
  AND (c.relname IN ('profiles','couples','couple_invites','device_push_tokens')
    OR EXISTS (SELECT 1 FROM information_schema.columns k
      WHERE k.table_schema='public' AND k.table_name=c.relname
        AND k.column_name='couple_id'))
GROUP BY n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity
ORDER BY schema_name,table_name;

SELECT b.id AS storage_bucket, b.public AS publicly_readable,
       (SELECT count(*)::integer FROM storage.objects o WHERE o.bucket_id=b.id) AS object_count
FROM storage.buckets b
WHERE b.id='us-media';

SELECT policyname,cmd,roles,qual,with_check
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
ORDER BY policyname;

COMMIT;
