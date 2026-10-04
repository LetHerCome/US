# Countdown Oggi V1 — candidato riallineato

## Decisione creativa confermata — 2026-10-05

L'utente ha scelto di mantenere i **sei stili originali del candidate**, descritti nella tabella seguente. Gli otto concept della successiva visual exploration sono accantonati e non devono essere implementati.

- Disponibili subito: **Editoriale, Segnale, Vetro**.
- Sintonia, tramite unlock esistenti: **Aurora** (`frame_aurora`, livello 4), **Orbita** (`ring_orbit`, livello 9), **Cromo** (`frame_chrome`, livello 12).
- Conservare i trattamenti visuali e il comportamento già implementati, senza sostituirli con i concept esplorativi.
- Posizione finale richiesta: countdown più in alto, subito sotto la top bar, rispettando safe area e lasciando Daily Question e gli altri elementi in spazi separati. **Questo spostamento non è ancora applicato al candidate** e richiede una successiva patch e verifica mobile proporzionata.
- Restano invariati i vincoli: foto corrente, tempo protagonista, copy minimo, nessuna foto/card aggiuntiva, nessuna nuova economia, nessuna modifica Arcade o redesign calendario.

Riferimento tecnico verificato: `d92254814bc88b343ebdfe5eb720a4acd5f4a95a`. La selezione dei sei stili non richiede un ripristino: sono tuttora quelli presenti nell'app. I risultati tecnici sotto sono quelli della verifica precedente, non una nuova esecuzione dopo questa decisione documentale. Nessuna modifica runtime in questo aggiornamento.

Branch `codex/countdown-oggi-v1`, base esatta `main` `f463c7d73c9cba86c22130179a3fb79c405cfa3e`. Repository `F:\AI\US`, worktree isolato `C:\Users\Francesco\.codex\worktrees\c8c3\US`.

Candidate originale `0459046db43b48ea9e6675b36255053188e4ecce` conservato nel ref locale `codex/countdown-oggi-v1-original`. Rebase del solo candidate, nessun merge. Nessun push, PR, deploy o modifica production/Supabase remoto.

## Authority e compatibilità

Presenti e lette: `AGENTS.md`, missione attiva, `docs/CURRENT_STATE.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, product vision e checklist frontend, review e Supabase. Sono identiche al main indicato. L'assenza di CURRENT_STATE riportata nel primo candidate è superata dal nuovo main.

Nessun conflitto concettuale: stack vanilla, quattro tab, foundation canonica, foto e tempo protagonisti, poche priorità Oggi e Daily Question separata. Relazione da `couples.started_on`, unlock da catalogo/Sintonia esistente. Nessuna valuta/XP aggiuntiva, nessun intervento Arcade/Pulse o redesign calendario. Gli slot cosmetici rimangono locali al dispositivo come deciso da main; scelta e stile countdown restano condivisi per il mandato della missione, senza cambiare gli slot.

I fix self-heal iOS e le authority auth/media di main sono conservati. Il diff SW aggiunge solo marker e precache dei due asset countdown, preservando `us-private-media-v1`. Migrazione RPC compatibile con baseline/security: membership reale, RLS forzata, grants ristretti, search_path vuoto, version conflict.

## Integrazione

- Risolti conflitti di marker PWA e fixture rewards, combinando localStorage corrente di main con il nuovo evento progression. Marker candidate `us-countdown-oggi-v1-20261004-2`.
- Rigenerato con `node scripts/build-supabase-baseline.mjs` soltanto `supabase/baseline/MIGRATION_CUTOFF.json`: aggiunta della migrazione countdown ai due elenchi. Baseline storica e ledger intatti. `--check` PASS.
- F1B client parity segue il pattern già usato dal suo gate Edge: snapshot MATRIX invariato, RPC successive verificate applicando tutte le migrazioni reali. Tutte le overload devono consentire authenticated e negare anon/PUBLIC. RED osservato aggiungendo temporaneamente grant anon: fallisce sul permesso; SQL ripristinato e GREEN. Nessuna allowlist o indebolimento del gate.

## Risultato preservato

Countdown giorni di calendario Europe/Rome oppure clock UTC reale, automatico “Insieme da”, CRUD condiviso, seleziona/nascondi e foglio canonico. Titolo massimo 32 caratteri, massimo 12 countdown. Nessuna persistenza privata aggiuntiva. Version conflict conserva la bozza. Focus Photo, reduced motion, safe area e logout/owner switch gestiti.

| Stile | Trattamento | Disponibilità |
|---|---|---|
| Editoriale | Serif grande, filetto sottile | Subito |
| Segnale | Monospace, cifre tecniche, transizione breve | Subito |
| Vetro | Lente, blur e profondità | Subito |
| Aurora | Gradiente lento nelle cifre | `frame_aurora`, Sintonia 4 |
| Orbita | Fili circolari, punto orbitante | `ring_orbit`, Sintonia 9 |
| Cromo | Tipografia scolpita e riflessi | `frame_chrome`, Sintonia 12 |

## Verifica sul main riallineato

- **Suite completa `npm test`: 1423 test, 1383 pass, 40 skip, 0 fail**, exit 0. Durata ~95 s. Log `countdown-rebased-full-suite-final.log`. Fix manifest proveniente da main verificato: test Scriptable passa, nessuna modifica Android generata.
- Node 24 Windows: usato loader ESM temporaneo esterno per i test storici con import(path assoluto). Nessun cambio runtime/package. La suite completa non espone Playwright tramite env e salta i browser opzionali; il browser countdown è eseguito separatamente, senza skip.
- **Browser countdown 7/7**, 18 combinazioni stile×viewport (320×568 / 390×844 / 844×390), CRUD, errori, retry, owner switch, DST, reduced motion, tastiera simulata, back/focus, assenza foto, titolo lungo e safe area. Nessun pageerror. Log `countdown-rebased-browser.log`.
- **Mirati 48/48**, dominio/SQL, rewards device-local, logout e gate PWA completo (upgrade/offline/precache failure/private cache/push/notificationclick). Log `countdown-rebased-focused.log`.
- `npm run build:cloudflare-pages`: **143 file**, PASS. `node scripts/build-capacitor-web.mjs`: **141 file**, PASS; SHA256 bundle `3c8c2ddb33daad3dc884af94c70c0bae60f652259713b90713ede07ebe471077`. Build native eseguita con accesso esbuild fuori sandbox; nessun deploy/installazione.
- Syntax dei JS coinvolti, `git diff --check`, generator baseline `--check`: PASS. SHA dei **16 asset APPROVED invariati**.
- Review indipendente post-rebase e dei due fix integrazione: **READY**, nessun P1/P2 residuo. Gate RPC rieseguito anche dal reviewer: PASS.

Il primo tentativo sul nuovo main aveva 4 fail per indice migrazioni e gate RPC storici non ancora integrati. Corretti come sopra e rieseguita l'intera suite: tutti i fail risolti. Il precedente problema CRLF Android non si ripresenta.

## Preview aggiornate

Directory locale `C:\Users\Francesco\.codex\visualizations\2026\10\04\01a108a6-a8ec-7931-96c4-cee3d0f95ed5\countdown-rebased-previews`:

- `giorni.png`: 12 giorni, Editoriale;
- `clock.png`: 08:42:16, Segnale;
- `insieme-da.png`: relazione automatica 1564 giorni, Vetro;
- `countdown-daily.png`: countdown + Daily Question, nessuna collisione;
- `sintonia-aurora.png`: Aurora sbloccato via Sintonia;
- `collection.png`: confronto dei cinque rendering; `index.html`: galleria locale; `evidence.json`: stato/errori/collisioni verificati.

Preview 390×844, Supabase e foto simulati dalla fixture esistente; nessun media privato letto, rete esterna bloccata. Nei casi senza Daily la superficie viene nascosta solo dal harness screenshot, senza mutare codice o dati prodotto. Screenshot/log rimangono fuori dal repository.

## Rischi e limiti

- Migrazione `20261004204518_countdown_oggi_v1.sql` non applicata a database remoto: futuro rollout autorizzato deve applicarla prima del frontend.
- Refresh partner al foreground/apertura foglio o entro circa un minuto su Oggi visibile. Nessun nuovo canale Realtime/Sync.
- Offline un countdown già caricato continua nella sessione; dopo reload offline senza dati in memoria resta nascosto. Scritture richiedono rete.
- Senza foto countdown conservato ma nascosto. Nessuna foto alternativa.
- Orari editati nel fuso dispositivo, target UTC preservato per modifiche titolo/stile inclusi secondi/DST fold. Nuovi orari ambigui usano la prima occorrenza del browser; orari inesistenti rifiutati.
- Emulazione Chromium; iOS Safari fisico, VoiceOver e haptics non verificati.
