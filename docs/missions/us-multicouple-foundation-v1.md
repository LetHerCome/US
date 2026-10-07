# US — Multi-Couple Foundation V1

**Status:** IMPLEMENTATION
**Branch:** `mission/us-multicouple-foundation-v1`
**Production impact:** none until separately approved

## Goal

Make the current product safe to evolve from one private couple into many independent couples without rewriting the working backend or changing production data.

US remains a **single-couple UX**: one signed-in person, one active partner, one active couple.
The architecture becomes explicitly **multi-couple**: every runtime identity, label and shared state is derived from the authenticated profile and its `couple_id`.

## Decisions

1. `couple_id` is the tenant boundary.
2. V1 keeps `profiles.id = auth.users.id` and `profiles.couple_id` as the membership authority.
3. Do not add `couple_members` yet. Add a separate membership table only if a user must belong to multiple/current-or-historical couples.
4. Existing role values `francesco` / `beatrice` are compatibility slots only. Runtime presentation must not treat them as names or gender.
5. No relationship date may be hardcoded in runtime behavior; it comes from `couples.started_on`.
6. No partner name may be inferred from a role token; it comes from the other profile in the same couple.
7. Database role/schema normalization is a separate migration mission because RPCs, constraints and historical snapshot columns depend on the current tokens.
8. Production Supabase is read-only for this mission.

## Scope

- add one runtime Couple Context authority;
- derive partner/profile labels from the current couple;
- derive together-days from `couples.started_on`;
- remove gender-specific Game V2 result copy tied to the legacy role;
- make Calendar ownership markers derive from profile names rather than F/B;
- add a boot/auth safety contract;
- add a multi-couple hardcode regression contract;
- document remaining legacy schema debt.

## Not in scope

- public signup;
- invite acceptance UX;
- `couple_members`;
- role-token database migration;
- renaming historical columns such as `francesco_answer` / `beatrice_answer`;
- production schema changes;
- Settings V2.

## Finish gate

- focused multi-couple tests;
- boot/auth safety tests;
- existing Android/iOS native contracts;
- full `npm test`;
- `npm run build:cloudflare-pages`;
- no production merge/deploy.
