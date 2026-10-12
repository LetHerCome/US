-- US Store S3.2 - bounded message preservation vault (Phase-2 DRAFT).
-- NOT A LIVE MIGRATION. Keep outside supabase/migrations until independent
-- privacy/rights/security approval. Install ONLY on a disposable local database.
--
-- This is NOT an account delete or unpair service. NOTHING automatically
-- moves to the vault, and existing shared_messages FKs remain unchanged.
-- A future audited trusted server must obtain item-specific rights approval
-- and a permitted retention deadline before any archive entry is created.
BEGIN;
DO $s32$
BEGIN
  IF to_regclass('public.s32_preserved_messages') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='s32_preserved_messages_already_exists';
  END IF;
END
$s32$;

CREATE TABLE public.s32_preserved_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id uuid NOT NULL,
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  retaining_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text,
  body text NOT NULL,
  message_created_at timestamptz NOT NULL,
  rights_review_receipt uuid NOT NULL,
  rights_reviewed_at timestamptz NOT NULL,
  retention_expires_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT s32_preserved_unique_retaining_user UNIQUE (source_message_id, retaining_user_id),
  CONSTRAINT s32_preserved_positive_lifetime
    CHECK (retention_expires_at > rights_reviewed_at)
);
CREATE INDEX s32_preserved_recipient_expiry ON public.s32_preserved_messages
  (retaining_user_id, couple_id, retention_expires_at);

-- The source must still exist when an approved copy is captured. Never
-- accept client-provided contents, origin user identity or foreign couple.
CREATE FUNCTION private.s32_validate_preserved_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $s32$
DECLARE
  source public.shared_messages%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='s32_archive_immutable';
  END IF;
  IF NEW.rights_review_receipt IS NULL
    OR NEW.rights_reviewed_at > now()
    OR NEW.retention_expires_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='s32_retention_review_invalid';
  END IF;

  SELECT * INTO source FROM public.shared_messages m
    WHERE m.id = NEW.source_message_id AND m.couple_id = NEW.couple_id
    FOR KEY SHARE;
  IF NOT FOUND
    OR (source.sender_id <> NEW.retaining_user_id AND source.recipient_id <> NEW.retaining_user_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles p
        WHERE p.id=NEW.retaining_user_id AND p.couple_id=NEW.couple_id
    ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='s32_retention_source_invalid';
  END IF;

  -- Canonical copy; caller cannot forge message contents or timestamps.
  NEW.kind := source.kind;
  NEW.title := source.title;
  NEW.body := source.body;
  NEW.message_created_at := source.created_at;
  RETURN NEW;
END
$s32$;

CREATE TRIGGER s32_preserved_message_source_guard
BEFORE INSERT OR UPDATE ON public.s32_preserved_messages
FOR EACH ROW EXECUTE FUNCTION private.s32_validate_preserved_message();

ALTER TABLE public.s32_preserved_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.s32_preserved_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY s32_preserved_visible_only_to_retaining_member
ON public.s32_preserved_messages
FOR SELECT TO authenticated
USING (
 retaining_user_id = auth.uid()
 AND couple_id = private.current_couple_id()
 AND retention_expires_at > now()
);

-- Default grants may vary with project settings: explicitly deny all writes.
REVOKE ALL ON TABLE public.s32_preserved_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.s32_preserved_messages TO authenticated;
REVOKE ALL ON FUNCTION private.s32_validate_preserved_message() FROM PUBLIC, anon, authenticated;

-- No approved write API, no automatic copying, no permission for users to
-- nominate "reviewed" records and no deletion/unpair capability is added.
COMMIT;
