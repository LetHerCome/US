# US — La vostra settimana Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Mostrare soltanto partecipazione condivisa verificabile e XP reali della settimana Rome.
**Architecture:** Estendere daily_answers con una ricevuta immutabile, leggere Daily/Game/ledger con una RPC autorizzata e sostituire dayRail nel runtime games.js. Nessun nuovo dominio, XP o budget.
**Tech Stack:** Vanilla JS/CSS, Supabase/Postgres, PGlite, PostgreSQL concorrente, Playwright.
**Spec:** docs/missions/us-stabilization-v6-audit-design.md, contratto definitivo Missione 2.

## Global Constraints

- Base origin/main b0c9f82, branch codex/us-v6-week-participation nel worktree isolato esistente e pulito.
- Daily della data + stessa sessione con entrambe le side e sessione completate nella medesima giornata Europe/Rome.
- Lunedì–domenica; tre giochi settimanali invariati; XP solo progression_events.action_day, nessuna scrittura XP nuova.
- Nessun backfill, cancellazione storico, SQL produzione, merge o deploy manuale.

## Review Focus

- Timestamp client e DELETE/TRUNCATE/re-INSERT non possono fabbricare ricevute.
- Nuovo partner/coppia, risposte lente e ciclo A→B→A non mostrano stato dell'identità precedente.
- Due completion di sessioni diverse o a cavallo di mezzanotte non qualificano.
- Cambio settimana e DST usano limiti Rome, non finestre di 24 ore o calendario dispositivo.
- Offline/RPC assente/errore non diventano zero, spunte o XP inventati; Gioca resta utilizzabile.

### Task 1: Ricevuta Daily e RPC

**Files:** migrazione CLI 20261009185803_us_v6_week_participation.sql; tests/us-week-participation-db.test.js.
**Interfaces:** public.get_couple_week_participation_v1() senza argomenti → week_start/week_end/today/timezone/days/completed_days/weekly_xp_awarded. Day: date/daily_complete/game_complete/complete/status (complete,incomplete,unverifiable).
- [x] RED: migration su baseline reale; colonna assente/RPC assente.
- [x] Trigger BEFORE INSERT/UPDATE: prima ricevuta server, valore client ignorato; UPDATE conserva OLD incl. NULL; identità immutabili, risposta non vuota, auth.uid + coppia server. Revocare DELETE/TRUNCATE e grant superflui; proteggere anche Daily parent da eliminazione client.
- [x] Aggregazione privata senza grant client; facciata SECURITY DEFINER autorizzata, search_path vuoto e EXECUTE solo authenticated. Due membri correnti, join side per slot server e stesso session_id, tre completion nel giorno; NULL storico unverifiable. Somma ledger per action_day.
- [x] GREEN: autenticazione, anon, no profilo/coppia/partner, cross tenant, spoof, timestamp/update/upsert/null legacy, DELETE/TRUNCATE/identity change, XP invariati, sessioni differenti, attesa, mezzanotte, DST e lunedì. Fingerprint delle authority XP/Game invariato.

### Task 2: Fascia Gioca

**Files:** games.js/games.css/app.js; tests/us-week-participation-client.test.js; contratti UI esistenti pertinenti.
**Interfaces:** USGameV2.refreshParticipation() riusato da load, successo Daily e realtime esistente; nessuna nuova subscription.
- [x] RED: rendering server dates/count/XP, loading/error/unverifiable, letture concorrenti e cambio identità.
- [x] Sostituire dayRail, mantenere catalogo/allowance; caricare partecipazione indipendentemente da get_game_v2_home. Invalidare su errore e cambio identità. Niente storage/streak/ottimismo.
- [x] Refresh in Gioca/foreground, dopo Daily/Game e ritorno rete. UI mostra check Phosphor soltanto per complete server.
- [x] GREEN: nuova suite e regressioni Game/Daily/allowance.

### Task 3: Concorrenza e visual/PWA

**Files:** tests/us-week-participation-concurrency.test.js, tests/us-week-participation-browser.test.js, job CI; marker di release esistenti.
- [x] Real PG: due upsert concorrenti conservano una ricevuta; due completion condivise serializzano senza nuovo XP/consumo e senza verde prima del commit.
- [x] Browser prima/dopo 320×568,390×844,844×390; Android class/safe area, reduced motion, offline/retry, cambi identità/settimana. Documentare dispositivo fisico mancante.
- [x] Bump atomico marker tramite script esistente, upgrade PWA precedente/offline/precache interrotto/logout/push.

### Task 4: Consegna

- [x] npm test confrontato con baseline main; build Cloudflare/Capacitor, sync/test/build native disponibili, diff-check.
- [x] Una review indipendente dell'intero branch; correggere problemi pertinenti con regressioni.
- [x] QA + rollout: preflight di sola lettura, migration isolata/staging, applicazione produzione solo autorizzata e separata, poi frontend; RPC assente gestita senza falso progresso.
- [ ] Commit/push, PR draft separata e risultati CI. Nessun merge/deploy.

## Execution ledger

- Setup: spec approvata dall'utente, esecuzione inline autorizzata. Skill planning non richiede una nuova approvazione contro questa istruzione esplicita.
- Audit: game_session_sides usa actor_role, non user_id: conservare slot server esistenti, senza migrazione parallela delle identità Game.
- Audit metadata produzione in sola lettura: Daily RLS attiva ma grant DELETE/TRUNCATE presenti; Game/ledger senza scritture authenticated. Nessun record personale letto.
- Docs Supabase RLS/functions + changelog 2026-10-09 verificati; endpoint .md non disponibile, usato changelog HTML. CLI 2.117.0, migration new eseguito solo localmente.
- Review indipendente: nessun Critical/Important; catture con nudge/scroll corrette e ricatturate. Authority Game a slot documentata.
- Gate locale finale: npm test 1642 pass/40 fail/111 skip; tutti e soli i 40 fallimenti baseline. Build Cloudflare/Capacitor e sync Android pass. Gradle locale bloccato dal loopback prima della compilazione; PG concorrente e native attesi in CI.
- Fixture MC2 aggiornata per applicare la dipendente Missione 2 dopo MC2, mantenendo i test del substrate pre-MC2 separati; il preflight SQL non è stato indebolito.
