-- US Store 1.0 / S3.2: Stage-1 account exit impact preview.
-- STAGING DRAFT ONLY. NOT in deployed supabase/migrations/ ledger.
-- This is READ-ONLY execution logic despite CREATE FUNCTION DDL install.
-- NO delete, unpair, anonymization, retained-media decision or job scheduling.
-- Self-contained, deny-by-default, no content/partner IDs returned.
--
-- Explicit deployment authorization + independent security review required.
-- The function is never a pre-authorization for a destructive action.
BEGIN;
DO $s32$
BEGIN
  IF to_regprocedure('public.s32_preview_account_exit()') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 's32_preview_already_exists';
  END IF;
END
$s32$;

CREATE FUNCTION public.s32_preview_account_exit()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $s32$
DECLARE
  actor uuid := auth.uid();
  cid uuid;
  member_count integer;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;

  SELECT p.couple_id INTO cid
  FROM public.profiles p
  JOIN auth.users u ON u.id=p.id
  WHERE p.id=actor AND p.couple_id IS NOT NULL AND u.email_confirmed_at IS NOT NULL;

  IF cid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'membership_unavailable';
  END IF;

  SELECT count(*)::integer INTO member_count
  FROM public.profiles p WHERE p.couple_id=cid;

  RETURN jsonb_build_object(
    'mode','READ_ONLY_PREVIEW',
    'scope','REQUESTING_MEMBER_ONLY',
    'individual_account_deletion_enabled',false,
    'couple_deletion_enabled',false,
    'requires_content_rights_review',true,
    'requires_storage_cleanup',true,
    'requires_fkey_migration',true,
    'member_count',member_count,
    'self_sent_messages',(SELECT count(*) FROM public.shared_messages m
      WHERE m.couple_id=cid AND m.sender_id=actor),
    'self_received_messages',(SELECT count(*) FROM public.shared_messages m
      WHERE m.couple_id=cid AND m.recipient_id=actor),
    'self_created_moments',(SELECT count(*) FROM public.moments m
      WHERE m.couple_id=cid AND m.created_by=actor),
    'self_created_photos',(SELECT count(*) FROM public.moment_photos m
      WHERE m.couple_id=cid AND m.created_by=actor),
    'self_created_calendar_entries',(SELECT count(*) FROM public.calendar_entries c
      WHERE c.couple_id=cid AND c.created_by=actor),
    'self_daily_answers',(SELECT count(*) FROM public.daily_answers a
      WHERE a.couple_id=cid AND a.user_id=actor),
    'self_push_devices',(SELECT count(*) FROM public.device_push_tokens t
      WHERE t.couple_id=cid AND t.user_id=actor)
  );
END
$s32$;

-- Never leave SECURITY DEFINER executable by the default PUBLIC role.
REVOKE ALL ON FUNCTION public.s32_preview_account_exit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.s32_preview_account_exit() FROM anon;
GRANT EXECUTE ON FUNCTION public.s32_preview_account_exit() TO authenticated;
COMMIT;
