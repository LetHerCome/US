-- US S3.2 / Phase 2.4: partner-uploaded album-photo REFERENCE continuity ONLY.
-- DRAFT / NOT DEPLOYABLE. This is NOT a media byte transfer or account-erasure migration.
-- Install ONLY on disposable test PostgreSQL after s3-2-preserved-moments-calendar-draft.sql.
-- No Storage paths, signed URLs, media bytes, original author reassignment, Auth deletion.
BEGIN;
DO $s32$
BEGIN
 IF to_regclass('private.s32_partner_photo_review_approvals') IS NOT NULL
 OR to_regclass('public.s32_preserved_partner_photos') IS NOT NULL
 OR to_regprocedure('private.s32_validate_preserved_partner_photo()') IS NOT NULL THEN
   RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='s32_partner_photo_vault_already_exists';
 END IF;
 IF to_regclass('public.s32_preserved_moments') IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='s32_reviewed_parent_vault_required';
 END IF;
END
$s32$;

-- Test fixtures may populate these rights receipts in disposable DB only.
-- No actual legal rights reviewer, consent verification, TTL determination exists.
CREATE TABLE private.s32_partner_photo_review_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_photo_id uuid NOT NULL,
 source_moment_id uuid NOT NULL,
 couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
 retaining_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 review_basis text NOT NULL CHECK (review_basis='ELIGIBLE_PARTNER_PHOTO_REVIEWED'),
 reviewed_at timestamptz NOT NULL,
 retention_expires_at timestamptz NOT NULL,
 CONSTRAINT s32_partner_photo_review_positive_lifetime CHECK (retention_expires_at>reviewed_at),
 CONSTRAINT s32_partner_photo_review_once UNIQUE(source_photo_id,retaining_user_id)
);
ALTER TABLE private.s32_partner_photo_review_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.s32_partner_photo_review_approvals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.s32_partner_photo_review_approvals FROM PUBLIC,anon,authenticated;

-- No FK to original Moment, photo, or departing user's profile.
-- Thus a source cascade cannot automatically destroy this metadata-only copy.
-- The original Storage object and database reference are NOT restored for the app.
CREATE TABLE public.s32_preserved_partner_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_photo_id uuid NOT NULL,
 source_moment_id uuid NOT NULL,
 couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
 retaining_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 caption text,
 position smallint NOT NULL CHECK (position>=1),
 original_created_at timestamptz NOT NULL,
 media_state text NOT NULL DEFAULT 'BLOCKED_PENDING_RIGHTS_STORAGE_AND_PARENT_REBIND'
  CHECK (media_state='BLOCKED_PENDING_RIGHTS_STORAGE_AND_PARENT_REBIND'),
 review_receipt uuid NOT NULL,
 reviewed_at timestamptz NOT NULL,
 retention_expires_at timestamptz NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT s32_partner_photo_archive_once UNIQUE(source_photo_id,retaining_user_id),
 CONSTRAINT s32_partner_photo_archive_positive_lifetime CHECK (retention_expires_at>reviewed_at)
);
CREATE INDEX s32_preserved_partner_photos_expiry
 ON public.s32_preserved_partner_photos(retaining_user_id,couple_id,retention_expires_at);

-- Server-trusted canonical metadata only; source/photo/parent locked until insert ends.
-- SECURITY DEFINER is private and is NOT granted to app roles.
CREATE FUNCTION private.s32_validate_preserved_partner_photo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $s32$
DECLARE
 a private.s32_partner_photo_review_approvals%ROWTYPE;
 p public.moment_photos%ROWTYPE;
 m public.moments%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='s32_partner_photo_archive_immutable';
 END IF;
 IF NEW.reviewed_at>now() OR NEW.retention_expires_at<=now()
 OR NOT EXISTS (SELECT 1 FROM public.profiles r
                WHERE r.id=NEW.retaining_user_id AND r.couple_id=NEW.couple_id) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='s32_partner_photo_rights_invalid';
 END IF;
 SELECT * INTO a FROM private.s32_partner_photo_review_approvals approval
 WHERE approval.id=NEW.review_receipt
   AND approval.source_photo_id=NEW.source_photo_id
   AND approval.source_moment_id=NEW.source_moment_id
   AND approval.couple_id=NEW.couple_id
   AND approval.retaining_user_id=NEW.retaining_user_id
   AND approval.review_basis='ELIGIBLE_PARTNER_PHOTO_REVIEWED'
   AND approval.reviewed_at=NEW.reviewed_at
   AND approval.retention_expires_at=NEW.retention_expires_at;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='s32_partner_photo_review_missing';
 END IF;
 SELECT * INTO m FROM public.moments original_moment
 WHERE original_moment.id=NEW.source_moment_id
   AND original_moment.couple_id=NEW.couple_id FOR KEY SHARE;
 IF NOT FOUND OR m.created_by=NEW.retaining_user_id THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='s32_partner_photo_parent_invalid';
 END IF;
 SELECT * INTO p FROM public.moment_photos original_photo
 WHERE original_photo.id=NEW.source_photo_id
   AND original_photo.moment_id=NEW.source_moment_id
   AND original_photo.couple_id=NEW.couple_id FOR KEY SHARE;
 IF NOT FOUND OR p.created_by<>NEW.retaining_user_id THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='s32_partner_photo_owner_invalid';
 END IF;
 -- Both an individual photo approval and an already-reviewed parent Moment required.
 IF NOT EXISTS (
  SELECT 1 FROM public.s32_preserved_moments kept
  WHERE kept.source_moment_id=NEW.source_moment_id
    AND kept.couple_id=NEW.couple_id
    AND kept.retaining_user_id=NEW.retaining_user_id
    AND kept.retention_expires_at>now()
 ) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='s32_partner_photo_parent_not_reviewed';
 END IF;
 -- Do NOT copy storage_path, author, user identity, or other original metadata.
 NEW.caption:=p.caption;
 NEW.position:=p.position;
 NEW.original_created_at:=p.created_at;
 NEW.media_state:='BLOCKED_PENDING_RIGHTS_STORAGE_AND_PARENT_REBIND';
 RETURN NEW;
END
$s32$;

CREATE TRIGGER s32_partner_photo_archive_validate
 BEFORE INSERT OR UPDATE ON public.s32_preserved_partner_photos
 FOR EACH ROW EXECUTE FUNCTION private.s32_validate_preserved_partner_photo();

ALTER TABLE public.s32_preserved_partner_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.s32_preserved_partner_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY s32_preserved_partner_photos_survivor_only
 ON public.s32_preserved_partner_photos FOR SELECT TO authenticated
 USING (
  retaining_user_id=auth.uid()
  AND couple_id=private.current_couple_id()
  AND retention_expires_at>now()
  AND EXISTS (
   SELECT 1 FROM public.s32_preserved_moments kept
   WHERE kept.source_moment_id=source_moment_id
     AND kept.couple_id=couple_id
     AND kept.retaining_user_id=retaining_user_id
     AND kept.retention_expires_at>now()
  )
 );

REVOKE ALL ON TABLE public.s32_preserved_partner_photos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.s32_preserved_partner_photos TO authenticated;
REVOKE ALL ON FUNCTION private.s32_validate_preserved_partner_photo() FROM PUBLIC,anon,authenticated;
COMMIT;
