# Missione countdown-oggi-v1

Base: `F:\AI\US` HEAD `f15d441`. Worktree: `C:\Users\Francesco\.codex\worktrees\c8c3\US`. Branch: `codex/countdown-oggi-v1`.
Mandato: audit, progetto e implementazione candidati; nessun deploy, merge o modifica production.

## Audit e authority

`docs/CURRENT_STATE.md` assente anche nel checkout richiesto. Letti AGENTS, M2 Oggi, M10 attention, M12C Sintonia, foundation JS/CSS, asset manifest; codice corrente prevale sulle milestone storiche.
Oggi: foto a due layer, Focus Photo, stack arbitrato M12A (una azione e un fatto). Daily Question: riusare stati/overlay, non duplicare risposte. Relazione: `couples.started_on`, modificabile dalle impostazioni. Sintonia: `get_progression_v1`, catalogo e `couple_reward_unlocks`, nessuna nuova economia.

## Design

Un solo tempo scelto dalla coppia, direttamente sulla foto. Titolo massimo 32 caratteri, nessuna foto propria. Insieme da: giorni di calendario Europe/Rome dalla data esistente, senza copia della data. Countdown: giorni di calendario oppure istante assoluto, salvato UTC e modificato nell'orario locale del dispositivo. Scaduti: zero, nessun tempo negativo o cambio automatico. Massimo 12 countdown condivisi.

Stili: Editoriale (serif, immediato), Segnale (monospace, immediato), Vetro (glass, immediato), Aurora (frame_aurora, livello 4), Orbita (ring_orbit, livello 9), Cromo (frame_chrome, livello 12). Gli unlock esistenti abilitano anche lo stile, senza equipaggiare o cambiare altri slot; entitlement server, nessun XP aggiuntivo.

Countdown e stack in bande separate dello stesso hero, griglia quando presente il countdown; sui viewport bassi numero ridotto e stack compatto. Il resto della foto rimane libero. Entry discreta Countdown anche quando nascosto. Foglio canonico foundation con lista, editor, anteprima e sei campioni reali. Focus Photo nasconde/rende inert anche entry/countdown. Motion breve per cifre cambiate, ambient lento solo negli stili premium; reduced motion e pagina nascosta sospendono movimento e tick. Haptics attraverso UsFeedback.

## Architettura e piano

1. [x] Test RED dominio (date, DST, scadenza, entitlements) e database (membership, grants, shared CRUD, validazione, version conflict), poi `countdown.js` e migrazione SQL locale generata dal CLI.
2. [x] Runtime `USCountdown`: read/write RPC, versionamento ottimista; owner guard su risposte asincrone, reset logout, refresh foreground e polling limitato a Oggi visibile; niente persistenza privata aggiuntiva. UI e CSS isolati; navigation layer, hook relazione, focus hero.
3. [x] Integrare build web/native e precache; build marker coerente e gate PWA completo, cache media privata invariata.
4. [x] Test browser con Supabase fixture senza rete: CRUD, errori, blocchi unlock, collisioni 320×568 / 390×844 / 844×390, reduced motion, tastiera simulata, focus/back, screenshot prima/dopo. Build locale e suite completa; review indipendente finale.

## Review focus

Date DST e timezone; aggiornamenti simultanei dei partner; risposta async dopo logout/cambio coppia; backend non ancora migrato; titoli lunghi e viewport landscape; offline scrittura senza falso successo.

## Ledger

Ruling: esecuzione diretta autorizzata dal brief dell'utente, senza ulteriori gate di approvazione progetto. Reviewer finale previsto dalla skill executing-plans.
Ruling: riuso del worktree già isolato del repository richiesto, aggiornato al suo HEAD; modifiche locali del checkout F lasciate intatte.
Task 1 complete: 8/8 test dominio/SQL, RED osservato prima dell'implementazione. Read RPC funziona anche in transazione READ ONLY. Migrazione non applicata a production.
Task 2 complete: 7/7 test browser, inclusi titoli vuoti/whitespace, deadline DST fold con secondi, owner switch durante write, error throttling, conflitto partner e form bloccato durante save. Senza foto il countdown scelto rimane salvato ma non copre l'invito al primo ricordo.
Task 3 complete: 42/42 test mirati; shell upgrade/offline/precache failure/private cache/push/logout verificati dal harness esistente. Build web 143 file, native 141 file. JS syntax e diff check puliti; 16 asset APPROVED con SHA invariati.
Task 4 complete: review indipendente READY come candidato locale, nessun P1/P2 residuo. 18 combinazioni stili/viewport verificate e altri 18 casi clock/titoli massimi verificati dal reviewer. Suite completa e limiti descritti nel report.
Ruling: loader ESM Windows temporaneo fuori repository per eseguire i test preesistenti che usano import(path assoluto). Nessun cambio al codice dei sottosistemi coinvolti. La suite genera un manifest Android equivalente con CRLF: verificata identità JSON e testo senza CR prima della pulizia; rerun Scriptable 23/23.

Stato finale: candidate locale completo, nessun deploy/push/merge. Vedi `countdown-oggi-v1-report.md`.
