# Missione us-home-cleanup-noi-board-daily-move

## Mandato

Ripulire Oggi dopo l'arrivo del Countdown senza cambiare la top bar: Ti penso resta a sinistra, US al centro, Lasciato per te nella busta a destra.

- Oggi: foto + Countdown come superficie dominante; vecchi widget di impegni e Domanda del giorno non sono più visibili.
- Noi: gli impegni diventano una Lavagna compatta "La nostra settimana" che riusa il Calendario esistente.
- Gioca: la Domanda del giorno diventa un rituale di Gioca e continua a usare lo stato/reveal canonico esistente.
- Quando la Domanda richiede attenzione, mostrare un nudge in-app transitorio oltre alle push già esistenti.
- Nessun nuovo backend, tabella, RPC o economia.

## Architettura

- La Lavagna legge `calendar_entries` solo attraverso l'autorità già presente in `calendar.js` / `fetchEntriesForRange`; il tap apre `openCalendarSurface(date)`.
- La Domanda del giorno legge esclusivamente `todayQuestion`, `todayState` e `todayRevealMeta`; il dettaglio resta il Today sheet canonico.
- Il target push `today` continua a esistere ma `openToday` viene instradato sotto Gioca prima di aprire il sheet.
- Gli anchor legacy di Oggi restano montati per compatibilità con le authority esistenti ma sono invisibili e a quota zero.
- Build marker: `us-home-cleanup-noi-board-daily-move-20261005-1`.

## Vincoli

- Nessuna modifica a Supabase production.
- Nessun nuovo bottom tab.
- Nessuna modifica a Ti penso o Lasciato per te.
- Nessun deploy o merge durante implementazione/review.

## Verifica

Focused regression: Home cleanup, Human UI, Oggi/Daily, Calendar, Noi, attention/motion, push, Countdown migration bookkeeping.

Finish gate:
- `npm test`
- `npm run build:cloudflare-pages`
- `npm run build:capacitor-web`
- `git diff --check`
