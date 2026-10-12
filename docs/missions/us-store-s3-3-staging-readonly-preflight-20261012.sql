-- US Store S3.3 / US-STAGING preflight. READ-ONLY, aggregate-only, no personal identifiers.
-- 2026-10-12. Candidate fixtures are not authentication or media-byte proof.
-- Run only against project dugmhngrfkuieeletatb (US-STAGING).
-- This query never exports JWTs, usernames, e-mails, Storage paths or media bytes.
-- Four independently authenticated real QA JWTs + four truly synthetic files still required.
WITH pair_counts AS (
  SELECT c.id,
         count(p.id) AS members,
         count(p.id) FILTER (WHERE u.email_confirmed_at IS NOT NULL) AS verified_members
  FROM public.couples AS c
  LEFT JOIN public.profiles AS p ON p.couple_id = c.id
  LEFT JOIN auth.users AS u ON u.id = p.id
  GROUP BY c.id
),
synthetic_object_candidates AS (
  SELECT o.owner_id, split_part(o.name, '/', 1) AS couple_folder
  FROM storage.objects AS o
  JOIN public.profiles AS p
    ON p.id::text = o.owner_id
   AND p.couple_id::text = split_part(o.name, '/', 1)
  WHERE o.bucket_id = 'us-media'
    AND split_part(o.name, '/', 2) = o.owner_id
    AND o.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/moment-albums/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/s33-qa-[a-z0-9][a-z0-9_.-]*\.(webp|png|jpg)$'
),
policy_inventory AS (
  SELECT count(*) FILTER (
    WHERE policyname = 'us_media_select_same_couple' AND cmd = 'SELECT'
  ) AS select_policies,
  count(*) FILTER (
    WHERE policyname = 'us_media_insert_own_folder' AND cmd = 'INSERT'
  ) AS insert_policies,
  count(*) FILTER (
    WHERE policyname = 'us_media_update_own' AND cmd = 'UPDATE'
  ) AS update_policies,
  count(*) FILTER (
    WHERE policyname = 'us_media_delete_own' AND cmd = 'DELETE'
  ) AS delete_policies
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
)
SELECT
  'US-STAGING' AS environment,
  (SELECT count(*) FROM pair_counts WHERE members = 2 AND verified_members = 2) AS verified_complete_couples,
  (SELECT count(*) FROM auth.users) AS total_auth_users,
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'us-media') AS private_bucket_object_count,
  (SELECT count(*) FROM synthetic_object_candidates) AS candidate_fixture_objects,
  (SELECT count(DISTINCT owner_id) FROM synthetic_object_candidates) AS candidate_fixture_uploaders,
  (SELECT count(DISTINCT couple_folder) FROM synthetic_object_candidates) AS candidate_fixture_couples,
  (SELECT count(*) FROM storage.buckets WHERE id = 'us-media' AND public = false) = 1 AS us_media_private,
  (SELECT select_policies + insert_policies + update_policies + delete_policies FROM policy_inventory) AS required_policy_names_present,
  'NOT_RUN_REQUIRES_4_INDEPENDENT_JWTS_AND_24_GET_PROOFS' AS live_jwt_access_gate,
  false AS deletion_authorized;
