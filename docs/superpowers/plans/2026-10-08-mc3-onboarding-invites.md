# MC3 implementation plan

> For agentic workers: use superpowers:executing-plans to implement this plan inline, then request one read-only whole-change review.

Goal: confirmed, manually provisioned beta accounts can create/join a couple, manage a one-time partner invite, and enter the existing app once paired.

Architecture: one onboarding controller in `onboarding.js` consumes the existing Supabase client through a narrow injected API. Its pure router checks session, fresh profile and server membership; no parallel persistence or tenant authority. `app.js` retains auth, lock, single-flight and paired bootstrap. New markup/styles use existing US auth and foundation primitives.

Tech stack: vanilla JS/HTML/CSS; existing Supabase RPCs; Cloudflare PWA and Capacitor.

Spec: `docs/missions/us-mc3-onboarding-invites-v1.md`.

## Constraints and rulings

- Only create_couple, accept_partner_invite, create_partner_invite, revoke_partner_invite, get_couple_membership. No client membership table writes, SQL/RLS/Auth configuration changes, real provisioning, or production operations.
- Public signup stays disabled. Codes are bearer secrets: active-view memory/text only; deliberate clipboard/share; never storage, URLs, attributes, logs, telemetry or cache.
- User explicitly authorizes autonomous implementation of the approved spec and requires stopping only for real security/API incompatibilities; no additional design approval is needed.
- Membership/profile reads run in parallel after the lock gate. The cached-profile path cannot reveal the shell before membership verification. This adds one bounded parallel RPC; unavailable verification routes to Retry, never to create/join or a cached role fallback.
- Foreground/manual membership checks only; no periodic rotation or retry. Success uses a guarded soft initCloud transition after fresh profile/membership verification.

## Review focus

- Auth callback plus password login and suspended responses must not restore a previous user or bypass the lock.
- A transport error must not become profile absence; mismatched profile/membership must halt safely.
- An ambiguous create/join must reconcile membership before retry; generate must never be automatically retried.
- Dismissed/background/locked views must purge bearer code and form values, including hidden DOM and clipboard fallback.
- Waiting users must not initialize partner-dependent/private/native flows; paired A must retain the existing boot safety contracts.

## Tasks

- [x] Baseline and API audit: capture untouched main suite; inspect actual MC2 contract and existing bootstrap/lock/cache; no live calls.
- [x] Pure controller RED→GREEN: route/validate/error-map, exact RPC args, epoch guards, single-flight reads/mutations, reconciliation and code lifecycle. Tests in `tests/mc3-onboarding.test.js`.
- [x] UI and bootstrap RED→GREEN: `onboarding.js`, `onboarding.css`, `index.html`, `app.js`, minimal install-card guard; scenarios in a real mocked browser (`tests/mc3-browser.test.js`).
- [x] Packaging/PWA: curated Cloudflare/Capacitor lists, APP_SHELL and existing build:id mechanism. Execute worker upgrade/offline/precache failure/private cache and push-click regression tests.
- [x] Validation: dedicated/MC1/MC2/D5/auth/lock/widget tests, full suite exact failure names vs untouched main, both builds, syntax/diff/secret/URL/cache scans, all three viewport and keyboard/reduced-motion checks.
- [x] Review and delivery: fix important findings with reproductions; provisioning handoff and MC3 report; local candidate commit and clean worktree. No push/PR/merge/deploy.
