# M12D — Quest V2

Base: `79f6f163bf4e48296fbf618754c020749ffc0228` (M12C Risonanza V2 on main).

Quest V2 turns the existing weekly Couple Quests into one weekly board inside
Noi › Quest di coppia. M12D.1 keeps the existing tables and history, but adds
one authority migration so weekly creation, confirmation, reroll and XP are
server-owned rather than client conventions.

## Audit of the existing domain

The Quest server objects (`bond_weekly_state`, `bond_weekly_quests`,
`bond_quest_templates`, `confirm_bond_quest`, `reroll_bond_quest`, their RLS
and constraints) predate the repository migration ledger: no migration in
`supabase/migrations` defines them. Their server behaviour is known only from
how the client and `send-web-push` use them.

| Concern | Owner | Evidence |
| --- | --- | --- |
| Confirmation, both-partner completion, XP award into `couples.bond_xp` | server, `confirm_bond_quest(target_quest_id)` | client sends only the id; result carries `xp_awarded` |
| Reroll budget (3 per week) and replacement | server, `reroll_bond_quest(target_quest_id, target_template_key)` | server error "No rerolls"; client only proposes a template key |
| Week rows (`bond_weekly_state`, 3 `bond_weekly_quests` slots) | legacy: client insert; M12D.1: server `ensure_bond_week()` | browser now invokes the RPC; direct weekly writes are removed |
| Template choice at week start | M12D.1 server, deterministic by couple/week/slot and rarity band | `private.ensure_bond_week_internal()` copies the canonical template snapshot |
| near / far / any | server from persisted `couple_locations`; client proposal is advisory for reroll | server validates eligibility before creation/replacement |
| Push to partner | Edge Function `send-web-push` type `quest_confirmed`, checks the sender is in `confirmed_by` | unchanged |
| History | rows are never deleted by the client; M12C already reads completed rows across weeks | `hydrateResonanceHistory` |

## Decisions

- **Migration: YES (M12D.1 authority only). Backfill: NO. New tables: NO.**
  Every V2 display state is still derivable from `confirmed_by`,
  `completed_at`, `xp` and `rerolls_used`; the migration changes who may
  create/mutate those rows, not their shape.
- States per card: `available`, `you-confirmed`, `partner-confirmed`,
  `completed`; reroll `rerollable` or `locked` (completed, already confirmed by
  anyone, or budget spent). Exposed as `data-quest-state` / `data-quest-reroll`.
- Week identity: the audit found the old `weekStartISO()` used the device's
  local Monday, so two phones in different time zones could disagree around
  midnight. M12D anchors it to the Europe/Rome Monday, the same clock Daily and
  Game V2 use. For phones already on Italian time nothing changes.
- Reroll proposal is deterministic (`couple|week|slot|reroll|rerolls_used|current
  template`) over the same mode-eligible pool; `Math.random` is gone. The RPC
  still decides.
- "Settimane passate": read-only, up to 3 previous weeks from the same rows,
  showing N / 3 and completed titles. No XP sum, so it does not duplicate
  Risonanza's "Ultime crescite".
- Category and rarity keys unchanged; only their Italian labels are new.

## M12D.1 — server authority gate

Production review found that the legacy RPCs already used the right row locks,
but `authenticated` still had direct DML privileges on the Quest tables and
`couples`. That meant the browser contract could be bypassed even though the
normal UI did not do so.

Migration `20261001133906_m12d_quest_server_authority.sql` closes that gap:

- `ensure_bond_week()` owns current-week creation, derives the Monday from
  `Europe/Rome`, derives near/far/any from persisted couple locations, copies
  canonical title/category/rarity/XP from active templates, serializes creation
  through the weekly-state row, and prevents duplicate templates per board;
- `confirm_bond_quest` is a public SECURITY INVOKER wrapper over a private
  SECURITY DEFINER implementation. The private function pins an empty
  `search_path`, performs explicit auth/couple checks, locks the Quest row,
  accepts only the current Rome week, counts two distinct couple members, and
  awards XP in the same transaction exactly when the second valid confirmation
  completes the Quest;
- `reroll_bond_quest` locks the Quest and weekly-state rows, rejects past,
  confirmed or completed Quests, enforces the three-change budget and live
  near/far/any eligibility, and copies replacement data from the template;
- authenticated clients have SELECT-only table access for Quest state/templates.
  Direct weekly writes are removed. `couples.bond_xp` is no longer directly
  writable; only the existing safe couple metadata columns remain writable;
- the Data API exposes only SECURITY INVOKER wrappers in `public`; privileged
  implementations live in `private`, use `search_path = ''`, and are executable
  only by authenticated/service-role callers after explicit grants.

### Real PostgreSQL proof

The migration was executed against the real US PostgreSQL 17 production schema
inside a transaction that ended with `ROLLBACK`. No production state or
migration ledger was changed.

The rollback proof verified that all three public Quest RPCs compile as
SECURITY INVOKER wrappers, their privileged implementations compile in
`private` as SECURITY DEFINER functions with an empty `search_path`, the weekly
template uniqueness constraint is valid against the existing data, direct
INSERT/UPDATE policies disappear, and authenticated table-level Quest access
becomes SELECT-only.

A second rollback-only functional probe on PostgreSQL 17.6 also passed:
direct Quest/weekly-state/bond-XP writes were denied; the first valid partner
confirmation changed no XP; the second completed the Quest and awarded its XP
once; retrying the completed Quest awarded nothing; past-week confirmation and
reroll of a completed Quest were rejected; reroll #3 succeeded while #4 was
rejected; deleting the current board inside the transaction and invoking
`ensure_bond_week()` twice recreated exactly three distinct, canonical,
zero-reroll Quest rows.

The production lock path is preserved for concurrency: confirmation locks the
target Quest `FOR UPDATE`; reroll locks both the target Quest and its
weekly-state row `FOR UPDATE`. Removing direct writes means those serialized
paths are now the only authenticated mutation paths.

### Release gate evidence

- targeted Windows gate: `tests/m12d-quest-v2.test.js` **26/26 PASS**;
- Capacitor web build: **PASS**;
- full Windows suite candidate: 1167 tests, 1088 pass, 46 fail, 33 skipped;
- same runner against exact `main` baseline: 1141 tests, 1062 pass, 46 fail,
  33 skipped;
- the 46 failing test names are identical between candidate and baseline.
  M12D therefore adds 26 passing tests and **zero new full-suite failures**.
  The shared failures are pre-existing portability/baseline issues outside the
  M12D change set.

**Release note:** the PostgreSQL proofs above were intentionally executed with
ROLLBACK before release. Merge/deploy and production migration status are
tracked separately by the final Git/Supabase release state, so this validation
record remains historically accurate after publication.
