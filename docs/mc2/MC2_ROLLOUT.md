# MC2 review and separate rollout

This branch is a repository-only candidate. Nothing here authorizes deployment,
merge, remote SQL, signup, Auth cleanup, Storage remediation or ledger repair.

## Review checklist

- Review the blueprint together with the binding amendments in the mission document.
- Confirm the five RPC signatures, jsonb outputs, rejection tokens and anonymous-account gate.
- Confirm user advisory → actor row → invite row → membership locks; inspect the real PostgreSQL race evidence.
- Inspect exact LEGACY/TARGET/UNKNOWN catalog verification. Target drift must abort, never repair.
- Inspect the profile grant test with a deliberately permissive policy (DB-24).
- Inspect catalog-derived bidirectional isolation, including populated witnesses and the history view.
- Confirm `list_couple_questions()` remains retired and returns `42501` to clients.
- Read the complete baseline/head failure comparison; no unrelated failures were repaired.
- Verify protected paths, original migrations, current state, UI, native projects and Edge Functions are unchanged.
- Keep rollout separate from candidate review. No PR was created by this mission.

## Production procedure — Francesco only, separately authorized

1. Run `MC2_PREFLIGHT_READONLY.sql` and save count/catalog evidence securely. It does not return bearer codes, hashes, emails or credentials.
2. Compare the live schema with the audited legacy state. Native Notifications is functionally installed despite missing ledger version `20261006200000`; the ledger does not describe its actual schema.
3. Never use a broad push of pending migrations. Do not reapply Native Notifications or repair the ledger as part of MC2. Apply only the reviewed MC2 SQL, in one transaction, after a separate explicit authorization.
4. Rerun the read-only catalog checks. MC2 adds exactly `expires_at`, `revoked_at`, `created_by`; client access to invite rows remains denied. A migration rerun verifies exact target and changes nothing.
5. Use controlled permanent confirmed accounts to exercise create → invite → accept. Public signup stays OFF. Check the current Couple A remains unchanged and tenant data is isolated in both directions.
6. Do not launch a real beta couple before the separate onboarding/copy mission: legacy UI/game slot labels still contain Francesco/Bea.

`MC2_KILL_SWITCH.sql` is a separately reviewed operational artifact. It revokes
the four mutation RPCs and revokes unused bearer invites without removing couples,
profiles, sessions or Storage. It deliberately leaves membership reads available.
The exact-target migration refuses the kill-switched state: it must never silently
re-enable functions. Re-enabling requires a separate reviewed operational change.

Any test-couple deletion is destructive and outside this mission. Do not copy a
cleanup command into rollout; positively identify the test tenant and obtain
explicit authorization before touching Auth, tenant data or Storage.
