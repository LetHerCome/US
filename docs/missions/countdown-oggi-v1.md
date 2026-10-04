# Missione countdown-oggi-v1

Base attuale: `main` esatto `f463c7d73c9cba86c22130179a3fb79c405cfa3e`, repository `F:\AI\US`. Candidate originale preservato: `0459046db43b48ea9e6675b36255053188e4ecce` nel ref locale `codex/countdown-oggi-v1-original`. Worktree: `C:\Users\Francesco\.codex\worktrees\c8c3\US`. Branch: `codex/countdown-oggi-v1`.
Mandato: audit, progetto e implementazione candidati; nessun deploy, merge o modifica production.

## Audit e authority

Al primo audit `docs/CURRENT_STATE.md` era assente. Dopo il riallineamento sono presenti e lette le nuove authority: AGENTS, missione attiva, CURRENT_STATE, DECISIONS, ARCHITECTURE, product vision e checklist frontend/review/Supabase. CURRENT_STATE prevale sugli snapshot storici. Foundation e asset manifest rimangono autorità UI/visual.
Oggi: foto a due layer, Focus Photo, stack arbitrato M12A (una azione e un fatto). Daily Question: riusare stati/overlay, non duplicare risposte. Relazione: `couples.started_on`, modificabile dalle impostazioni. Sintonia: `get_progression_v1`, catalogo e `couple_reward_unlocks`, nessuna nuova economia.

## Design

Decisione creativa confermata dall'utente il 2026-10-05: utilizzare i sei stili originali qui descritti; accantonare gli otto concept della visual exploration. Nessun nuovo stile da implementare. Su successivo mandato esplicito è stata applicata la posizione più alta, subito sotto la top bar, con safe area e separazione da Daily Question. Il candidate tecnico `d922548` resta il riferimento precedente allo spostamento.

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

## Riallineamento sul main richiesto

Rebase del solo commit candidate su `f463c7d73c9cba86c22130179a3fb79c405cfa3e`, senza merge. Conflitti risolti nei marker PWA e nel fixture rewards, conservando il codice corrente di main. Marker candidate `us-countdown-oggi-v1-20261004-2`. Nessuna modifica alle authority ricevute da main.

Nessun conflitto concettuale: quattro tab, foto/tempo in primo piano, Daily in banda distinta, unlock server esistenti; slot cosmetici di main restano locali al dispositivo, scelta countdown condivisa per esplicito mandato della missione. Nessun impatto su Arcade/Pulse o calendario. Security/RLS e self-heal iOS conservati.

Integrazione baseline: indice MIGRATION_CUTOFF rigenerato dal workflow esistente (solo aggiunta countdown); gate F1B esteso con il pattern forward RPC già adottato per Edge, applicando migrazioni reali e verificando authenticated sì / anon e PUBLIC no. Snapshot MATRIX storico invariato. RED con grant anon temporaneo osservato, SQL ripristinato, GREEN reale.

Verifica finale aggiornata: suite completa 1423 test, 1383 pass, 40 skip, zero fail; browser countdown separato 7/7 senza skip; mirati 48/48; build web 143 e native 141 file; 16 asset APPROVED invariati. Manifest Android resta pulito dopo la suite. Review indipendente READY senza P1/P2. Cinque preview di Oggi generate (giorni, clock, Insieme da, countdown+Daily, Aurora Sintonia) con fixture locale e nessun pageerror. Report aggiornato contiene log, percorsi e limiti.

2026-10-05, patch autorizzata di posizione: sei stili originali conservati; countdown allineato in alto, sotto la top bar. Test esteso con gap 8–32 px e safe top24/bottom20 su 18 combinazioni, RED prima del CSS e GREEN 7/7 browser. Before/after verificato con stessa fixture. Review indipendente READY senza P1/P2. Suite completa in serie 1383 pass / 40 skip / 0 fail, build Cloudflare 143 file PASS, diff check pulito. La modalità in serie evita una race preesistente del test Scriptable contro il generatore PNG Android; byte finali identici a HEAD, nessuna modifica Android. Nessun deploy/push/merge.
