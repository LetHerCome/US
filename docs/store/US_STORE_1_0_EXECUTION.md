# US Store 1.0 — Primo piano esecutivo

**Status:** PIANO DI CANTIERE / NO EXECUTION AUTHORIZATION
**Sequenza:** S0 → S1 → S2 → S3 → S4 → S5 → S6. Possono esistere audit indipendenti in parallelo, ma non branch simultanei che toccano gli stessi file.
**D5:** feature freeze; bugfix, privacy, security e compliance sono lavori del release scope.
**D4:** aperta; nessun pricing/paywall/billing/abbonamento in questi sprint.

## Ruoli e regole

- **Presidenza** — firma concept significativi, accetta release gates e autorizza esplicitamente merge, SQL di produzione, spesa, provisioning, deploy, Play submission.
- **Capocantiere** — backlog prioritario, specifiche misurabili, tracciamento dipendenze e verifica che l'agente non sfori lo scope.
- **Implementatore (Codex oppure Claude Code)** — una missione, un branch, un HEAD, test e handoff.
- **Revisore indipendente** — auth/SQL/privacy/native/security più QA per le modifiche a rischio. Nessun auto-merge dopo solo CI green.
- **Coppie tester** — test esclusivamente con consenso, account isolati e media sintetici nei materiali condivisi.

Ogni missione si chiude con: comportamento verificato; test e diff vs baseline; screenshot/devices quando UI; rollback; privacy; decisione di merge separata.

## S0 — Lock operativo (presente PR documentale)

**Deliverable:** docs/DECISIONS.md, docs/CURRENT_STATE.md aggiornati + Carta, Baseline, Quality Gates e questo Piano.
**Acceptance:** tutte e cinque le delibere D1-D5 riportate correttamente; monetizzazione non definita; nessun runtime/DB/SW/assets toccato; riferimenti GitHub verificati.
**Gate:** review/merge documentale soltanto dopo approvazione.

## S1 — Stabilizzazione Android V6 + widget/motion

**Prerequisito:** S0 accettato. **Primo work package:** docs/missions/us-store-s1-android-release-baseline-v1.md.
1. Collaudare APK firmato generato da main V6 sul dispositivo già installato, **come aggiornamento**, non clear-data/reinstallazione.
2. Confrontare la lista dei test falliti/skip con baseline: classificarli in reale regressione, legacy rotto, ambiente o falso positivo. Priorità assoluta a Boot/Auth, Sync, Notifications, Ricordi e Private Storage.
3. Riconciliare #170 con main V6 in un solo branch di integrazione; la PR body #170 è obsoleta, leggere HEAD e UI_WIDGET_FEEDBACK_V2.md. Non mergiare #167/#168/#169 singolarmente.
4. Validare widget Ti Penso contatore 24h, Foto & Noi che segue Oggi, Noi 2×1 ritratti/distanza, swipe globale rimosso, Back, animazioni, accessibilità.
5. Android signed upgrade sullo stesso dispositivo preservando 4 widget installati, login, preferenze, media cache e history.
6. Verificare CI Android/iOS, CSS/popup, build Cloudflare/Capacitor e asset marker per evitare mix di versioni PWA.
**Uscita:** report QA firmato, tutti P0/P1 risolti, baseline test documentata, candidata merge con rollback, approvazione Presidente per merge/deploy.
**Fuori scope:** N3.7 sizing generale, nuovi widget, nuova IA.

## S2 — Stato reale della settimana condivisa

**Prerequisito:** S1 release baseline nota, #177 riprofilata su HEAD main effettiva.
1. Review immutabilità ricevute server Daily e membership; no storico falsificabile dal client; same-session/same-day Europe/Rome.
2. Preflight schema/ledger e script dry-run; valutare la migrazione proposta con real PostgreSQL e RLS.
3. Rollout SQL **staging** con autorizzazione e test a due account (stessa coppia), casi DATE/TZ, offline, reorder, grants, retry.
4. Solo dopo gate e autorizzazione separata: SQL production, merge client, Cloudflare release, Android QA APK con versionCode crescente. Rollback non deve cancellare history.
**Uscita:** UI 7 giorni onesta (dati veri, altrimenti unavailable), XP esattamente server-authoritative, no doppio credito.
**Fuori scope:** cambiare il limite Game V2 da 3 a 5, nuova valuta/quest/Arcade.

## S3 — Account pubblico e privacy (CRITICAL PATH per Store)

**Prerequisito:** audit MC2/MC3, protocollo di isolamento sessioni/notifiche.
1. Definire e costruire signup/verify-email, error handling, rate limiting/anti-abuse e recupero password; mantenere auth Supabase, niente provider parallelo.
2. Uso MC2/MC3: create/join couple, wait/invite, scadenza/rotazione e fallback; rimuovere nomi hardcoded UI, test cross-tenant.
3. Policy di separazione: accesso precedente dopo cambio coppia, custody dei contenuti condivisi, export e deletion con richieste documentate, purge attivo di foto/tokens/cache.
4. Chiudere il gate FCM su shared-device e verificare logout offline, stale token/provider invalidation e quarantena cross-account. Testare veri dispositivi.
5. Aggiungere help/support, privacy/legal web URL, data deletion web endpoint pubblico, policy di minimizzazione log.
**Uscita:** coppia B appena creata senza provisioning manuale, nessuna fuga A→B, richiesta cancellazione utilizzabile dentro e fuori l'app.
**Fuori scope:** nuovo social network, magic links obbligatori se non decisi, Google/Facebook sign-in, billing.

## S4 — Premium finish limitato e qualità

**Prerequisito:** S1-S3 stabili.
1. Audit visivo con baseline Android reale, 320/360/390/412, portrait/landscape, accessibility font; Oggi/Noi/Ricordi/Gioca/Settings/popups.
2. Unificare i componenti condivisi e CSS solo dove è dimostrata una sovrapposizione; attenersi a Phosphor e asset APPROVED.
3. Ottimizzare foto private, carico su Wi-Fi lento/offline, permission UX, scroll, gesture Back, battery and reduced-motion.
4. Preparare fixture/demo couple e screenshot con nomi e foto sintetiche, nessun media privato.
**Uscita:** report before/after, zero block visivi P0/P1, perf e a11y verificati.
**Fuori scope:** redesign completo di Ricordi, popup immersivi non richiesti, nuovi Compagni, Arcade e nuova bottom nav.

## S5 — Google Play

**Prerequisito:** S1-S4 e privacy completati.
1. Audit keystore/certificato senza esportare chiavi; decisione Play App Signing prima di prima submission; AAB, versionCode e applicationId invariati.
2. Preparare account Play Console, support email, privacy/data safety/permission disclosures, policy account deletion, app content, rating, screenshot/demo, test credentials per review.
3. Internal testing → closed testing. Se account personale creato dopo 13/11/2023: almeno 12 tester iscritti per 14 giorni continuativi; verificare il requisito sul proprio account.
4. Beta qualitativa preferibilmente 15–25 coppie, funnel pairing, 7/14-day retention (obiettivi ipotetici, non benchmark), crash-free sessions, review incidenti privacy.
5. Solo dopo gate: chiedere production access, staged rollout, monitoraggio, stop/rollback procedure.
**Uscita:** release Android su Play con release notes, privacy e assistenza; account sicuri e flussi principali provati.

## S6 — App Store iOS (solo dopo Android)

**Prerequisito:** prova domanda/retention Android e autorizzazione costo Apple Developer.
1. Build iOS già esistente e CI mantenute durante S1-S5.
2. Test su iPhone fisico, Face ID, Keychain, APNs, safe area, cold-start/back e TestFlight.
3. Verifica Apple review/metadata, account deletion, privacy disclosures e native-value.
4. Monetizzazione D4 rivalutata a parte: NON fa parte automaticamente di S6.
**Uscita:** iOS beta→Store dopo review/QA separata.

## Dipendenze e blocchi di governance

| Decisione/action | Tipo | Autorità |
|---|---|---|
| App signing certificate continuity, app ID | Irreversibile o onerosa | Presidente dopo report tecnico |
| SQL production (#177, V3 cosmetics o auth migrations) | Cambia dati/schema | Presidente, review SQL e QA staging |
| Signup pubblico e provisioning beta account | Security/data/privacy | Presidente dopo review privacy |
| Deploy main/Play release | Pubblicazione | Presidente |
| Pricing/billing/paywall | Non approvato D4 | Nuova delibera |
| UI nuovi Compagni/Arcade/Diario | Congelati D5 | Nuova delibera o dopo V1 |

## Dashboard del cantiere

Stati ammessi per ogni missione: PROPOSED → AUDITED → IMPLEMENTING → QA → READY_FOR_REVIEW → APPROVED_FOR_MERGE → MERGED → VERIFIED_IN_PRODUCTION.
Non saltare QA/rollout. **READY_FOR_REVIEW** non significa live.

### Ordine immediato
- **Ora:** finalizzare e far revisionare PR Phase 0 (documentale).
- **Prima missione esecutiva:** S1 Android release baseline, iniziando da confronto firmato APK main V6 e #170 senza merge; usare mission spec dedicata.
- **Dopo:** S2 settimana vera (#177) e S3 account pubblico/notification privacy. L'ordine SQL/frontend è esplicito per ogni migrazione.
