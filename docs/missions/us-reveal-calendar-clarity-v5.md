# US V5 — Reveal clarity and couple-owned calendar

## Agreed UX (2026-10-09)

- **Game V2 + Swipe reveal:** compare **Uguali** versus **Diverse** as two compact groups with counts. All questions are collapsed by default; expand a group and then a question for the actual two answers. This deliberately avoids a tall card per question. If the engine provides a free-text answer or an unresolved prediction, mark it **Risposte**, not equal/different: never fabricate semantic similarity.
- **Daily Question reveal:** exactly the question and the two real answers when `get_daily_state` reports both answered. Hide the prior disabled textarea, its stale CTA, the “Risposte sbloccate” banner, emoji reaction controls and post-reveal comment/reflection composer. Do not delete any saved outcomes or reaction records; their database APIs are untouched. **Conserva nei Ricordi** stays as a single optional button because it is a distinct existing feature.
- **Noi day appointments:** show each real appointment's time and **the owner's display_name** loaded from the authenticated current couple's profiles. Shared entry/event uses both partner names if available; neutral `Entrambi` fallback otherwise. Unknown personal owner has a neutral label. No hardcoded person names; no changes to calendar write authority.
- Preserve revealed-only data boundary; preserve receipt `mark_game_session_reveal_seen` and Daily `mark_daily_reveal_seen`; no new RPC, migration, quota, or data loss.
- Work separately from open PR #170 (widgets + motion).

## QA acceptance
- Check game types: reciprocal choice same/different, prediction matched/unmatched, free-text (uncategorized), Swipe 8 choices, long strings, own/partner role, re-open seen reveal.
- Verify no sealed answers show in waiting state; initial reveal stays server gated, counts match choices, no more full-screen stack of eight cards.
- Daily: before both answer input remains usable; after both answer only question + two responses (and optional Conserva); no comments or reaction UI, no duplicated disabled button.
- Noi: two **other names** instead of Francesco/Beatrice in test fixtures, shared appointment, personal appointment for each, missing profile, account-switch stale read, long names, month/list/week variants.
- Run focused tests, UI CI, Cloudflare and Android/iOS compile. Real-device visual review required before merge.
- Do **not** merge or deploy as part of this PR.
