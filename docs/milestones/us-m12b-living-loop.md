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
