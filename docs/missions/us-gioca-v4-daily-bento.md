# Mission — US Gioca V4 · Daily Challenge + Bento

Base: `main` @ `ee7515079aff27dd83f0ab7617f94460d41657bc`. Scope: UI only.

## Decisions and boundaries
- Gioca retains the **Giochi | Sintonia** top tabs and the four primary app tabs.
- The main feature is **Daily Challenge**, displaying today's existing Daily Question and its server-authorized state (answer / waiting / reveal). No new backend game is introduced.
- The date ribbon displays only the **current seven days in Europe/Rome** and highlights today. It explicitly does **not** display completed or missed days, streaks, rewards, or past-question histories: none is provided by a suitable canonical aggregate at this phase.
- The Game V2 allowance stays **one Per voi plus two free-choice rounds a week**, server enforced. The allowance strip remains separate from daily dates.
- The game catalog uses a **bento grid**: tall Per voi at left; Swipe and Scopritevi on the right; remaining games in two-column tiles. Its action handlers, existing icon names and state authority are unchanged.
- Unfinished rounds, question of the week and completed games remain below. No impact on sealed answers, reveal, game sessions or progression.
- Visual style borrows layout hierarchy and generous card proportions from the provided screenshot, but uses US typography, canonical dark canvas and existing approved Phosphor icon assets. No external images or copied brand assets.
- The Daily Question hub has a single stable DOM slot that is painted by `home-cleanup.js`, avoiding duplicate DOM insertions whenever Game V2 rerenders. No parallel question engine is created.
- No SQL migration, Supabase deploy, Android install, production merge or release as part of this PR.

## Risks and follow-ups
- The current hub requires browser QA on a real Android viewport (especially 360 × 640 and 390 × 844): scroll, long question titles and changing states.
- Week dates have **no click action** until a verified daily history/archive is explicitly implemented.
- A true Daily Challenge V2 with rotating micro-challenges, evidence and historical completion will be separate and require server-owned design.
- PR #170 changes widgets/animation assets independently; do not overwrite that work.

## Gate
`node --test tests/us-gioca-v4-bento.test.js tests/gioca-tiles.test.js tests/us-v3-noi-gioca.test.js`,
UI regression pipeline, Cloudflare Pages and Capacitor builds, and Android/iOS CI.
