# M12A — Shell, Oggi, automatic location, living motion

Client-only. No migration, no Edge Function, no change to Game V2 / Daily
Question domain logic, push payloads, Auth, Sync or the private media cache.

## Shell
- Top bar: `[Per voi]  US mark  [Left for You]`. The centre is the approved
  `us-symbol-ui-crisp-v1.png`, display-cropped only, non-interactive.
- "I nostri eventi" left the centre. It is reached from Noi → Calendario → Eventi
  (head of the calendar sheet) and from the Oggi event card. The calendar closes
  first, then Eventi opens (navigation.js consumes the calendar history entry).
- Connection: healthy shows nothing. Offline shows at once; a "connecting" state
  only after 5 s.

## Motion system (ui-foundation.css / .js, the single authority)
- Aurora: one CSS-only ambient light in the top bar (12 s drift), transform/opacity,
  paused while the document is hidden, static under reduced motion, a 800 ms
  surge when a top control turns attention on or a Ti penso arrives.
- Attention primitive: `data-us-attention="on"` on a `.us-attention-orbit` host;
  the ring turns for ~half of a 5.2 s cycle and rests, and any
  `[data-us-attention-icon]` inside breathes (scale/tilt/halo). Hosts: Per voi,
  Left for You, Daily ritual.
- Bottom nav: one indicator (210 ms, `:has()` on the active tab; hidden where
  `:has()` is unsupported). No navigation logic or tab order change.
- Tiles: press scale, then the destination fades in with an 8 px rise.
- UsFeedback: `tap / action / success / attention / reveal`; haptic via
  `UsPlatform.haptic` or `navigator.vibrate`; sound synthesised locally
  (Web Audio), only after a user gesture, never while hidden, never on cold
  launch. Preferences `us:feedback:sounds` / `us:feedback:haptics` (default on),
  one Settings row "Suoni e vibrazione". No custom push sound is promised.
- Default tap: one delegated click listener gives every trusted click on a
  `button`, `a[href]`, `[role=button|tab|switch|menuitem]` or `summary` a tap; disabled,
  `aria-disabled=true`, hidden/inert and passive areas are silent. `data-us-feedback`
  is only an override (`action`, `success`, ...) or an opt-out (`off`, also on a
  container). The tap is deferred one task so an explicit stronger feedback from the
  same gesture replaces it; a confirmed async success still plays afterwards.
- Attention sound: a genuine off → on of `data-us-attention` on any top-bar control
  calls `UsFeedback.attention()` next to the aurora reaction. Attention events are
  deduplicated within 1.5 s, so a Ti penso arrival is one event.

## Oggi priority (app.js `UsOggi`)
At most one primary and one quiet surface; lowest rank wins, ties by id;
distance is not a candidate.

| Slot | Rank | Surface |
| --- | --- | --- |
| primary | 10 | "Pronto per voi": a received Ti penso not yet handled (`received_ready`) |
| primary | 20 | "Risposte pronte" (`answers_ready`) |
| primary | 30 | "Aspetta te" (`waiting_for_me`) |
| primary | 40 | Daily Question, partner already asked (`invited`) |
| primary | 50 | Daily Question, my answer due (`answer`) |
| primary | 60 | Daily Question error |
| quiet | 10 | event in the priority region (`couple_context`) |
| quiet | 20 | calendar widget |
| quiet | 30 | "Rivedi le risposte di oggi" |
| quiet | 40 | push opt-in |

Losers get `data-us-oggi-slot="suppressed"` (display none); their own `hidden`
logic stays the availability source, so they return once the winner is consumed.

## Location V2
- Capsule `♡ 128 km` (single line, 36 px, 44 px hit area). Tap → small sheet
  "128 km tra voi / Aggiornata 4 min fa"; "Attiva posizione" only when permission
  is genuinely needed.
- Triggers: launch, foreground return, staleness (≥ 10 min), a 5 min visible-only
  check. Minimum 45 s between attempts, 5 min back-off after a failure. Reads are
  cheap (`enableHighAccuracy:false`, maximumAge 120 s); never continuous GPS.
- Permission: granted → silent refresh; prompt/denied → never auto-asked; the
  last known value stays on any failure and is marked stale after 60 min.

## Reveal, Ricordo, weekly
- Game V2: the first reveal gets a ≤ 1 s light split; an already-seen reveal is not delayed.
- New Ricordo: the newly created current card catches the light once.
- Weekly question: the save button morphs only after the server confirms; on
  failure the action is restored; reduced motion changes immediately.

## M12A.1 — brand polish + Eventi surface
- Top bar centre is the canonical PWA/launcher identity (`us-symbol-apk-foreground-v1.png`,
  byte-identical to the Android adaptive foreground), cropped by the 38 px bar slot only.
  The earlier UI derivative is not used anywhere.
- Aurora: same layer and 12 s cycle; visibility is two tokens in `ui-foundation.css`
  (`--us-aurora-ambient` .62, `--us-aurora-react` .96), wider drift, richer blend.
- Eventi is the fifth Noi tile (wide, like the first/last Gioca tiles) and a Noi
  section (same history layer, same back bar). It is a presentation of the existing
  event data in `events.js`: PROSSIMI (next three), QUESTO PERIODO (still to mark +
  the next 60 days), VISSUTI (completed). Tapping an event, or +, opens the existing
  editor sheet; closing it returns to the page. No new table, RPC or CSS layer.
  Calendar keeps its Eventi shortcut.

## Release markers
Build `us-m12a1-brand-events-20260930-1`, `version.json` equal, shell cache
`us-shell-static-runtime-43`, `us-private-media-v1` untouched.
