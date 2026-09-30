# US M10 — Oggi attention + Daily Question push

Candidate branch `mission/us-m10-oggi-attention-daily-push`. Not merged, not deployed, no production Supabase change.

## M10A — Oggi reading order
One flow column (`.us-oggi-stack`) inside the hero, top to bottom:
1. personal priority (`#usTodayPriorityRegion`),
2. today's Calendar commitments (`#usOggiCalendarWidget`, M6E authority, never animated),
3. Daily Question (`#usDailyRitual`),
4. passive widgets outside the stack (empty-state invitation, push opt-in, distance pill).

The empty-state invitation is laid out in the free band under the stack and drops its secondary lines when that band is short; the push opt-in sits above the distance row.

## M10B — compact Daily Question card
State comes only from `get_or_create_daily_question` + `get_daily_state`.

| Case | Content | Orbit |
| --- | --- | --- |
| A `my_answer == null` | kicker, question, **Rispondi** | on |
| B answered, partner not | kicker, question, **Risposto** | off |
| C both answered | kicker, question, **Scopri** (no inline reveal) | off |
| D backend error | kicker, fixed copy, **Riprova** | off |

## M10E — `.us-attention-orbit`
Defined once in `ui-foundation.css`; hosts set `data-us-attention="on|off"`. Personal semantics only: "you still have something to do or see".
- Left for You envelope: on iff `unseenCount > 0` for the current recipient.
- Daily Question: on iff `my_answer == null` (never derived from `both_answered`).
- Today priority: only a received, unhandled Ti penso.
Reduced motion shows a static halo. Every host keeps a text state, so the animation is never the only signal.

## M10C — Daily Question system push
- Migration `20260930150000_m10c_daily_question_push.sql` adds the cron key in the vault, `get_internal_daily_question_push_cron_key()` (service_role only), makes `push_event_log.sender_id` nullable when needed, and schedules the cron `us-daily-question-push` every 10 minutes. The cron materializes today's question, then calls the worker.
- Edge Function `daily-question-push-worker` (`verify_jwt = false`, cron key required, takes no caller input) → `_shared/daily-question-push-core.mjs`.
- Notification: title `US. · Domanda del giorno`, body `C'è una nuova domanda per voi.`, target Today. No question text and no sender.
- Dedupe is `daily-question:<question id>:<user id>`. The key is released when nothing was delivered. 404/410 subscriptions are removed.
- Chosen defaults: send window 09:00–22:00 Europe/Rome; members who already answered today are skipped.

## M10D — answer push
`send-web-push` is unchanged. Regression tests run the real function: the first answer notifies only the partner, the second notifies both, and dedupe, the today preference, the target and privacy all hold.

## Apply / deploy (Francesco)
1. Apply migration `20260930150000_m10c_daily_question_push.sql` (requires M9E, already on main).
2. Deploy Edge Function `daily-question-push-worker`.
3. Ship the client release candidate.
