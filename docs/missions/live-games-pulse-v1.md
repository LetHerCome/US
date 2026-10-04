# Mission — Live Game Foundation + Pulse V1

**Status:** READY FOR AUDIT  
**Branch:** `mission/us-2-0-live-games-pulse-v1`

## Goal

Prove that the two members of the couple can invite each other from Gioca, enter a small live lobby, play a real touch-based Pulse match simultaneously, see one canonical shared result and request a rematch.

## In scope

### Arcade entry
Add an **Arcade** section inside existing Gioca, not a new top-level tab.

First game:

**Pulse**  
“Quanto siete sincronizzati?”

CTA uses the actual partner display name: **Gioca con <partner>**.

### Shared live-game foundation
Build only the reusable minimum needed for future Stack/Relay/Duo Maze:

`invite → accept/decline → lobby → ready → synchronized countdown → playing → finished → rematch/cancel/expire`.

Requirements:
- partner is already known; no codes/usernames/matchmaking;
- one sensible active Pulse session per couple;
- duplicate/retry operations are idempotent;
- reload/reconnect recovers the current state when feasible;
- short disconnect does not immediately destroy a match;
- no infinite spinner on Realtime failure;
- reuse existing Push infrastructure for background invitation if safe;
- foreground invitation is visible in-app.

### Pulse gameplay
Real touch game, not questions.

- central pulse/ring/heart animation;
- about 5 rounds;
- both clients render animation locally;
- authoritative shared `start_at` / seed/config;
- transmit/persist only meaningful input such as tap timestamps and state transitions;
- never stream frames or finger coordinates through Postgres;
- deterministic, bounded 0–100 shared score;
- canonical result is identical for both players;
- minimal text, mobile-first haptics where already supported;
- respect reduced motion.

Example result:

**96% IN SINTONIA**  
Differenza media: **43 ms**

CTA: **Rivincita**.

### Progression
Reuse current progression/idempotency authority. Pulse may award progression only in a bounded non-farmable way. Repeated rematches must not farm XP.

## Security / data constraints

- only the two members of the session's couple can see/join/mutate it;
- cross-couple access impossible;
- no service-role key in browser;
- no user-metadata authorization;
- no arbitrary client state mutation;
- new exposed tables require RLS;
- narrow validated RPCs are preferred for state transitions when appropriate;
- do not apply migrations to production in this mission.

Before implementing Realtime details, verify current Supabase docs/changelog for Broadcast/Presence/private channel authorization and compatibility with the pinned supabase-js version.

## Out of scope

- Stack Together;
- Relay;
- Duo Maze;
- public multiplayer/matchmaking;
- room codes;
- changing the existing Game V2 weekly allowance;
- Gioca content expansion;
- Crea domanda redesign;
- production deploy/migration;
- PR/merge.

## Acceptance tests

Cover at least:
- invite and duplicate invite;
- accept/decline/cancel/expiry;
- cross-couple denial;
- ready state and both-ready start;
- authoritative start time;
- valid tap;
- duplicate/malformed/out-of-window tap handling;
- five-round completion;
- deterministic same result for both players;
- reconnect/reload recovery;
- rematch;
- progression cannot be farmed by repeated rematches.

Then run:
- focused mission tests;
- `npm test`;
- `npm run build:cloudflare-pages`;
- `git diff --check`.

## Delivery

Commit and push the candidate branch. Do not deploy, modify production, open a PR or merge. Return candidate SHA, tests/build, architecture summary and risks.
