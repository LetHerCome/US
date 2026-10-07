# US — Multi-Couple Foundation V1

**Branch:** `mission/us-multicouple-foundation-v1-clean`
**Base:** stable `main`
**Production impact:** none before explicit merge/deploy

## Goal

Make US safe to evolve from one private couple into many independent couples without destabilizing the current app.

US stays a **single-couple UX** for now: one signed-in person, one active partner, one active couple.
The backend/runtime is treated as **multi-couple**: `couple_id` is the tenant boundary.

## V1 decisions

1. Keep `profiles.id = auth.users.id` + `profiles.couple_id` as the active membership authority.
2. Do **not** add `couple_members` yet; add it only when one account needs multiple simultaneous or historical memberships.
3. Load couple metadata from the authenticated profile's `couple_id`.
4. Relationship age comes from `couples.started_on`; no private-couple date is allowed in runtime logic.
5. Existing `francesco | beatrice` role values remain compatibility slot tokens in V1. They are not a tenant boundary and are not renamed in this mission.
6. Existing RLS/Storage cross-couple isolation remains authoritative.
7. Bootstrap/auth changes must pass a dedicated safety contract before becoming a release candidate.
8. No Settings V2 work is included here.

## Production audit summary

Read-only audit confirmed:
- public tenant tables use RLS;
- cross-couple isolation tests already exist and pass;
- shared state is generally scoped by `couple_id`;
- legacy role vocabulary remains broad backend debt: 2 named answer columns, 12 CHECK constraints, 17 functions/procedures reference the old slot tokens.

That role normalization is a later atomic migration, not part of V1.

## V1 scope

- minimal runtime Couple Context;
- dynamic `couples.started_on`;
- clear Couple Context on auth loss/profile loss;
- boot/auth static safety contract;
- multi-couple architecture contract;
- native CI runs those contracts;
- candidate APK before merge.

## Explicitly deferred

- public signup/invite UX;
- role-token rename;
- `couple_members`;
- calendar marker redesign;
- Game V2 copy normalization;
- Rewards role cleanup;
- full Settings redesign;
- production schema changes.
