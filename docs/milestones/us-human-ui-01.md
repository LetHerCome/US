# US-HUMAN-UI-01 — Human interaction & identity pass

Base: `26800d2bed20125f55ca60e4114d5dd958760f9b` (main, M12D.1).

A UI, interaction and shell pass. No Supabase change, no migration, no Edge
Function, no domain logic change. Build `us-human-ui-01-20261001-1`, shell
cache `us-shell-static-runtime-51`, `us-private-media-v1` kept.

## Shell (edge-to-edge)

- The full-width top bar is gone. ONE persistent control floats in the
  top-right safe corner: Lasciato per te (its only entry). Page title rows
  reserve `--us-shell-control-space` for it.
- Per voi left the top bar: it already leads Gioca. Its personal signal is a
  static mark on the Gioca dock tab (`#usNavGioca[data-us-attention]`), the
  reason is in the tab's accessible name, and it speaks in the capsule.
- `.us-capsule` (ui-foundation): a transient status surface driven only by
  existing state (Ti penso arrival, attention turning on in the shell). It
  leads with the canonical US mark (`#usCapsuleMark`, cloned as-is), hides
  itself after 3.6s, never loops, and is tappable only when the arrival has a
  real destination. `UsUiFoundation.capsule()` / `.announce()`.
- The M12A aurora is retired (no ambient loop left in the shell).
- Oggi: `.app` drops its safe-top padding while Oggi is active and the hero
  spans the whole viewport, so the photo reaches the physical top edge. A soft
  status band protects light status-bar icons over bright photos.
- Android: `AppTheme.NoActionBar` paints window, status and navigation bars
  with the US canvas (`@color/us_splash_background`), light icons, no
  contrast scrim — so any strip the system still owns matches the canvas.

## Dock

Selection = sliding indicator + filled icon + label weight. The conic orbit,
glow and dot are removed. Each destination plays one short SETTLE gesture
when it becomes current (never looped, off under reduced motion). 52px slots,
60px dock (52px landscape), `aria-current` unchanged.

## Pages (presentation only)

- Oggi: the M12A stack (max 1 primary + 1 quiet, untouched) is anchored low
  over the photo: image first, then the primary, then the quiet line.
- Noi: Risonanza is the one dominant object; the other four destinations are
  editorial rows (icon · name + state · caret). Hooks unchanged.
- Quest: one numbered living list; the row waiting for you is lit; a
  confirmation settles its own row and is announced (`questLocalFeedback`),
  the global toast is only the fallback.
- Ricordi: photo-first cards (caption over the photo), scroll-driven REVEAL
  where supported, Capitoli as a snapping deck with a peek.
- Gioca: Per voi is the dominant hero; the six modes are a horizontal deck of
  cards that tilt under the finger. Game logic unchanged.
- Ti penso: the heart stays filled while the send settles and the result is
  announced instead of toasted.
