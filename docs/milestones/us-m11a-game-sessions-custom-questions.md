# M11A — reciprocal game sessions and couple questions

Candidate branch design, 2026-09-30. The migration is prepared only; it has not
been applied to production.

## Existing authorities audited

- `app.js` loads the three weekly match sets, reads immutable catalog rows from
  `quiz_sets` and `quiz_questions`, saves choice indices through
  `save_quiz_answer`, and receives the reveal and reward state from
  `get_quiz_state`.
- `games.js` uses the same quiz flow for three more weekly choice modes. Partner
  Knowledge reads the partner's previous match answers, records a per-user
  weekly attempt, and awards its existing bounded Bond XP reward.
- The SQL definitions of the production quiz RPCs are absent from this repo.
  Read-only schema inspection confirmed that `quiz_responses` holds a
  `smallint` answer index and `week_start`, with no session ID or text answer.
  `get_quiz_state` scores matching indices and awards weekly XP as soon as both
  have all answers. `save_quiz_answer` can overwrite a choice during the week.
- The existing `quiz_responses_read_own` policy keeps partner indices hidden
  before the reveal. `get_quiz_state` returns partner indices only when both
  have completed the set.
- M10.2's `daily_question_reveal_states` proves per-person `couple_id + role`
  receipts. `claim_us_role` transfers legacy UID-owned rows when replacing a
  profile. New M11A rows use stable relationship roles and need no transfer.

## Domain boundary

The old weekly quiz and Partner Knowledge engines stay unchanged. A new session
layer owns reciprocal completion and reveal for content that cannot fit their
weekly index-only answer model. The first caller is one couple-authored question
per session; later creators can make multiple immutable session items from
curated, Partner Knowledge, or permitted US-context sources.

| Table | Authority |
| --- | --- |
| `couple_questions` | Couple library, author role, open/choice content, revision, soft archive, create request ID. |
| `game_sessions` | Couple, game family, content source, starter role, start/completion time, create request ID. |
| `game_session_items` | Immutable question text/options snapshot and optional source revision. |
| `game_session_answers` | One current draft/final answer per item and stable role. |
| `game_session_sides` | One completion and reveal-seen receipt per stable role. |

All five tables have forced RLS without client policies or grants. The public
RPCs derive couple and role from the authenticated profile and have empty
search paths, explicit membership checks, and restricted execution grants.
Reads and writes are scoped to the caller's couple. The state RPC returns own
drafts but returns SQL `NULL` for every partner answer field until the session
has two completed sides. Direct table reads, writes, and Realtime row reads are
not available to client roles.

`start_custom_game_session` snapshots the current question under a row lock.
The author may later edit or archive the library row; existing active and
finished sessions continue to show the original prompt and options. Only the
author may edit or archive. Archived questions disappear from the library and
cannot start new sessions. The caller supplies an optimistic revision for an
edit, so stale edits fail without overwriting a newer one.

`save_game_session_answer` allows edits until that role completes its side.
`complete_game_session_side` checks that every item has an answer, then locks
the side. Save, completion, and reveal receipt writes all lock the same session
row first. The second completion sets `game_sessions.completed_at`; duplicate
calls keep the original timestamp. `mark_game_session_reveal_seen` writes only
the caller's receipt after both sides complete. Unique request IDs make
question and session creation retries idempotent.

## M11A presentation and reward

The existing Gioca page gets a restrained “Le vostre domande” library, one
creation form, session list, answer form, waiting state, and open/choice reveal.
Choice results use “Uguale ♡” or “Una sorpresa”; neither kind has a score or
quality judgment. M11A grants no Bond XP and emits no push event. It adds no AI
call, generated question bank, or use of private US content.

M11B can replace the Gioca hub without migrating session rows. M11C can create
three to five `game_session_items` before play and reuse the same answer,
completion, and reveal contract. M11D can consume canonical session and receipt
state for attention and push without introducing a second answer authority.

## Rollout notes

- The migration timestamp is a candidate. Align it with the production ledger
  before any authorized rollout.
- Production quiz function bodies were inspected read-only because the repo
  does not carry them. The M11A migration does not replace them.
- Embedded Postgres tests cover SQL behavior and authorization. They do not
  provide a separate-session load test of true concurrent database connections;
  the session row lock and uniqueness constraints are the race authority.
