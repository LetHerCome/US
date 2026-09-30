# Gioca tile rework + app-wide copy reduction

Client-only. No migration, no Edge Function, no change to Game V2, M11F limits,
Daily Question, push, Ricordi, Calendar, Da vivere or pairing/auth logic.

## Gioca

- Order: title row with the week strip, Per voi, six tiles, weekly question, Rivedi.
- Week strip: `QUESTA SETTIMANA ● ● ○ 1 di 3`; spent week: `Nuovi giochi lunedì` (said once).
- Per voi: one row (icon chip, "Per voi", one state line, one action).
- Tiles use the Noi hub chip/serif recipe on canonical tokens (`--us-radius-card`,
  glass, `--us-motion-*`, `--us-accent-gradient`): icon chip + name, plus a state
  only when there is one (`2 di 5`, `Tocca a te`, `Risposte pronte`, `Giocato`, `Lunedì`).
  Played shows a check, locked a lock (Phosphor, official files). First and last
  tile span the row; two columns at every width (the app column is phone-width).
- The separate "In corso" list is gone: an open round shows on its own tile.
- Family taglines removed; family names and icons are unchanged.

## Copy decisions

- Kept on purpose: destructive confirmations, irreversible-answer note, reveal
  rule ("le risposte si sbloccano quando avete risposto entrambi"), weekly
  question secrecy, logout/revoke/upgrade security text, error states, offline
  notice, Conservati tagline (earlier product decision, now once, in the sheet).
- Removed: obvious instructions, repeated privacy line on the Ricordi composer,
  page taglines that repeated the title, row descriptions in Settings and Noi,
  prototype/developer phrasing ("Sto preparando…", "il server", "Supabase",
  "fallback admin", "UID").
- Loading states are `Carico…` / `Un attimo…`; empty states are a title.

## Release markers

Build `us-gioca-tiles-copy-20260930-1`, `version.json` equal, shell cache
`us-shell-static-runtime-41`, `us-private-media-v1` untouched.
