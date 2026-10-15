-- US Store S3.2 / Phase 2.5: retain the canonical PRIVATE Storage locator
-- of an already-reviewed photo uploaded by the remaining member.
-- DRAFT ONLY. Disposable PostgreSQL tests ONLY, never deployed to Supabase.
-- This is NOT an executable account deletion, signed URL, media transfer,
-- data-subject-rights approval, or verification that object bytes still exist.
BEGIN;
DO $s32$
BEGIN
 IF to_regclass('private.s32_partner_photo_storage_refs') IS NOT NULL
 OR to_regprocedure('private.s32_validate_partner_photo_storage_ref()') IS NOT NULL THEN
   RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='s32_partner_photo_storage_ref_already_exists';
 END IF;
 IF to_regclass('public.s32_preserved_partner_photos') IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='s32_reviewed_partner_photo_vault_required';
 END IF;
END
$s32$;

CREATE TABLE private.s32_partner_photo_storage_refs (
  preserved_photo_id uuid PRIMARY KEY REFERENCES public.s32_preserved_partner_photos(id) ON DELETE CASCADE,
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  retaining_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bucket_id text NOT NULL DEFAULT 'us-media' CHECK (bucket_id = 'us-media'),
  -- Exact original *partner-owned* path, never exposed to normal clients.
  storage_path text NOT NULL,
  verification_state text NOT NULL DEFAULT 'BLOCKED_PENDING_REAL_STORAGE_AUTH_AND_BYTES'
   CHECK (verification_state='BLOCKED_PENDING_REAL_STORAGE_AUTH_AND_BYTES'),
  first_recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX s32_partner_photo_storage_ref_owner
 ON private.s32_partner_photo_storage_refs(retaining_user_id,couple_id);
ALTER TABLE private.s32_partner_photo_storage_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.s32_partner_photo_storage_refs FORCE ROW LEVEL SECURITY;

CREATE FUNCTION private.s32_validate_partner_photo_storage_ref()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $s32$
DECLARE
  kept public.s32_preserved_partner_photos%ROWTYPE;
  original public.moment_photos%ROWTYPE;
  parts text[];
  candidate text;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='s32_partner_media_ref_immutable';
 END IF;

 SELECT * INTO kept FROM public.s32_preserved_partner_photos p
 WHERE p.id=NEW.preserved_photo_id
   AND p.retaining_user_id=NEW.retaining_user_id
   AND p.couple_id=NEW.couple_id
   AND p.retention_expires_at>now()
   AND p.media_state='BLOCKED_PENDING_RIGHTS_STORAGE_AND_PARENT_REBIND'
 FOR KEY SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='s32_partner_media_ref_unreviewed';
 END IF;

 SELECT * INTO original FROM public.moment_photos p
 WHERE p.id=kept.source_photo_id AND p.moment_id=kept.source_moment_id
   AND p.couple_id=NEW.couple_id AND p.created_by=NEW.retaining_user_id
 FOR KEY SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='s32_partner_media_source_invalid';
 END IF;
 candidate:=original.storage_path;
 IF candidate IS NULL OR char_length(candidate)>640
   OR candidate !~ '^[A-Za-z0-9_./-]+$'
   OR candidate LIKE '%//%' OR candidate LIKE '%/./%'
   OR candidate LIKE '%/../%' OR candidate LIKE '%/..'
   OR candidate LIKE '%/.'
   OR candidate NOT LIKE NEW.couple_id::text||'/'||NEW.retaining_user_id::text||'/%' THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='s32_partner_media_path_invalid';
 END IF;
 parts:=string_to_array(candidate,'/');
 IF array_length(parts,1)<3 OR array_length(parts,1)>10
   OR EXISTS (SELECT 1 FROM unnest(parts) AS segment(v) WHERE v IN ('','.','..')) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='s32_partner_media_path_invalid';
 END IF;

 -- Canonical private locator only; caller can never forge/redirect it.
 NEW.bucket_id:='us-media';
 NEW.storage_path:=candidate;
 NEW.verification_state:='BLOCKED_PENDING_REAL_STORAGE_AUTH_AND_BYTES';
 RETURN NEW;
END
$s32$;
CREATE TRIGGER s32_partner_media_locator_insert_guard
 BEFORE INSERT OR UPDATE ON private.s32_partner_photo_storage_refs
 FOR EACH ROW EXECUTE FUNCTION private.s32_validate_partner_photo_storage_ref();

-- No read, write, update or deletion grants for app/anon roles.
-- A future audited service will need new *separate* approved capabilities.
REVOKE ALL ON TABLE private.s32_partner_photo_storage_refs FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.s32_validate_partner_photo_storage_ref() FROM PUBLIC,anon,authenticated;
COMMIT;
