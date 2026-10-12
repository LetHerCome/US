# US Store S3.3 — opt-in synthetic QA fixtures and live Storage verification

**Scope: US-STAGING only. Draft PR #190, issue #183. Not deployed; live verification NOT RUN until a protected operator executes it.**

## Why this exists
Read-only STAGING inventory on 2026-10-12 found 3 complete verified couples, 6 accounts, 0 Storage objects. Existing users have NOT been independently certified as disposable QA identities. The 24-case GET matrix requires four real separate Auth sessions and four real harmless photos; passing CI tests is not enough.

## Preconditions
- Select four pre-existing, authorized, **synthetic** and email-verified US-STAGING QA accounts: A1/A2 one couple, B1/B2 a different couple. These must not be real-person accounts. Do not silently reuse existing accounts.
- Account credentials are entered only in a protected local environment, NEVER chat, GitHub, CI, logs or shell arguments. Use a modern sb_publishable_ key; forbid service_role, modern secret keys and legacy keys.
- Running the script creates real but synthetic 1x1 PNG Storage objects on US-STAGING (never production), with explicit attestation. It does NOT create accounts, edit SQL, override/erase Storage files or relax policies.

## Local Windows run
From a checkout of this draft branch on Windows with Node 22+:

~~~powershell
git switch mission/us-store-s3-2-lifecycle-design-20261012
npm ci --ignore-scripts --no-audit --no-fund
.\scripts\s3-3-stage-qa-run.ps1
~~~

The PowerShell runner asks for an exact synthetic-account attestation, the public STAGING publishable key and four separate email/password pairs. Password entry is hidden. The runner passes the credentials to Node through the process environment and removes the environment variables on completion. It does not write a .env file, put secrets in arguments or print identities, JWTs, paths, passwords or photos.

If a local PowerShell execution policy blocks the script, use your organization's approved script-execution procedure or supply the equivalent environment variables securely to Node directly. Do not change the machine-wide policy just for this test. Do not run from untrusted PR workflows.

## What the runner actually verifies
1. Refuses to start without explicit STAGING confirmation, QA attestation, valid unprivileged key and four distinct logins.
2. Creates four isolated Supabase clients with persistence/refresh disabled. Authenticates each existing QA person independently; verifies the signed-in user through Auth and reads their own couple from profiles with RLS.
3. Ensures A1/A2 are in the same couple, B1/B2 in a different couple. Checks all four before the first object write.
4. Uploads at most four deterministic PNG fixtures into the private us-media bucket using each uploader's JWT and upsert:false. Uses the nested structure <couple>/<uploader>/moment-albums/<synthetic_moment_uuid>/s33-qa-<actor>-v1.png. A repeated run can only reuse an exact byte-identical file verified with SHA-256. Different bytes/permission failures stop. Never overwrites or deletes.
5. Immediately after each **new upload or safe collision reuse**, downloads the synthetic 1×1 PNG as that uploader and checks the returned bytes against the pinned SHA-256. A missing, unreadable, oversized or changed object **blocks the run before the access matrix**. Only aggregate `remoteFixtureBytesVerified: 4` is reported; no downloaded bytes, paths, hashes or identities are logged. This proves **source QA fixture** readback integrity, not cross-account copy integrity.
6. Runs the original hardened live Auth/Storage matrix of 4 independent Auth GET + 24 Storage GET: eight same-couple access ALLOW and sixteen cross-couple/anonymous/public DENY.
7. Prints only aggregate PASS or a sanitized BLOCKED/FAILED message. It still does not certify file transfer/copy integrity, rights approval, complete export or account deletion.

## Independent follow-up
Rerun docs/missions/us-store-s3-3-staging-readonly-preflight-20261012.sql against **US-STAGING**, confirming at least four correctly structured QA fixtures across four different uploader IDs and at least two couples, including matching backing Storage owner_id. Report only aggregate results, never user IDs, emails, object paths or tokens. An existing upload with incorrect owner metadata must not be certified.

Next phase, separately gated: authenticated PUT/COPY negative tests, external-byte checksum re-read, recovery after partial copy, database references for partner-owned Ricordi, signed-link/cache behavior and physical expiry cleanup. A JWT still valid after revocation is a separate risk; an Auth user lookup alone cannot prove immediate invalidation of every access token.

**Release remains blocked:** reviewed content rights, all 78 foreign keys, 30-day recoverable account exit, production account deletion, legal/privacy audit, deployment, merge and store release.
