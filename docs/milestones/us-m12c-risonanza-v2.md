# M12C — Risonanza V2

Base: M12B closed on `80483df622c46f86d1f64565d712c8670cf14203`.

M12C keeps `couples.bond_xp` as the single total/level authority and makes the
Risonanza surface explain recent real growth without turning it into a
relationship-quality score.

Recent traceable XP awards are composed client-side from completed
`bond_weekly_quests`, `shared_event_completions`, and historical Event title
semantics from `relationship_event_history`. Canonical keys are
`quest:<id>` and `shared_event_completion:<id>`. The list is read-only,
deduplicated, newest-first and capped at six rows.

It intentionally does not try to reconstruct the lifetime Bond XP total:
production can include XP from retired historical mechanics.

No migration, backfill, RPC, Game V2 change, Quest behavior change, or Event
completion behavior change is part of M12C.
