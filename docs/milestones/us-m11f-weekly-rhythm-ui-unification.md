# M11F + US-UI-UNIFICATION-01

Candidate branch design and decision log, 2026-09-30. The M11F migration is
prepared in the repository only; nothing has been applied to or deployed on
production.

## Part A — M11F weekly game rhythm

### Contract

Per couple, per Game V2 week (Monday 00:00 Europe/Rome):

| Allowance | Count |
| --- | --- |
| Per voi | 1 |
| Free-choice rounds (any of the six modes) | 2 |
| New five-question rounds | 3 (15 questions) |

The weekly couple question ("Domanda della settimana") is separate and spends
nothing. **The play allowance resets; the memory does not.**

### Decision log

#### Where weekly authority lives

- **Problem:** A modified client could call `start_game_round` in a loop.
- **Chosen:** The budget is enforced inside `public.start_game_round` (same
  signature, same grants, body replaced by migration
  `20260930180000_m11f_game_v2_weekly_rhythm.sql`). Couple and role still come
  from `auth.uid()` through `private.m11a_actor_locked()`; the client sends only
  the mode and a request id.
- **Rejected:** A client-side counter, or a new RPC in front of the old one.
- **Why:** There is exactly one creation path for Game V2 rounds; guarding it
  is the smallest complete authority.

#### Week definition

- **Chosen:** `private.game_v2_week_start(private.game_v2_clock())`, the same
  function the weekly question uses. `private.game_v2_week_bounds()` turns it
  into the two Rome-midnight instants, so DST weeks (167 / 169 hours) are exact.
- **Rejected:** ISO weeks, `date_trunc` on UTC, or client dates.
- **Why:** One definition of the Game V2 week.

#### How usage is derived

- **Chosen:** Derived from immutable `game_sessions` rows (`engine_version = 2`)
  whose server-written `started_at` falls in the current week: Per voi rows count
  against the Per voi slot, every other mode against the two free slots.
  `private.game_v2_week_usage()` returns the counts, the open-round count and the
  latest round of each mode this week.
- **Rejected:** A mutable weekly counter table.
- **Why:** Nothing to reset, drift or repair on Monday; sessions are never
  deleted, so the count is always reproducible. No table, column or row change.

#### Per voi weekly rule

- Once this week's Per voi exists, every Per voi tap resumes it (open) or opens
  its reveal. After both partners finished and I have seen the reveal, the home
  reports `per_voi.state = 'played'` (top control: no orbit, label "giocato
  questa settimana"; card: "Giocato questa settimana · Il prossimo Per voi arriva
  lunedì · Rivedi"). A direct call is refused with `weekly per voi played`.

#### Free-choice weekly rule

- Two slots, any modes, the same mode twice allowed (no product reason to forbid
  it). The hub marks a mode already played this week as "Giocato questa
  settimana"; tapping it asks once through the shared US confirmation ("Avete già
  giocato a Ridete questa settimana … Gioca ancora / Non ora"). When the two slots
  are spent the tiles stay visible, read "Nuovi giochi lunedì", and a played tile
  opens its reveal. A direct call is refused with `weekly allowance exhausted`.

#### Pending-session policy

- A created round never expires and is never deleted. A round started last week
  stays open after Monday, is listed in "In corso", and both partners can finish
  it. Resuming an open round (same mode) is answered before the budget check and
  spends nothing; its usage stays in the week it was started.
- **No pending pile:** a NEW round is refused (`too many open rounds`) while the
  couple already has three open rounds (one week's worth). Resuming is always
  allowed, so the fix is always "finish one". The existing unique open index
  already keeps one open round per mode.

#### Concurrency and idempotency

- Replays: the request-id lookup runs first, so a retry returns the original
  round even after the budget is spent or the week changed.
- Same mode at the same instant: the existing per-mode advisory lock resolves
  both taps to one round (M11B).
- Different modes at the same instant: a new per-couple `game_v2_budget` advisory
  lock, always taken after the per-mode lock (fixed order, no cycle); usage is
  re-read under it with a fresh READ COMMITTED snapshot. Real two-connection
  PostgreSQL tests: eight partners' taps on different modes with one free slot
  left create exactly one; a burst of ten mixed taps creates exactly 1 + 2.
- Read RPCs (`get_game_v2_home`) stay STABLE and lock-free.

#### Push

- No new push behavior. Monday does not notify. Existing Game V2 pushes are
  unchanged; no Edge Function changed.

## Part B — US-UI-UNIFICATION-01

### Principle

Same product, different rooms. `ui-foundation.css` owns every cross-cutting
value; feature stylesheets keep layout and a small personality accent, never a
private palette, scrim, sheet material or close button.

### Audit (base 3c892b9, same container)

| Measure | Base | Candidate |
| --- | --- | --- |
| `:root` palettes | 4 (styles, identity, ui-foundation, polish4 glass) | 1 (ui-foundation; identity keeps only brand icon URLs) |
| Distinct colour literals in CSS | 783 | 585 |
| Duration literals in transitions | 87 | 19 (the rest are loops/photo timings) |
| Motion tokens in transitions | 47 | 114 |
| Plain `ease` in transitions | 43 | 4 |
| `backdrop-filter` declarations | 108 | 85 |
| `!important` | 720 | 696 (none added by this mission) |
| Native `confirm()` calls | 4 | 0 |
| Scrim recipes | 9 (.16/3px to .72/12px) | 1 (`--us-scrim` .44 / 6px) |
| Close buttons | × text glyph, 34–44px, 5 styles | one `.us-modal-close`, Phosphor X, 44px |

### Decisions

#### Palette
- **Chosen:** plum-black canvas `#08040e`, warm light text `#f7f2f8` with
  .70/.50 levels, accent rose `#ff668e` → violet `#a985ff`; lilac ink
  `#dcbfe8` for eyebrows and icons. Blue-grey surfaces (Ricordi, Calendario,
  Eventi, Impostazioni) are mapped by lightness to the plum surface tokens;
  blue-grey text greys to the text levels.
- **Rejected:** identity.css's muted accent (`#e88aa2`→`#8f86c8`), which
  silently overrode the brighter CTA on some screens and not others.
- **Personality kept:** Noi hub per-card tints (Risonanza rose, Da vivere
  amber, Quest violet; Calendario moved from blue to lilac), Ricordi's paper
  post-it and italic title, Ti penso emoji reactions, the approved custom
  settings PNG icon.

#### Surfaces and glass
- Three levels: L1 groups content, L2 is an interactive card or control,
  L3 floats. L3 is the approved Lasciato per te composer material and is now
  `.us-sheet` for every popup: Oggi, Ti penso, Eventi, Impostazioni, Lasciato
  per te (3 sheets), Conservati, Calendario (+ detail/form), nuovo Moment,
  Stories delete, and the shared confirmation.
- Sticky sheet headers use `--us-sheet-head-bg` so scrolled content never
  shows through a title.

#### Overlay, close, confirmation
- One scrim (`.us-modal-backdrop`), one close (`.us-modal-close`, 44px glass,
  Phosphor X; `.is-on-media` over photos and the camera), one enter/exit
  motion (`[data-us-motion-surface]`, 260ms enter / 200ms exit, 1ms under
  reduced motion).
- `UsUiFoundation.confirm()` replaces native `confirm()` (Ricordi, Calendario,
  Eventi, Moment; Game V2 repeat-mode question). Escape, backdrop and Annulla
  resolve false; destructive actions use `tone: 'danger'`. Falls back to
  `window.confirm` only when there is no DOM.
- Full-screen pages (album viewer, Conservati detail, Da vivere, event form)
  go back with Phosphor CaretLeft; popups close with X.

#### Radius and spacing
- Tokens: `--us-radius-sm` 10, `--us-radius-control` 15 (buttons, fields,
  rows), `--us-radius-card` 20, `--us-radius-sheet` 29 (every sheet and the
  confirmation), `--us-radius-pill`. Every shared primitive uses them; the
  sheets that carried 26/27/30px now inherit 29px. Spacing keeps the existing
  4-8-10-12-16-18-22-24 scale with named aliases (compact, standard, section,
  page). Feature-internal radii of cards and thumbnails were left as they are
  (see limitations in the QA report).

#### Duplicate patterns removed
- Four `:root` palettes, the polish4 "shared liquid glass" block, nine scrim
  recipes, per-feature sheet materials (Eventi, Impostazioni, Calendario,
  Conservati, nuovo Moment, Lasciato per te, Oggi, Ti penso, Stories delete),
  five close-button recipes, two primary CTA recipes, the bluish `.ghost`,
  seven input background recipes, the retired legacy motion pair and the two
  sheet keyframes that bypassed the shared surface motion.

#### Controls and type
- Buttons: `.primary` (accent gradient), `.ghost`/`.us-btn-secondary`,
  `.us-btn-quiet`, `.us-btn-danger`, `.us-icon-button`; one field recipe;
  `.us-chip`/`.us-segment` (Mese/Settimana).
- Tap targets raised to 44px: Oggi notice dismiss (36), calendar Oggi (36),
  Mese/Settimana (32), calendar sheet close (38), calendar arrows (40),
  Da vivere add (34), "Idee vissute" (22), Lasciato per te close (34).
- One focus ring (`:focus-visible`, lilac, zero specificity).
- Eyebrows share size/weight/tracking/colour (`--us-type-eyebrow`); page
  titles share `--us-type-page` (26px, 23px under 370px).

#### Icons
- Phosphor only. Added official 2.1.1 regular SVG byte copies: X, CaretRight,
  CaretDown, Plus, Bell, MapPin, ArrowsClockwise, UserCircle, Image,
  CalendarHeart, Check, MusicNote, PencilSimple. Each is registered in
  `assets/ICON_REGISTRY.json` and precached by the Service Worker. No icon was
  drawn or edited; no approved asset in `ASSET_MANIFEST.json` was touched.

#### What was not changed
- No framework, no override file, no new `!important`.
- Settings state marks (✓ × ○), the Ti penso emoji reactions and text-level
  separators (· →) remain text.
- Loop animations (record pulse, shimmer, attention orbit) keep their own
  durations; they already stop under reduced motion.

### Release markers

Bumped once for the candidate: `us-build` / `version.json`
`us-m11f-ui-unification-20260930-1`, shell cache `us-shell-static-runtime-40`,
cache-busting query strings of the changed files. `us-private-media-v1` is
unchanged.
