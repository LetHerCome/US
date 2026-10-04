# US — Agent Authority

US is a private couple app built with vanilla HTML/CSS/JavaScript, Supabase and a PWA-first frontend.

## Read order

For every mission, read only what is needed, in this order:

1. the user's explicit request;
2. this file;
3. the active mission spec in `docs/missions/`;
4. `docs/CURRENT_STATE.md`;
5. `docs/DECISIONS.md`;
6. `docs/ARCHITECTURE.md`;
7. product authority: `docs/product/us-vnext-vision.md`.

Do not reconstruct project history from old milestone files unless the active mission needs it. Current implementation status in `docs/CURRENT_STATE.md` overrides stale status sections in older roadmap/vision documents.

## Execution rules

- Production branch is `main`. Never work directly on `main`.
- One meaningful mission = one branch/worktree. Keep using it through audit, implementation, fixes and review; remove it after merge.
- Production frontend is Cloudflare Pages. Vercel is legacy/out of scope.
- Reuse existing systems/helpers before creating parallel implementations.
- Preserve the current stack. No React, Tailwind, framework migration or rewrite unless explicitly requested.
- `ui-foundation.css` and `ui-foundation.js` are the authority for cross-cutting UI primitives.
- Mobile/PWA first. Respect safe areas, reduced motion and constrained viewports.
- Do not deploy, merge, publish, change production Supabase, rotate secrets or perform irreversible data operations unless the user explicitly authorizes that step.
- Keep micro-fixes small. Architectural work requires an audit/plan before implementation.

## Supabase rules

When a mission touches Supabase:
- verify current Supabase docs/changelog before implementation;
- use the repository migration workflow and create migrations through the Supabase CLI;
- every exposed table requires RLS and real same-user/same-couple authorization, not only `TO authenticated`;
- never authorize with user-editable metadata;
- never expose service-role/secret keys in clients;
- treat SECURITY DEFINER as security-sensitive: pinned search_path, narrow grants and explicit authorization;
- reuse existing RPC, Push, Realtime, Storage and progression authorities when possible;
- run the relevant security checks/tests before review.

See `docs/agent/supabase-change.md`.

## Git / validation

Minimum finish gate for frontend work:
- focused tests for the mission;
- `npm test`;
- `npm run build:cloudflare-pages`;
- `git diff --check`.

Use proportional extra checks for sensitive domains.

At completion report only:
- status;
- branch / candidate SHA;
- tests/build;
- material files changed;
- known risks/blockers;
- whether production, PR or merge were touched.

## Visual authority

- Assets marked `APPROVED` in `assets/ASSET_MANIFEST.json` are authoritative.
- Do not redraw, recolor, crop, replace or invent approved/custom assets autonomously.
- Phosphor is the only approved standard icon library.
- If the required approved asset does not exist, stop and report the constraint.
