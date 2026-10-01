# M12B — Living Loop + Oggi refine

Phase 1 audit: `qa/us-m12b/AUDIT.md` in the project files. Decisions: D1 = A (Calendario is the only
Da vivere scheduling authority), D2 = A (either partner may keep a revealed Daily Question, later
batch), D3 = A (Ricordi stay photo-backed).

## Batch 1 · M12B.1 — Oggi genuinely fits the viewport
- Root cause: `.app` kept its nav clearance (`padding-bottom: nav + safe + 34px`, `fix4.css`) on
  Oggi, whose hero is already full-bleed under the floating nav, so the document was 100 px taller
  than the viewport; `identity.css` hid it with `overflow:hidden` on `body` and `#home`.
- Fix: while Oggi is active `.app` drops that clearance (`body:has(#home.page.active) .app`); both
  overflow clips are removed. Every other page keeps the clearance.
- The push opt-in now clears the whole bottom row: distance capsule and Ti penso button
  (`nav + safe + 83px`); before, it slid 10 px under the Ti penso button.
- M12A arbitration (1 primary + 1 quiet), the photo, the stack and the bottom row are unchanged.
- Gate: `tests/m12b-oggi-no-scroll.test.js` measures the real app in Chromium at 375×667, 390×844,
  768×1024, 1280×800 in six states with no clip in effect (`scrollHeight <= innerHeight`, controls
  between top bar and nav, no overlaps, arbitration). Skipped only where Playwright is unavailable.

Release markers: build `us-m12b1-oggi-fit-20260930-1`, `version.json` equal, shell cache
`us-shell-static-runtime-44`, `us-private-media-v1` untouched.

## Batch 1 · M12B.2 — archived, never-lived ideas release their Calendario event
- Bug (since M7C): archiving a scheduled idea kept `bucket_items.calendar_entry_id`. The M7C
  BEFORE DELETE trigger only un-schedules rows still `scheduled`, the FK is `ON DELETE RESTRICT`
  and the M7A guard refuses deleting a linked row, so nobody could delete that shared event.
- Invariant (CHECK `bucket_items_archived_unlived_unlinked_check`):
  `status = 'archived' AND completed_at IS NULL => calendar_entry_id IS NULL`.
- Migration `20260930225935_m12b_2_da_vivere_archived_link_release.sql`: a BEFORE UPDATE trigger
  (fires after `bucket_items_guard_update` by name order) clears the link on archive of a
  never-lived idea, a one-time backfill clears it on rows already broken, then the CHECK.
  No row is deleted; guard, RPC, policies and `calendar_entries` are untouched.
- Lived history is kept: `completed_at` is server-owned and never cleared, so lived → archived keeps
  its event and the delete stays refused.
- Gates: `tests/m12b-da-vivere-archived-link.test.js` (PGlite, cases A–D, F, isolation, CHECK,
  trigger order, migration scan) and `tests/m12b-da-vivere-archived-link-race.test.js` (real
  PostgreSQL sessions, case E: archive vs delete in both orders, double archive, lived vs archive).
- Applied to production as ledger migration `20260930225935 m12b_2_da_vivere_archived_link_release`.
  Pre-apply read-only count was 0 rows; post-apply invariant count remains 0.

## Batch 3 · M12B.3 — Provenance foundation
Database only; no client, Service Worker or cache change. Migrations applied to production and ledger reconciled.
- `20260930233501_m12b_3_living_provenance.sql`
  - `shared_event_completions.event_title_snapshot`: the event title when the occurrence was
    completed, written by a BEFORE INSERT trigger from the couple's own event and frozen on UPDATE.
    Older completions stay NULL (unknown, never guessed). The completion stays the only authority.
  - `public.living_provenance`: explicit `source (kind, ref) → target (kind, ref)` with typed FKs.
    Sources: `shared_event_completion`, `da_vivere` (lived `bucket_items` only). Target: `moment`.
    Canonical `source_key = kind:ref`. One Moment per source, one source per Moment. Immutable;
    deleting the Moment removes only its row; a deleted source only nulls its typed FK.
  - `public.link_moment_to_source(moment, kind, ref)`: the only writer (SECURITY DEFINER, M11A.1
    locked actor, own Moment, same couple, lived source, server-written snapshot). Returns
    `linked` / `existing`; refuses a second Moment for a source and a second source for a Moment
    (23505). RLS forced, SELECT for the same couple, no client write grant. Owner = couple + role.
- `20260930233503_m12b_3_game_v2_living_origin.sql`: `private.game_v2_ctx_moments` uses the
  provenance source as the candidate source, so a Moment and the lived fact it came from are one
  source for the existing per-round de-duplication and source cooldown. Unlinked Moments unchanged.
- `20260930233506_m12b_3_event_completion_history.sql`: `public.relationship_event_history`
  (security_invoker, same-couple filter): one row per completion with historical title,
  `title_source` (`snapshot` | `live` | `missing`), current title and the optional kept Moment.
- Not in this batch: Daily Question Conserva, text-only Moments, automatic Moments, client wiring.
- Gates: `tests/m12b-3-living-provenance.test.js` (A–F, H–J, preconditions, migration scan),
  `tests/m12b-3-game-v2-living-origin.test.js` (G), `tests/m12b-3-living-provenance-race.test.js`
  (real PostgreSQL: concurrent links, delete during link).

## Batch 5 · M12B.5 — Rivivi over the Living Archive
Client only; no migration, no backfill, no Edge Function. Build `us-m12b5-rivivi-archive-20261001-2`,
cache `us-shell-static-runtime-47`, `us-private-media-v1` unchanged.
- One archive adapter (`ricordiTimeline` in `app.js`) over existing reads, used by the story,
  Capitoli and Rivivi. Families and canonical keys: `moment:<id>` (unlinked Moment),
  `da_vivere:<bucket_item id>` (lived), `shared_event_completion:<completion id>`
  (`relationship_event_history`), `daily_question:<question id>` (`daily_question_keepsakes`).
- Dedup only by canonical key: a Moment linked by `living_provenance` (or the history view's
  `moment_id`) takes its source's key and becomes that experience's photo. Never by title.
  For linked Da vivere, the immutable provenance `source_title/source_date` remains the historical
  presentation authority; for Events, `relationship_event_history` remains the title/date authority.
- Rivivi: anniversary (±3 days, past year; closest, then most recent, then key), else a 30+ day
  entry chosen by days-since-epoch (stable for the day, rotates on consecutive days). No storage.
- Source-aware card: photo entries open the existing Moment viewer; Events (historical title,
  declared live fallback), lived Da vivere (link to its detail) and kept Dailies (frozen answer
  pair) open in place, read-only.
- Excluded: Conservati (`conserva_contributions`) — payload resolved live from `left_for_you`,
  no snapshot, a one-way personal message outside the Ricordi story; unkept Daily answers.
- Gate: `tests/m12b-5-rivivi-living-archive.test.js`.
