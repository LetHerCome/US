# Mission — US UI Refinement & Personalization V3

**Status:** review candidate (draft PR). Not merged, not deployed. The SQL migration is **not applied** to Supabase.
**Branch:** `mission/us-ui-refinement-personalization-v3` · **Base:** `main` @ `99d91e9` (includes PR #171).
**Build ID:** `us-ui-v3-20261009-1`.

Screenshots (local QA harness, fake Supabase, no real data): `docs/missions/us-ui-refinement-personalization-v3/`.

## 1. Noi V2 — UI cleanup

Structure kept: large calendar, Calendar/List toggle, month navigation, selected day, hidden Distance (data + logic intact), secondary links.

- **Missing icon fixed**: the settings button had a half-open tag (`<span class="us-icon" <img …>`) that rendered a grey square. It now uses the approved `us-icon-settings-128-v1.png`.
- **List icon**: "Elenco" used `squares-four` (a grid). Added official Phosphor `list-bullets`, `chalkboard-simple`, `palette` (byte-identical to `@phosphor-icons/core` 2.1.1 regular), mapped in `ui-foundation.css` and precached. A test now checks that every `data-us-icon` in the shell has a mapping, an existing SVG and a precache entry.
- **Calendar**: only the weeks the month spans (no empty 6th row); row height adapts (`clamp`) to small/large Android screens; today = rose ring, selected = gradient disc; one dot per kind (anniversary heart, event, appointment); weekend initials tinted; items sorted by time.
- **States**: the grid stays visible while loading/erroring; a compact notice with *Riprova*; "Aggiorno…" status; list mode has a real empty state and does not repeat the day detail; "Torna a oggi" appears only away from today; "Il nostro giorno" only when the start date is known.
- **Motion**: one light slide+fade per month change (transform/opacity, 260 ms), none under reduced motion.
- **Links**: three equal tiles (Lavagna, Quest, Eventi).
  - **Lavagna** now opens the existing Calendar in its **Week view** ("la vostra settimana": both partners side by side) on the selected day's week — `openCalendarSurface(date,{mode:'week'})`. No new editor.
  - **+** opens the existing Calendar create form directly for the selected day (`UsCalendarLinks.createForDate`).
  - Quest/Eventi keep their Noi subviews; Android Back returns to the Noi hub (verified).

## 2. Oggi — themes

New module `oggi-look.js` / `oggi-look.css`. Catalog: **US Original, Romantic, Pastel Dream** (free), **Cinematic** (L4), **Moonlight** (L7), **Autunno** — first seasonal theme (L12).

Each theme changes photo treatment (CSS filter on the existing photo layers only), a tint layer, a decorative layer (light leak, stars and moon, pastel shapes, autumn leaves, letterbox + grain), countdown colour/glow/typography (Editoriale/Vetro only — Aurora/Orbita/Cromo keep their art), the daily card and the Oggi top chrome tint.

**Separation**: `data-us-theme` stays the global "Atmosfera US" (progression.css). Oggi themes use `html[data-us-oggi-theme]` and define **only `--oggi-*` tokens**, consumed only by `#home`/`#homeHero` selectors. Each theme is one token block shared by the real Oggi and the preview phone (`.us-look-phone[data-oggi-theme]`), so previews are faithful.

Gallery: *Impostazioni → Personalizza Oggi → Tema/Effetto* and the Sintonia collection. Grid of vertical previews built from the real current photo and countdown → full preview → "Usa su Oggi" (locked: "Si sblocca al livello N di Sintonia") → "Ripristina" restores the original. Android Back closes preview, then gallery (navigation layers).

Persistence: the **same** device-local cosmetics store (`us:cosmetics:v1:<couple>:<profile>`, keys `oggi_theme`, `oggi_effect`) and the same `USProgression` authority — no second equip system, no server write. Restart paints the stored look before the server answers; entitlement is re-checked on hydrate. Identity change/logout switches to that identity's look / the original.

## 3. Oggi — background effects

Nessuno, Cuori delicati, Stelle luminose (free); Petali fluttuanti (L2), Lucciole (L6), Bokeh romantico (L10), Neve (L13).

- Layer `z-index:3` above photo/tint/decor, below countdown and controls (`z-index:4`), `pointer-events:none`.
- 7–16 CSS particles, deterministic per effect (preview = Oggi), transform/opacity keyframes only, container units for size-independent travel.
- Paused when the app is hidden or Oggi is not the active page; static composition under `prefers-reduced-motion`; ~half the particles when `deviceMemory ≤ 3`, `hardwareConcurrency ≤ 4` or Save-Data.
- No remote assets: inline SVG/CSS and already-precached Phosphor glyphs.

## 4. Sintonia and rewards

Client (works before the migration):
- Frames and stickers are no longer painted, offered, announced or shown as "next unlock". Badges and rings lost their only place with Noi V2 (couple header hidden), so they are retired the same way. Stored choices are **kept** (not erased), unlock history untouched.
- The three legacy rewards that entitle Countdown styles (`frame_aurora`, `ring_orbit`, `frame_chrome`) are presented as **Countdown styles** (unlock card "NUOVO STILE COUNTDOWN", "Usalo nel countdown"), so Countdown keeps working.
- Collection groups: Temi di Oggi, Effetti di Oggi, Atmosfera US, Accenti, Simbolo US, Stili Countdown. Next unlock is computed from presented rewards only.
- Looks whose server reward does not exist yet are **hidden** (no fake rewards). Before the migration the gallery shows the free set only.

Server — **proposed, not applied**: `supabase/migrations/20261009100419_us_v3_oggi_looks_rewards.sql` (created with the Supabase CLI):
1. category check adds `oggi_theme`, `oggi_effect`, `countdown`;
2. `frame_aurora`/`ring_orbit`/`frame_chrome` → category `countdown` (id, token, level, `active=true` unchanged — `save_countdown_oggi_v1` requires active);
3. remaining frame/sticker/badge/ring rows → `active=false` (excluded from `get_progression_v1` and from future unlocks);
4. seven Oggi rewards inserted (`on conflict do update`).
No delete, no grant/RLS/function change; idempotent; guard refuses to run if the countdown rewards are missing. Verified on PGlite (`tests/us-v3-rewards-db.test.js`): unlocks/views/XP/preferences preserved, retired never announced or re-unlocked, countdown still entitled at L4, check constraint still closed.

Rollout note: couples above level 2–13 will receive the new Oggi rewards as pending unlocks on their next `get_progression_v1` (up to 7 cards in sequence for a level-15 couple). Consider whether to pre-acknowledge them for existing couples during the separate review.

## 5. Gioca

Two tabs kept (Giochi | Sintonia) with one sliding segmented control (arrow keys supported).
Hierarchy: week strip → **Per voi** (hero) → Domanda di oggi → **Da continuare** (only when rounds exist: ready, your turn, in progress, waiting) → **Scegli un gioco** (two-column grid; Swipe full-width; every card = icon, name, kind of moment, real state: Disponibile / to continue / Completato / Da lunedì) → La vostra domanda ("Scrivila, sigillala: X la scopre giocando.") → Partite completate (disclosure).
No horizontal scroll, no filter chips, no duplicated entry. RPCs, allowance, sealed answers and reveal are unchanged (same handlers and the same RPC list, asserted by tests).

**Sintonia scroll bug**: the collection was still a nested scroller (`max-height:56dvh; overflow-y:auto; overscroll-behavior:contain`) inside Gioca, swallowing the page scroll; the Noi-only overrides no longer applied after Sintonia moved. Sintonia's recipe is now declared for `#quiz .us-gioca-sintonia`, the collection is part of the page. Verified with real wheel scrolling to the bottom.

## Quality

- Focused: `us-v3-oggi-look` (11), `us-v3-noi-gioca` (8), `us-v3-rewards-db` (6) — all pass.
- Full `npm test`: 1745 tests, 1605 pass, 39 fail, 101 skipped. The 39 failures are **identical** to `main` @ `99d91e9` (pre-existing: migration ledger, native notifications, MainActivity, etc.); no new failure.
- Updated tests only where this mission changes the contract: deck → grid and chips → "Da continuare" (Gioca), retired cosmetics (Rewards V2), Settings rows, precache budget 2.2 → 2.3 MB (+~45 KB Oggi looks after pruning ~33 KB dead cosmetics CSS/JS).
- `npm run build:cloudflare-pages` ✓ · `npm run build:capacitor-web` ✓.
- Browser QA (local harness): 360×640, 390×844, 412×915; Back from gallery/preview, Lavagna, Quest, Eventi; persistence after reload; identity switch; no horizontal overflow.

## Still to verify

- Physical Android (WebView version: container query units are needed for particle travel; older WebViews degrade to static particles) and iOS PWA safe areas.
- Real photos (contrast of each theme on very bright/very dark photos), photo rotation with themes on a device.
- Performance of effects on a low-end Android while the photo cross-fades.
- Interaction with PR #170 (index.html/service-worker/version markers will conflict trivially; `polish4.css`/`styles.css` hero changes to re-check with themes).
- Product decision on badges/rings retirement and on pre-acknowledging new rewards for existing couples.
