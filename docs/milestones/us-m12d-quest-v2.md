# M12D — Quest V2

Base: `79f6f163bf4e48296fbf618754c020749ffc0228` (M12C Risonanza V2 on main).

Quest V2 turns the existing weekly Couple Quests into one weekly board inside
Noi › Quest di coppia. It keeps the existing Quest domain and adds no schema.

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
| Week rows (`bond_weekly_state`, 3 `bond_weekly_quests` slots) | client inserts, server uniqueness | `ensureBondWeek` inserts and tolerates `23505` |
| Template choice at week start | client, deterministic `hashSeed(couple|week|slot|bond)` by rarity band | `selectInitialQuestTemplates` |
| near / far / any | client, from `usDistanceKm` or `couple_locations`; fewer than 2 locations = `any` | `currentQuestMode` |
| Push to partner | Edge Function `send-web-push` type `quest_confirmed`, checks the sender is in `confirmed_by` | unchanged |
| History | rows are never deleted by the client; M12C already reads completed rows across weeks | `hydrateResonanceHistory` |

## Decisions

- **Migration: NO. Backfill: NO. New tables: NO.** Every V2 state is derivable
  from `confirmed_by`, `completed_at`, `xp` and `rerolls_used`.
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

## Not provable in this repository

Server invariants (XP exactly once, concurrent confirmation, cross-couple
denial, reroll limit under concurrency, reroll of a confirmed or completed
Quest) live in production functions that are not in the repo. M12D does not
change them; they need a read-only production check (`pg_get_functiondef`,
`pg_policies`, constraints) before being claimed.
