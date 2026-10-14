-- US S3 signed-session, cross-couple native FCM QA.
-- Run ONLY in Supabase US-STAGING (dugmhngrfkuieeletatb) after an admin
-- creates four CONFIRMED synthetic email/password accounts through Supabase
-- Auth -> Users -> Add user (not SQL auth.users injection).
--
-- Synthetic emails (never use real addresses):
-- us-s3-a1@qa.invalid, us-s3-a2@qa.invalid
-- us-s3-b1@qa.invalid, us-s3-b2@qa.invalid
--
-- This script does NOT create Auth credentials, read passwords, modify
-- Firebase credentials, deploy Edge or touch production. One-shot, fail
-- closed: a populated database or unexpected user makes it abort.
DO $qa$
DECLARE
  u_a1 uuid;
  u_a2 uuid;
  u_b1 uuid;
  u_b2 uuid;
  c_a uuid := gen_random_uuid();
  c_b uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE name = 'us_staging_baseline_from_20261004000000'
  ) THEN
    RAISE EXCEPTION 'S3 QA refuses database without US-STAGING baseline marker';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname LIKE 'us-%' AND active) THEN
    RAISE EXCEPTION 'S3 QA refuses active US cron jobs';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.couples LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.device_push_tokens LIMIT 1) THEN
    RAISE EXCEPTION 'S3 QA refuses nonempty profiles/couples/device tokens';
  END IF;
  IF (SELECT count(*) FROM auth.users) <> 4 THEN
    RAISE EXCEPTION 'S3 QA requires exactly four synthetic Auth users';
  END IF;
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) NOT IN (
      'us-s3-a1@qa.invalid', 'us-s3-a2@qa.invalid',
      'us-s3-b1@qa.invalid', 'us-s3-b2@qa.invalid'
    )
    OR email_confirmed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'S3 QA requires only four confirmed synthetic accounts';
  END IF;
  SELECT id INTO STRICT u_a1 FROM auth.users WHERE lower(email)='us-s3-a1@qa.invalid';
  SELECT id INTO STRICT u_a2 FROM auth.users WHERE lower(email)='us-s3-a2@qa.invalid';
  SELECT id INTO STRICT u_b1 FROM auth.users WHERE lower(email)='us-s3-b1@qa.invalid';
  SELECT id INTO STRICT u_b2 FROM auth.users WHERE lower(email)='us-s3-b2@qa.invalid';

  INSERT INTO public.couples(id,name,started_on)
  VALUES (c_a,'QA Couple A',DATE '2026-01-01'),(c_b,'QA Couple B',DATE '2026-01-01');

  INSERT INTO public.profiles(id,display_name,couple_id,role)
  VALUES
    (u_a1,'QA A1',c_a,'francesco'),
    (u_a2,'QA A2',c_a,'beatrice'),
    (u_b1,'QA B1',c_b,'francesco'),
    (u_b2,'QA B2',c_b,'beatrice');
END
$qa$;

-- Proof without exposing user IDs, tokens, emails or credentials:
SELECT jsonb_build_object(
  'qa_users',(SELECT count(*) FROM auth.users),
  'couples',(SELECT count(*) FROM public.couples),
  'profiles',(SELECT count(*) FROM public.profiles),
  'profile_groups',(SELECT jsonb_agg(members ORDER BY members)
                    FROM (SELECT count(*) AS members FROM public.profiles
                    GROUP BY couple_id) z),
  'tokens',(SELECT count(*) FROM public.device_push_tokens),
  'active_us_cron',(SELECT count(*) FROM cron.job
                    WHERE jobname LIKE 'us-%' AND active)
) AS s3_qa_pairing_postflight;
