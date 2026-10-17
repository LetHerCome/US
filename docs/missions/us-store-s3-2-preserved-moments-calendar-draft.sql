-- US S3.2 / policy A: reviewed shared Moments and Calendar metadata vault.
-- DRAFT ONLY / NEVER DEPLOY: outside supabase/migrations.
-- NO Auth deletion, couple unlink, Storage copy, physical media cleanup or UI.
-- Even a successful metadata copy does NOT permit deleting the source/media.
BEGIN;
DO $s32$
BEGIN
 IF to_regclass('public.s32_preserved_moments') IS NOT NULL
 OR to_regclass('public.s32_preserved_calendar') IS NOT NULL
 OR to_regclass('private.s32_content_preservation_approvals') IS NOT NULL THEN
   RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='s32_content_vault_already_exists';
 END IF;
END
$s32$;

-- This private rights register has no authenticated APIs or ACL grants.
-- The real reviewer, consent/restriction checks and TTL policy do NOT exist.
CREATE TABLE private.s32_content_preservation_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 content_type text NOT NULL CHECK (content_type IN ('moment','calendar_shared')),
 source_id uuid NOT NULL,
 couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
 retaining_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 review_basis text NOT NULL CHECK (review_basis='ELIGIBLE_SHARED_REVIEWED'),
 reviewed_at timestamptz NOT NULL,
 retention_expires_at timestamptz NOT NULL,
 CONSTRAINT s32_content_review_positive_lifetime CHECK (retention_expires_at > reviewed_at),
 CONSTRAINT s32_content_review_one_user UNIQUE (content_type,source_id,retaining_user_id)
);
ALTER TABLE private.s32_content_preservation_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.s32_content_preservation_approvals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.s32_content_preservation_approvals FROM PUBLIC, anon, authenticated;

CREATE TABLE public.s32_preserved_moments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_moment_id uuid NOT NULL,
 couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
 retaining_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 caption text,
 moment_date date NOT NULL,
 original_created_at timestamptz NOT NULL,
 -- Do not return source media paths, thumbnails or unverified Storage URLs.
 media_state text NOT NULL DEFAULT 'BLOCKED_PENDING_STORAGE_TRANSFER'
   CHECK (media_state='BLOCKED_PENDING_STORAGE_TRANSFER'),
 review_receipt uuid NOT NULL,
 reviewed_at timestamptz NOT NULL,
 retention_expires_at timestamptz NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT s32_preserved_moment_once UNIQUE (source_moment_id,retaining_user_id),
 CONSTRAINT s32_preserved_moment_positive_lifetime CHECK (retention_expires_at>reviewed_at)
);
CREATE INDEX s32_preserved_moments_expiry ON public.s32_preserved_moments(retaining_user_id,couple_id,retention_expires_at);

CREATE TABLE public.s32_preserved_calendar (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_entry_id uuid NOT NULL,
 couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
 retaining_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 entry_type text NOT NULL DEFAULT 'shared' CHECK (entry_type='shared'),
 title text NOT NULL,
 description text,
 is_all_day boolean NOT NULL,
 starts_at timestamptz,
 ends_at timestamptz,
 start_date date,
 end_date date,
 original_created_at timestamptz NOT NULL,
 -- Exact location omitted: its privacy rights require separate review.
 review_receipt uuid NOT NULL,
 reviewed_at timestamptz NOT NULL,
 retention_expires_at timestamptz NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT s32_preserved_calendar_once UNIQUE (source_entry_id,retaining_user_id),
 CONSTRAINT s32_preserved_calendar_positive_lifetime CHECK (retention_expires_at>reviewed_at)
);
CREATE INDEX s32_preserved_calendar_expiry ON public.s32_preserved_calendar(retaining_user_id,couple_id,retention_expires_at);

CREATE FUNCTION private.s32_validate_preserved_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $s32$
DECLARE
 a private.s32_content_preservation_approvals%ROWTYPE;
 m public.moments%ROWTYPE;
 c public.calendar_entries%ROWTYPE;
 v_source_id uuid;
 kind text;
 cid uuid;
 retained uuid;
BEGIN
 IF TG_OP <> 'INSERT' THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='s32_content_archive_immutable';
 END IF;
 IF TG_TABLE_NAME='s32_preserved_moments' THEN
  v_source_id:=NEW.source_moment_id; kind:='moment';
 ELSE
  v_source_id:=NEW.source_entry_id; kind:='calendar_shared';
 END IF;
 cid:=NEW.couple_id; retained:=NEW.retaining_user_id;
 IF NEW.reviewed_at>now() OR NEW.retention_expires_at<=now()
 OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=retained AND p.couple_id=cid) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='s32_content_rights_invalid';
 END IF;
 SELECT * INTO a FROM private.s32_content_preservation_approvals approval
 WHERE approval.id=NEW.review_receipt
   AND approval.content_type=kind
   AND approval.source_id=v_source_id
   AND approval.couple_id=cid
   AND approval.retaining_user_id=retained
   AND approval.review_basis='ELIGIBLE_SHARED_REVIEWED'
   AND approval.reviewed_at=NEW.reviewed_at
   AND approval.retention_expires_at=NEW.retention_expires_at;
 IF NOT FOUND THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='s32_content_review_missing';
 END IF;
 IF kind='moment' THEN
  SELECT * INTO m FROM public.moments orig WHERE orig.id=v_source_id AND orig.couple_id=cid FOR KEY SHARE;
  IF NOT FOUND OR m.created_by=retained THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='s32_content_source_invalid';
  END IF;
  -- Copy original metadata only. NO media bytes, paths, URLs or authorship.
  NEW.caption:=m.caption;
  NEW.moment_date:=m.moment_date;
  NEW.original_created_at:=m.created_at;
  NEW.media_state:='BLOCKED_PENDING_STORAGE_TRANSFER';
 ELSE
  SELECT * INTO c FROM public.calendar_entries orig WHERE orig.id=v_source_id AND orig.couple_id=cid FOR KEY SHARE;
  IF NOT FOUND OR c.entry_type<>'shared' OR c.owner_id IS NOT NULL OR c.created_by=retained THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='s32_content_source_invalid';
  END IF;
  NEW.entry_type:='shared';
  NEW.title:=c.title;
  NEW.description:=c.description;
  NEW.is_all_day:=c.is_all_day;
  NEW.starts_at:=c.starts_at;
  NEW.ends_at:=c.ends_at;
  NEW.start_date:=c.start_date;
  NEW.end_date:=c.end_date;
  NEW.original_created_at:=c.created_at;
 END IF;
 RETURN NEW;
END
$s32$;

CREATE TRIGGER s32_preserved_moment_validate BEFORE INSERT OR UPDATE ON public.s32_preserved_moments
 FOR EACH ROW EXECUTE FUNCTION private.s32_validate_preserved_content();
CREATE TRIGGER s32_preserved_calendar_validate BEFORE INSERT OR UPDATE ON public.s32_preserved_calendar
 FOR EACH ROW EXECUTE FUNCTION private.s32_validate_preserved_content();

ALTER TABLE public.s32_preserved_moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.s32_preserved_moments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.s32_preserved_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.s32_preserved_calendar FORCE ROW LEVEL SECURITY;

CREATE POLICY s32_preserved_moments_survivor_only
ON public.s32_preserved_moments FOR SELECT TO authenticated
USING (retaining_user_id=auth.uid()
 AND couple_id=private.current_couple_id() AND retention_expires_at>now());
CREATE POLICY s32_preserved_calendar_survivor_only
ON public.s32_preserved_calendar FOR SELECT TO authenticated
USING (retaining_user_id=auth.uid()
 AND couple_id=private.current_couple_id() AND retention_expires_at>now());

REVOKE ALL ON TABLE public.s32_preserved_moments FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.s32_preserved_calendar FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.s32_preserved_moments TO authenticated;
GRANT SELECT ON TABLE public.s32_preserved_calendar TO authenticated;
REVOKE ALL ON FUNCTION private.s32_validate_preserved_content() FROM PUBLIC,anon,authenticated;
COMMIT;
