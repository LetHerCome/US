-- Production ledger 20261003160000 f1a_revoke_claim_us_role: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 3 statement(s); unmasked md5 11da93c51f35ee66422bae3dcd1d2c01; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- US 2.0 F1A — Legacy auth shutdown: retire the anonymous pairing RPC.
--
-- public.claim_us_role(invite_code, chosen_role) is the pre-password pairing
-- path. It is SECURITY DEFINER, requires an ANONYMOUS caller, never checks
-- couple_invites.used_at/used_by, and replaces (deletes) the existing profile
-- of the chosen role. Any anonymous session holding an original invite code
-- could therefore take over Francesco's or Beatrice's profile.
--
-- US login is email + password only (no client calls this RPC since the
-- password-only front door). Anonymous sign-ins and public signup are
-- disabled in the same mission (supabase/config.toml, `config push`).
--
-- Compatibility-safe neutralisation: the function definition, its owner and
-- the migration history (20260928071749, 20260929121430) are kept intact; only
-- the client-facing EXECUTE grants are revoked. PUBLIC is revoked too because
-- Postgres' default function ACL lives there. postgres (owner) and
-- service_role keep EXECUTE: nothing calls it, and no client JWT maps to them.
-- No SECURITY DEFINER, RLS, data, profile or invite change.

revoke execute on function public.claim_us_role(text, text) from public, anon, authenticated;

comment on function public.claim_us_role(text, text) is
  'RETIRED (US 2.0 F1A): legacy anonymous pairing. EXECUTE revoked from public/anon/authenticated; login is email + password only. Kept for migration-history compatibility; do not re-grant.';

do $$
begin
  if has_function_privilege('anon', 'public.claim_us_role(text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_us_role(text, text)', 'execute') then
    raise exception 'F1A: claim_us_role is still executable by a client role';
  end if;
end
$$;
