# Missione S1-A — US Store 1.0: Android release baseline e reconciliation #170

**Status:** PROPOSED — PRIMA MISSIONE ESECUTIVA, NON ANCORA LANCIATA
**Prerequisito:** Phase 0 approvata e merge documentale; snapshot main fresco.
**Owner proposto:** Codex implementazione/verifica; Claude Opus review indipendente di UX/rischi; Presidenza QA fisica e autorizzazioni.
**Scopo:** stabilizzare quanto già costruito senza aggiungere nuove funzioni.
**NON è autorizzato:** merge, produzione, deploy Cloudflare/Supabase, migration, secret rotation, signing-key replacement, release store, rework N3.7.

## Contesto

- Main V6 verificata 10/10: b0c9f82d7830f13a0310016067e36da961855d23.
- PR #170 draft: ui/us-widget-motion-integration-v1-20261009 @ b58fb08af50d4246de91375d15f84aa175c46831.
- PR #170 body iniziale ormai non riflette l'ultimo HEAD. Leggere in particolare docs/UI_WIDGET_FEEDBACK_V2.md su quel branch, e poi codice/diff.
- La source PR #167/#168/#169 non va mergeata separatamente. #177 resta distinta (backend/SQL).
- CI della #170 finale verde al 9/10, ma candidata non necessariamente aggiornata a main V6. Esiste un APK QA firmato generato su quella SHA. Main V6 ha un proprio APK firmato CI.

## Ordine rigoroso

### M1 — Audit in sola lettura
1. Fetch main e #170; confermare SHA correnti, diff e conflitti file per file.
2. Costruire una matrice differenziale per shell, app.js, HTML/version/manifest/SW, widget-hub, native bridge Java, Tests.
3. Registrare marker asset/cache, firma/certificato (solo fingerprint, nessuna private key), versionCode e stato degli artefatti signed QA.
4. Determinare se #170 è safe da integrare senza reintroduzione delle precedenti decisioni UX: **Noi 2×1 ritratti+distanza, niente GIOCA; Ti Penso ready + contatore 24h; guide statiche rimosse; no global tab swipe; Back sì**.
5. Confrontare suite test note: baseline main con ~40 errori preesistenti, segnare i nomi/radici e quali toccano aree release-critical.

### M2 — Implementazione minima solo dopo audit
1. Sul branch dedicato S1, integrare #170 con main V6 usando merge/rebase non distruttivi, senza cambiare prodotti non coinvolti.
2. Preservare version/cache coherence: evitare regressioni PWA upgrade V5→V6 e private cache.
3. Fix circoscritti ai difetti riprodotti durante M1/M2; non rifare CSS/architettura.
4. Aggiungere/adeguare test di contratto mirati per tutte le risoluzioni dei conflitti.
5. Lasciare invariati SQL/RLS, notifiche server, MC3 backend, progressione, auth flows.

### M3 — Test automatici
- npm test, separare inherited failures da nuovi failures per nome/test; non mascherare skip.
- node --test tests/widget-system.test.js tests/m5c1-photo-motion.test.js tests/premium-motion-v1.test.js tests/ui-widget-motion-integration.test.js, e i test PWA/Boot/Auth pertinenti.
- npm run build:cloudflare-pages; npm run build:capacitor-web; git diff --check.
- CI Android e iOS; signed QA APK con firma permanente e versionCode maggiore **solo** con firma esistente e senza esposizione segreti.
- Test di upgrade del service worker con dati/cache privati preesistenti e di un update parzialmente interrotto.

### M4 — QA fisica (gate)
Dispositivo Xiaomi con US già installata. Installare candidata signed **sopra** la app corrente, senza uninstall, senza cancellare dati.
- Verificare sessione, app lock, settings, navigazione, safe areas e keyboard/emoji.
- Verificare 4 widget installati e preservati; invio Ti Penso; counter 24h; Foto & Noi; Noi 2×1 ritratti/distanza/fallback; Countdown.
- Verificare tab swipe disabilitato e Back di bordo; carousel Ricordi e swipe gioco intatti; rapid switches e modal.
- Testare slow/offline e re-open/cold-start, foto Ricordi; segnalare latenza percepibile con video/stato.
- QA supplementare secondo telefono Android se disponibile; non spacciarlo per già fatto.

## Output obbligatorio a fine missione

1. **STATUS:** NOT_READY oppure READY_FOR_REVIEW, mai LIVE implicito.
2. Base/HEAD SHA, lista file produzione modificati, conferma assenza modifiche fuori scope.
3. Matrice main/#170 con scelte di conflitto spiegate.
4. Tabella test pass/fail/skip e delta rispetto alla baseline; CI links; build ids.
5. Check firmato APK: SHA artifact, versionCode, firma fingerprint (pubblica), percorso di installazione.
6. QA manuale real device con checklist e anomalie, compresi rollback/known risks.
7. PR in draft o commit branch pronto per review; nessun merge/deploy.

## Exit gate di S1-A

- Nessuna regressione P0/P1 su boot, auth, dati privati e sessioni; consentiti solo bug P2/P3 non-bloccanti documentati e approvati.
- I widget esistenti sopravvivono senza reinstallazione; tutte le correzioni del 9/10 presenti.
- Tutta CI di missione verde; full suite fail-set non peggiora rispetto al baseline e ogni fallimento release-critical ha remediation specifica.
- QA del dispositivo reale firmata dal Presidente.
- Merge e deployment solo dopo autorizzazioni separate.

## Handoff sintetico per Codex

“Leggi AGENTS.md → docs/CURRENT_STATE.md → docs/DECISIONS.md → docs/store/US_STORE_1_0_CHARTER.md → questa missione. Inizia esclusivamente da M1 audit in sola lettura; confronta main V6 con PR #170 HEAD, verifica che la body PR è stale rispetto a UI_WIDGET_FEEDBACK_V2, prepara matrice di conflitti, build/version/firma/test failure-set. Non fare merge, deploy, SQL, modifiche alla produzione e non lanciare altri redesign. Consegna S1_A_AUDIT_READY con SHA, evidenza, proposta di integrazione e blocchi.”
