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
