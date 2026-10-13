# US 1.0 — Audit di rilascio e roadmap verso Google Play

**Data:** 2026-10-13 (Europe/Rome)
**Base verificata:** `main` @ `9de2073` (merge PR #188). PR analizzate alle HEAD: #180 `c5602b6`, #187 `8b0a0ec`, #189 `96ea10d`, #190 `c4568b0`.
**Metodo:** sette audit specialistici indipendenti (architettura, auth/lifecycle, sicurezza/privacy, Android/Play, notifiche, UX/accessibilità, qualità) e una revisione indipendente che ha ricontrollato sul codice le 11 affermazioni più importanti (10 confermate, 1 parziale, 0 smentite). Suite completa eseguita su `main` in questa sessione.
**Limiti:** nessuna chiamata a Supabase (produzione o staging), Firebase o Play Console. Gli stati "live" vengono dai documenti e dai commenti delle issue, e sono indicati come tali. Nessun build Android eseguito (manca l'SDK nel container): ciò che dipende dal manifest unito è marcato INFERITO.
**Governance:** questo documento non autorizza merge, deploy, SQL, modifiche ai segreti o pubblicazioni. Le decisioni D1–D5 restano vincolanti; D4 (monetizzazione) non è toccata.

Legenda stati: **Prog** = progettato · **Branch** = implementato su branch · **Main** = mergiato · **Test** = test automatici · **Stg** = distribuito su staging · **Prod** = distribuito in produzione · **HW** = collaudato su telefono reale.

---

## 0. Avanzamento — Missione 002 (aggiornato 2026-10-13)

Stati: **Completato** = fatto e verificato con evidenza · **Parziale** = fatto su branch, mancano verifiche o autorizzazioni · **Bloccato** = non può proseguire senza un'azione esterna · **Da iniziare**. Niente di quanto sotto è mergiato, distribuito o provato su telefono, salvo dove indicato.

| ID | Attività | Stato | Evidenza | Cosa manca |
|---|---|---|---|---|
| A1 | Congelare i deploy Edge da `main` | Parziale | Regola in questa roadmap e nel piano S3.2 §10 | Scriverla in `CURRENT_STATE.md`/`AGENTS.md` al merge di #187 |
| A4 | Test di ri-registrazione push all'avvio a freddo | Completato (su branch) | PR #187: era un difetto del test; ora passa. Unica differenza della suite rispetto a `main` | Merge |
| A2 | #187 pronta al merge | Parziale | HEAD `6cdac6f`: BUILD_ID `us-store-s3-native-push-owner-gate-20261013-1`; contratto Android/server FCM con test; canale `us_partner` non più declassato; account B abilitato solo dopo la cancellazione confermata del token di A; nuovo workflow CI che blocca payload FCM con dati privati; revisione indipendente senza leak tra coppie (3 rilievi minori corretti). CI verde tranne `us-staging-s31`, che dipende da uno script presente solo in #189 | Verifica A3, protocollo fisico E5, autorizzazione al merge |
| A3 | Verifica in sola lettura degli 8 bundle Edge live | Bloccato | — | Autorizzazione del fondatore alla lettura della produzione |
| A5 | Prerequisiti nativi in produzione (Firebase, segreto FCM, colonna `installation_id`) | Da iniziare | — | Fondatore, dopo A3 |
| B1 | Pipeline AAB | Parziale | Branch `claude/play-aab-pipeline-x4kv81` (`bf8c747`): CI verde (run 38327974170 su `a1e62c4`), `bundletool validate` OK, targetSdk 36 / minSdk 26, versionName `1.0.0`, pagine 16 KB conformi; la modalità Play resta bloccata finché #187 non è mergiata; niente più APK firmati in chiaro come artifact. Il fondatore ha autorizzato una PR draft | AAB costruito sopra #187; chiave di upload e segreti GitHub (fondatore); prova su telefono |
| B2 | Permesso microfono | Parziale | `RECORD_AUDIO` e `MODIFY_AUDIO_SETTINGS` nel manifest di #187 | Prova della nota vocale su telefono |
| F-02 | Strategia di firma | Completato (decisione) | Il fondatore ha scelto Play App Signing con chiave generata da Google e chiave di upload dedicata | Creazione della chiave e dei segreti (fondatore) |
| C1 | Decisioni lifecycle (D-1…D-19) | Bloccato | Elencate nel piano S3.2 §11 con valori consigliati | Risposta del fondatore |
| C3–C4 | Cancellazione account | Parziale (solo piano) | [Piano S3.2](US_S3_2_ACCOUNT_DELETION_PLAN_2026-10-13.md): riusa inventari e test di #190, revisione indipendente "approvato con modifiche", 7 modifiche obbligatorie integrate. Stima rivista 16–20 giorni | C1, merge #187, poi preflight P-1 su staging (autorizzazione) |
| E5 | Protocollo fisico notifiche T0–T7 | Da iniziare | — | Telefono e fondatore, sull'APK di staging dal commit finale di #187 |
| C2, C5, C6, D1, D2, E1–E4, E6, E7 | Altre attività P0/P1 | Da iniziare | — | Vedi §6 |

**Nuovo rischio (ALTA):** il repository è pubblico e il workflow dell'APK interno su `main` pubblica un APK firmato con l'app ID di produzione, scaricabile da chiunque come artifact. La PR AAB lo corregge; finché non è mergiata il rischio resta. Si aggiunge a H-10.

**Cambiamento rispetto all'audit:** il fondatore ha chiesto di **non chiudere** la PR #190. Il piano S3.2 ne riusa l'inventario delle FK, l'harness PGlite, il serializzatore di export e l'inventario media; le bozze "vault" restano parcheggiate sul branch.

---

## 1. Executive summary

US ha un prodotto core maturo (quattro tab, backend con RLS su tutte le tabelle, build Android firmata, API 36), ma **oggi non è pubblicabile su Google Play**. I motivi non sono di interfaccia: sono di conformità, privacy e allineamento del codice.

I veri blocchi sono sei:

1. **Il codice di `main` non corrisponde alla produzione per le notifiche.** L'11 ottobre otto Edge function di produzione sono state ridistribuite con il codice della PR #187, non mergiata. Un'app Android costruita da `main` non mostrerebbe le notifiche in background, e un nuovo deploy da `main` reintrodurrebbe notifiche con testo privato sulla schermata di blocco.
2. **Non esiste alcuna cancellazione dell'account**, né in app né via web, come Google Play richiede. Inoltre, con le chiavi esterne attuali, cancellare un utente cancellerebbe anche contenuti del partner (messaggi ricevuti, foto dentro i Ricordi, calendario).
3. **Mancano informativa privacy, termini, contatto di supporto e scheda Data safety.** In app c'è solo un popup di quattro righe, che sulla posizione dice una cosa non vera.
4. **La posizione è salvata con precisione al decimetro, inviata in tempo reale al partner e mai cancellata**, mentre l'app dice "salvata solo per la distanza".
5. **La pipeline non produce il formato richiesto da Play (AAB)**: la CI genera solo APK.
6. **Le notifiche native tra account diversi sullo stesso telefono (#181) non sono ancora provate su hardware** nei casi critici (messaggio in coda di A dopo il login di B, offline, app chiusa, riavvio).

Il registro pubblico (#189) non è richiesto da Play per i test interni e chiusi, ma serve per il lancio pubblico. La PR #190 ha prodotto molta ricerca utile ma nessuna funzione utilizzabile: la revisione propone un percorso molto più snello (paragrafo 4).

La suite di test su `main` dà **1783 test, 1723 passano, 54 falliscono, 6 saltati**. Dei 54, 2 sono problemi reali, 3 sono registri migrazioni non aggiornati, 11 dipendono dall'ambiente (PostgreSQL 17) e 38 sono test obsoleti. La suite completa non gira in nessuna CI e `main` non è protetto.

**Stima indicativa (non misurata):** circa 3 settimane di lavoro tecnico sul percorso critico, più le attività del fondatore, più i 14 giorni di test chiuso obbligatori se l'account Play è personale. Nessuna data di pubblicazione è dichiarata qui.

---

## 2. Mappa dell'architettura e delle funzionalità

| Area | Sorgente principale | Stato più alto raggiunto | Note |
|---|---|---|---|
| Shell, login, Oggi, Daily, Ricordi | `app.js` (4589 righe), `index.html` | Main · Prod (PWA) · HW (coppia fondatrice) | Client Supabase globale `sb` (`app.js:106`) usato da ~30 script in ordine fisso |
| Avvio/offline/aggiornamento | `fix4.js`, `fastboot2.js`, `polish4.js`, `home-cleanup.js` | Main · Prod | Codice vivo, non rimuovere prima della 1.0 |
| Noi / Calendario unico V4 | `calendar.js`, `calendar-domain.js`, `noi-v2.js`, `events.js` | Main · Prod | `events.js` ancora raggiungibile |
| Gioca / Game V2 / progressione | `games.js`, `progression.js` | Main · Prod | Settimana reale = PR #180 (draft, SQL solo su staging) |
| Lasciato per te | `left-for-you.js` | Main · Prod | Note vocali: permesso microfono mancante su Android (vedi 3) |
| Impostazioni / identità | `settings.js`, `identity.js` | Main · Prod | Nessuna cancellazione account, nessun link legale |
| Onboarding coppia (MC2/MC3) | `onboarding.js`, RPC `create_couple`, `accept_partner_invite` | Main · Test (9/9) · Stg (3 coppie) · Prod (RPC) | Funziona senza intervento manuale una volta creato l'utente |
| Registrazione/verifica/recupero | `public-auth.js` (solo #189) | Branch · Test · Stg (browser) | Bloccata a staging da costante hardcoded |
| Esportazione / cancellazione / separazione | solo prototipi in #190 | Prog · Branch (ricerca) | Nulla di utilizzabile |
| Notifiche Web Push (PWA) | `notifications.js`, `service-worker.js` | Main · Prod (6 iscrizioni) | Testo privato sul lock screen; non ritestate dopo il deploy dell'11/10 |
| Notifiche FCM native | `_shared/native-push-transport.mjs`, `notification-core.mjs`, `UsGuardedMessagingService` | Branch (#187) · Test · Stg · **Prod (solo server)** · HW (solo consegna positiva) | Deriva tra produzione e `main` |
| Blocco biometrico | `app-lock.js`, `native-plugins/us-app-lock` | Main · Test | Regressione CSS difensiva (vedi 3) |
| Widget Android | `widgets.js`, `native-plugins/us-widget-bridge` | Main · Test | Dati cifrati con Keystore e cancellati al logout |
| Service Worker | `service-worker.js` | Main · Prod | Cache versionata per BUILD_ID; nessun controllo che il BUILD_ID cambi |
| Backend | Supabase prod `iiakdfsxpywdkxravqjh` (piano Free), staging `dugmhngrfkuieeletatb` | Prod | 9 migrazioni in prod, 10 su `main` (V3 cosmetici non applicata) |
| Hosting web | Cloudflare Pages | Prod | Il progetto di produzione fa anteprime di ogni branch `mission/*` contro il Supabase di produzione |
| Android | Capacitor 8.5, `com.usapp.us`, min 26 / target 36, AGP 8.13 | Main · CI (APK firmato) | Nessun AAB; versionCode = secondi Unix |
| iOS | Capacitor 8, SPM, iOS 16 | Main · CI simulatore | Non blocca la V1 (D3) |

Terze parti che ricevono dati: Supabase (DB, Auth, Storage, Edge), Google Firebase Cloud Messaging, Cloudflare, Spotify (ricerca e iframe embed), jsDelivr (solo PWA). Nessun SDK di analytics, pubblicità o crash reporting.

---

## 3. Problemi reali con evidenze e gravità

Gravità: **BLOCCO** = impedisce la pubblicazione o causa perdita/esposizione di dati · **ALTA** · **MEDIA** · **BASSA**. "Verificato" = ricontrollato dal revisore indipendente sul codice.

### Blocchi

| ID | Problema | Evidenza | Note |
|---|---|---|---|
| B-01 | Produzione Edge e `main` divergono sul trasporto FCM. Da `main` un deploy reintroduce `message.notification` con nome del partner e titolo dell'evento, che Android mostra senza passare dal controllo di proprietà. | `git diff origin/main …#187 -- supabase/functions`: 3 file, +108/-24; commento #181 dell'11/10 (8 funzioni deployate da `8b0a0ec`). Verificato. | Impatto oggi nullo (0 token nativi in prod). Nessun workflow impedisce il deploy da `main`. |
| B-02 | Un'app costruita da `main` scarta in silenzio tutte le notifiche v2 in background. | `main` usa il servizio FCM standard di Capacitor; `notifications.js:49` accetta solo `v==='1'`; `capacitor.config.json` `presentationOptions: []`. Verificato sul codice, non su device. | Nessuna build Play può partire da `main` prima del merge di #187. |
| B-03 | Nessuna cancellazione account (in app o pagina web). | Nessuna RPC, Edge function o UI su alcun ref; `settings.js` "Scollega questo telefono" fa solo logout. Verificato. | Requisito Play per app con creazione account. |
| B-04 | Le cancellazioni a cascata distruggerebbero dati del partner. | `20261004000000_us_2_0_baseline.sql:6292-6391`: `shared_messages.recipient_id`, `left_for_you.recipient_id`, `calendar_entries.owner_id`, `moments.created_by` → `moment_photos`, `conserva_contributions` in CASCADE; `shared_event_completions.completed_by` senza ON DELETE blocca la cancellazione. Verificato. | Vietato anche cancellare utenti a mano dalla dashboard finché non c'è la migrazione. |
| B-05 | Nessuna informativa privacy, termini, supporto. Il popup "Privacy e dati" dice che la posizione è "salvata solo per la distanza", non è vero. | `settings.js` `privacyModal()` (4 paragrafi); nessun URL o `mailto:` nel repo. Verificato. | Senza questo non si compilano scheda Play e Data safety. |
| B-06 | Posizione precisa (6 decimali) salvata, letta dal partner, trasmessa in realtime, mai cancellata (nemmeno revocando il permesso). | `app.js` `saveMyLocation` (`toFixed(6)`), `hydrateDistance`; policy senza DELETE (baseline 6681-6687); `couple_locations` in `supabase_realtime` (baseline:7281). Verificato. | Correzione più economica: posizione approssimata, arrotondata, cancellata alla disattivazione/logout. |
| B-07 | Nessun AAB: tutti i workflow fanno `assembleRelease`. | `git grep bundleRelease` vuoto su tutti i ref. Verificato. | Il workflow interno risulta verde anche quando salta la build per segreto mancante. |
| B-08 | Isolamento notifiche native tra account (#181) non provato su hardware nei casi critici. | #181: solo consegna positiva B1 (segnalata dal tester) e 5/5 test su emulatore; non provati A-in-coda-sotto-B, offline, app terminata, Doze, riavvio. Nessun ricontrollo dopo la fine del drenaggio di 24 h (12/10 22:54). | Protocollo di test in 6.3. |

### Alta

| ID | Problema | Evidenza |
|---|---|---|
| H-01 | Permesso `RECORD_AUDIO` mancante: le note vocali falliscono su Android nativo. | `left-for-you.js:1126` `getUserMedia({audio:true})`; nessun `RECORD_AUDIO` nel manifest; Capacitor nega senza chiedere. Verificato sul meccanismo, non su device. |
| H-02 | `device_push_tokens` mantiene `UNIQUE(token)`: dopo un logout offline di A, il login di B sullo stesso telefono fallisce la registrazione. Con #187 B non riceve notifiche (nessuna fuga); senza #187 il testo di A arriva a B. | baseline:390; `20261006200000_native_notifications_v1.sql:135-138`. Verificato. |
| H-03 | Test reale fallito: la ri-registrazione push all'avvio a freddo non avviene. | `tests/native-notifications-v1-browser.test.js:251`, `notifications.js:202-207`. Causa non trovata. Sul percorso privacy di #181. |
| H-04 | Suite completa rossa (54) e non eseguita in nessuna CI; nessuna lista dei fallimenti noti; `main` senza branch protection. | Log della suite di questa sessione; `list_branches` → `protected:false`. |
| H-05 | Registro pubblico solo su staging; in produzione nessuna registrazione né recupero password. Per abilitarlo serve modificare il codice, SMTP, policy password, decisione CAPTCHA. | `supabase/config.toml:10`; `public-auth.js:10,150` su #189. |
| H-06 | Supabase di produzione su piano Free: niente backup ripristinabili, pausa per inattività, quote ridotte. Nessun runbook di ripristino. | `docs/store/US_STAGING_STATUS.md` (tabella ambienti). Decisione di costo del fondatore, non è D4. |
| H-07 | Nessun crash/error reporting: gli errori JavaScript nella WebView sono invisibili dopo il rilascio. | Nessun `onerror`/`unhandledrejection`/SDK nel repo. |
| H-08 | Policy A (cosa resta al partner quando uno esce) non è registrata in `docs/DECISIONS.md`; #190 si contraddice sulla durata di conservazione. | Commit `f4de21f` modifica solo un JSON; `lifecycle-risk-gates:40` vs `s3-3-stage-qa-fixtures:41`. |
| H-09 | Firma Play non decisa; la stessa chiave firma anche l'app di staging. | `docs/native/ANDROID_INTERNAL_SIGNING.md`; `s3-staging-android-qa.yml` su #187. |
| H-10 | Il repository è pubblico e contiene documenti di audit di sicurezza interni ed export con dati personali del fondatore; le anteprime Cloudflare di ogni branch puntano al Supabase di produzione. | Revisione indipendente §3.11; report qualità Q10. |

### Media

| ID | Problema | Evidenza |
|---|---|---|
| M-01 | Blocco app: due regole CSS rendono "visibili" elementi sotto il blocco. Nessuna fuga visibile (overlay opaco), ma il test di invarianza è rosso. | `top-chrome.css:8`, `styles.css:1109` vs `app-lock.css:5-8`. |
| M-02 | Il servizio notifiche di #187 ricrea il canale `us_partner` con importanza DEFAULT: probabile perdita dei banner a comparsa. Canale "Promemoria" mai usato. | `UsGuardedMessagingService.java:53-56` vs `UsPushChannels.java:37` (INFERITO sul comportamento Android). |
| M-03 | Notifiche Android generiche ("Apri US per vedere le novità"), raggruppate in un solo banner, senza apertura del contenuto. Scelta di privacy che indebolisce il ciclo D1. | Decisione di prodotto da registrare. |
| M-04 | Nessun controllo che il BUILD_ID cambi quando cambiano i file runtime: #187 modifica `notifications.js` senza nuovo BUILD_ID, le PWA installate terrebbero il file vecchio. | `service-worker.js`; `tests/release-build-marker.test.js`. |
| M-05 | `MIGRATION_CUTOFF.json` non aggiornato dal 6/10 (mancano 4 migrazioni); migrazione V3 su `main` ma non in produzione. | 3 test f2a/f2c falliti. |
| M-06 | Righe di Impostazioni nascoste che restano visibili (CSS `display:grid` batte `[hidden]`). | `settings.css:3`; screenshot del report UX. Verificato. |
| M-07 | Contrasto dei pulsanti principali circa 2,8:1 (sotto WCAG AA); zoom disabilitato; ~300 font sotto 12px. | `index.html:5`; report UX. |
| M-08 | Countdown del mesiversario in Impostazioni sempre un giorno in più. | `settings.js:61-68`. |
| M-09 | 38 test obsoleti nascondono copertura persa (Back stack, recupero media, idratazione Impostazioni). | Report qualità §2. |
| M-10 | Privilegi tabella troppo larghi per `anon`/`authenticated` (TRUNCATE su ~20 tabelle), non raggiungibili via API ma unica difesa resta la RLS. | baseline:6852, 6929-6985. |
| M-11 | Bundle gonfiato di ~15 MB di sorgenti grafiche non usate (`assets/source`), copiate nell'APK e nella PWA. | `scripts/build-*.mjs`. |
| M-12 | Avvio PWA offline fragile (supabase-js da CDN, non in cache, senza SRI). Non riguarda l'app Android, che lo include. | `index.html:140`, `service-worker.js:428`. |

### Bassa (selezione)

Ruoli interni `francesco`/`beatrice` nello schema (non visibili all'utente, non rinominare sotto D5); testo di logout che parla di "codice privato"; alcune etichette in inglese; build ID visibile in Impostazioni; token widget legacy in query string senza scadenza; confronti di chiavi non a tempo costante; `INSTALL_SHORTCUT` legacy; FileProvider ampio; workflow morti.

### Cosa è solido (verificato)

RLS attiva su tutte le tabelle pubbliche; tutte le 112 funzioni SECURITY DEFINER hanno `search_path` fissato; le funzioni interne sono solo `service_role`; le RPC utente controllano `auth.uid()` e appartenenza alla coppia; bucket `us-media` privato con policy per cartella di coppia; inviti MC2 a 128 bit con hash SHA-256 e scadenza 48 h; nessun segreto nel repo; logout che pulisce cache, media, push e widget; `allowBackup=false`; nessun permesso critico per Play (niente posizione in background, niente `READ_MEDIA_*`, niente allarmi esatti); target API 36; build web riproducibile byte per byte.

---

## 4. Analisi delle PR e delle attività avviate

| Elemento | Stato reale | Valutazione | Raccomandazione |
|---|---|---|---|
| **PR #187** — FCM data-only con controllo proprietario | Draft, HEAD `8b0a0ec`, 83 commit, CI 6/6 verde. Server già in **produzione** dall'11/10. Merge pulito con `main`. Emulatore 5/5; consegna positiva su telefono B1. | È il pezzo più importante e più vicino al traguardo. Mancano: revisione di sicurezza, nuovo BUILD_ID, correzione canale (M-02), triage di H-03, test fisici (6.3). Non contiene la migrazione per H-02. | **P0.** Completare, revisionare e mergiare per primo. CURRENT_STATE riporta ancora la HEAD vecchia `c8ab600`. |
| **PR #189** — registrazione, verifica email, recupero (solo staging) | Draft, HEAD `96ea10d`, CI 13/13 verde, 38/38 test mirati verdi in questa sessione. Nessun file in comune con #187. | Buona base. Per la produzione mancano: flag di produzione al posto della costante staging, SMTP personalizzato, modelli email in italiano, policy password, decisione CAPTCHA, accettazione termini e dichiarazione 18+, test del link email su Android (apre il browser). | **P0 per il test chiuso con tester esterni, P0 assoluto per la produzione.** Mergiare dopo #187, con BUILD_ID riconciliato. |
| **PR #190** — lifecycle, export, "vault" di conservazione | Draft, HEAD `c4568b0`, 123 commit, +5538 righe, nessun file applicativo, nessuna migrazione installata. Unico check rosso: Cloudflare `us-staging-s31` (script presente solo su #189). | Ricerca sproporzionata per la 1.0: approvazioni per singolo elemento, ledger di revisione, copia media in memoria, matrice JWT mai eseguita (0 oggetti su staging). Utili: inventario delle 78 FK, harness PGlite a due coppie, serializzatore export. Semplificazione mancata: lo Storage è già leggibile da entrambi i partner, quindi basta che le righe sopravvivano con autore NULL per conservare i ricordi senza copiare file. | ~~Chiudere senza merge~~ [Aggiornato 2026-10-13: il fondatore ha chiesto di tenerla aperta.] Resta aperta come riferimento; il piano S3.2 ne riusa i pezzi utili nelle PR snelle C3–C4. |
| **PR #180** — settimana condivisa reale (S2) | Draft, HEAD `c5602b6` su `main` vecchio (`0682a9b`), CI 9/9 verde. SQL installato **solo su staging**. | Migliora l'onestà della UI settimanale ma non è un requisito di pubblicazione. Richiede SQL di produzione e un rebase. Il suo trigger blocca scritture service-role su `daily_answers`: conflitto con il job di cancellazione. | **P2: parcheggiare fino a dopo la 1.0**, salvo decisione contraria. Se ripresa, adattare il trigger (S2 non deve bloccare il lavoro di cancellazione). |
| **Issue #181** (P0 notifiche) | Aperta. Lato server in produzione; lato app solo su branch. | Chiudibile solo dopo merge #187, verifica dei bundle live, protocollo fisico 6.3. | Mantenere aperta; usarla come registro delle evidenze. |
| **Issue #183** (P0 lifecycle) | Aperta, 26 commenti, quasi tutti su #190. | Va riorientata sul percorso snello. | Aggiornare con la decisione del fondatore su Policy A semplificata. |
| **Issue #154** (MC3 onboarding) | Aperta | Il codice MC3 è mergiato in `main` (PR #166). | Verificare e chiudere. |
| **Issue #155** (audit UX premium, mascotte collezionabili) | Aperta | Fuori ambito per D5. | Spostare a dopo la 1.0. |
| PR chiuse #186, #177, #170, #167–#169 | Superate da #187, #180, #179 | Nessuna azione. | — |

---

## 5. Release Readiness Scorecard

Valutazione qualitativa, senza percentuali. **Rosso** = blocca · **Ambra** = lavoro noto da fare · **Verde** = pronto per lo scopo della 1.0.

| Dominio | Stato | Motivo principale | Cosa lo porta a verde |
|---|---|---|---|
| Prodotto core (4 tab) | Verde | Funzionante in produzione per la coppia fondatrice; nessun errore di pagina nel rendering di una coppia nuova | QA su dispositivo (6.4) |
| Architettura e affidabilità | Ambra | Deriva Edge/main (B-01); nessuna telemetria errori (H-07) | A1–A3, E4 |
| Auth e onboarding | Ambra | Inviti e coppia OK; registrazione e recupero solo su staging | D1 |
| Ciclo di vita account | Rosso | Nessuna cancellazione, cascata pericolosa, Policy A non ratificata | C1, C3, C4 |
| Sicurezza backend | Ambra | RLS e funzioni solide; `UNIQUE(token)`, privilegi larghi, auth da irrobustire | C3, D1, P1-sicurezza |
| Privacy e conformità | Rosso | Nessuna informativa, posizione precisa esposta, Data safety non compilabile | C2, C5, C6 |
| Notifiche | Rosso (in miglioramento) | #187 completa su branch con revisione; non mergiata, bundle live non verificati, test fisici mancanti | A2, A3, E5 |
| Android e pipeline Play | Ambra | AAB e microfono pronti su branch, firma decisa; mancano merge, chiave di upload e prova su telefono | B1, B2 |
| UX e accessibilità | Ambra | Contrasto, righe nascoste, zoom, font; nessun blocco visivo | E3, E6 |
| Qualità e CI | Ambra | Suite rossa fuori CI, `main` non protetto | E1, E2 |
| Operazioni (backup, supporto, monitoraggio) | Rosso | Piano Free, nessun runbook, nessun contatto di supporto | F-05, C5, E4 |
| Store listing | Rosso | Solo icona 512 px nel repo | C6, E7 |

---

## 6. Roadmap P0/P1/P2

Stime in giorni di lavoro tecnico, **indicative e non misurate**. "Autorizzazione" indica dove serve un sì esplicito del fondatore prima di procedere.

### 6.1 P0 — Percorso critico

**Fase A — Allineare notifiche e codice (prima di ogni build Play)**

| ID | Attività | Dipende da | Stima | Criteri di accettazione | Evidenza richiesta |
|---|---|---|---|---|---|
| A1 | Congelare i deploy delle 8 Edge function da `main` e aggiornare `CURRENT_STATE.md` (deploy dell'11/10, HEAD reale di #187, #189/#190) | — | 0,25 g | Regola scritta in `CURRENT_STATE.md` e `AGENTS.md`; nessun deploy da `main` finché A2 non è mergiata | Commit documentale |
| A4 | Trovare la causa del test fallito di ri-registrazione push all'avvio a freddo (H-03) | — | 0,5–1 g | Causa documentata in #181; codice corretto e test verde, oppure test aggiornato con decisione registrata | Test verde in CI |
| A2 | Preparare #187 al merge: rebase su `main`, nuovo BUILD_ID, correzione canale `us_partner` (M-02), CI che verifica `POST_NOTIFICATIONS` nel manifest unito, revisione di sicurezza indipendente | A1, A4 | 1–2 g | Diff `main`↔`8b0a0ec` su `supabase/functions/_shared` vuoto dopo il merge; manifest unito con un solo ricevitore FCM; revisione senza rilievi bloccanti | CI verde sulla PR; nota di revisione. **Autorizzazione merge** |
| A3 | Verificare in sola lettura che gli 8 bundle live coincidano con `main` e che non contengano `message.notification` | A2 | 0,5 g | 8/8 hash coincidenti; registrato in #181 | Output della verifica. **Autorizzazione lettura produzione** |
| A5 | Verificare i prerequisiti nativi in produzione: `google-services.json` per `com.usapp.us`, segreto `FCM_SERVICE_ACCOUNT_JSON`, colonna `installation_id`; prova Web Push su 1 iscrizione PWA | A3 | 0,5 g | Tre prerequisiti presenti; notifica Web Push ricevuta | Screenshot e query. Fondatore |

**Fase B — Pipeline Android per Play**

| ID | Attività | Dipende da | Stima | Criteri di accettazione | Evidenza |
|---|---|---|---|---|---|
| B1 | Workflow `bundleRelease` manuale da `main`, firmato con chiave di upload; versionName leggibile (`1.0.0`); versionCode monotono con controllo `< 2.100.000.000`; il job fallisce se manca il segreto | F-02 (decisione firma) | 0,5–1 g | `.aab` firmato con SHA-256 come artifact; `bundletool validate` OK; manifest unito e lista permessi allegati | Run CI |
| B2 | Dichiarare `RECORD_AUDIO` e `MODIFY_AUDIO_SETTINGS` e provare le note vocali | A2 (stesso manifest) | 0,5 g | Nota vocale registrata e inviata su un Android 14+ reale, con richiesta permesso nel contesto | Video o screenshot |
| B3 | Mettere `assets/source` fuori dai bundle | — | 0,25 g | AAB ~15 MB più piccolo; nessun cambio visivo; asset APPROVED intatti nel repo | Confronto dimensioni |

**Fase C — Privacy e ciclo di vita (blocco per il test chiuso)**

| ID | Attività | Dipende da | Stima | Criteri di accettazione | Evidenza |
|---|---|---|---|---|---|
| C1 | Decisioni del fondatore registrate parola per parola in `DECISIONS.md`: Policy A semplificata (chi esce sceglie se i ricordi condivisi restano al partner), finestra di ripensamento e tempi di cancellazione, esportazione e separazione "su richiesta" per la 1.0 | — | fondatore | Testo approvato in `DECISIONS.md` | Commit documentale |
| C2 | Minimizzare la posizione: solo approssimata (rimuovere `ACCESS_FINE_LOCATION`), arrotondamento a 2 decimali, cancellazione della propria riga alla disattivazione, al permesso negato e al logout, rimozione dalla pubblicazione realtime, testo corretto | — | 1,5–2 g | Il partner non riceve mai coordinate precise; riga assente dopo disattivazione; distanza ancora mostrata | Test PGlite + verifica staging. **Autorizzazione SQL staging, poi produzione** |
| C3 | Migrazione FK (staging prima): autore dei contenuti condivisi `SET NULL`, destinatari gestiti, `completed_by` con regola esplicita, rimozione o riassegnazione di `UNIQUE(token)` (H-02). Preflight sullo schema di produzione | C1 | 2 g | Test a due coppie (harness #190): cancellazione di un utente sintetico lascia invariati i dati del partner e dell'altra coppia | Test verdi + preflight. **Autorizzazione DDL staging e poi produzione** |
| C4 | Cancellazione account: RPC `request_account_deletion(keep_shared)` (solo `auth.uid()`), coda accessibile solo al servizio, revoca token e sessioni; funzione di elaborazione service-role entro il termine deciso (cancella dati personali, posizione, token, avatar e oggetti Storage; elimina l'utente Auth; se ultimo membro elimina coppia e cartella); riga "Elimina account" in Impostazioni con ri-autenticazione; runbook operatore | C1, C3 | 3–4 g | Su staging: richiesta → accesso bloccato → elaborazione → 0 righe dell'utente, 0 oggetti Storage suoi, partner integro; idempotente; impossibile per un'altra coppia | Test + prova su staging con coppie sintetiche |
| C5 | Pagine web statiche su Cloudflare: `/privacy`, `/termini`, `/elimina-account` (richiesta senza app via email di supporto con verifica identità); blocco "App e supporto" in Impostazioni e link nel login | C1, F-04 | 1 g + testo legale | URL pubblici HTTPS; testo coerente con C2–C4; Spotify, FCM, Supabase, Cloudflare dichiarati; titolare del trattamento indicato | URL funzionanti. Testo approvato dal fondatore |
| C6 | Data safety, classificazione contenuti, pubblico 18+, categoria Lifestyle, dichiarazione DSA, accesso revisore | C2, C4, C5 | 0,5 g + fondatore | Ogni dato dichiarato ha un riferimento al codice (tabella nel report sicurezza) | Bozza nel repo, compilazione in Console dal fondatore |

**Fase D — Accesso per tester e revisore**

| ID | Attività | Dipende da | Stima | Criteri di accettazione | Evidenza |
|---|---|---|---|---|---|
| D1 | Rendere #189 pronta per la produzione: flag esplicito al posto della costante staging, policy password lato server, SMTP con modelli in italiano, limiti di frequenza, decisione CAPTCHA, accettazione termini e dichiarazione 18+ | A2, C5, F-05 | 2–3 g | In produzione: nuova email → verifica → login → crea coppia → invito → ingresso partner; recupero password funzionante da Android; messaggi generici anti-enumerazione | Prova su telefono. **Autorizzazione modifica Auth produzione** |
| D2 | Coppia demo sintetica **già accoppiata** in produzione per il revisore Play, con procedura di reset ed esclusa da ogni cancellazione | D1 o creazione manuale | 0,5 g | Il revisore entra e vede le 4 tab popolate con dati sintetici | Credenziali in Console (mai nel repo) |

**Fase E — Qualità minima per il rilascio**

| ID | Attività | Dipende da | Stima | Criteri di accettazione |
|---|---|---|---|---|
| E5 | Protocollo fisico notifiche (6.3), T0–T4, T6, T7 sull'APK di staging dal commit mergiato | A2 | 2–3 h fondatore | Tutti PASS con screenshot in #181 |
| E3 | Correzioni piccole: CSS blocco app (M-01), `[hidden]` in Impostazioni (M-06), mesiversario (M-08), contrasto pulsanti (M-07, con approvazione visiva) | — | 1 g | Test di invarianza blocco app verde; righe nascoste invisibili; test sul mesiversario; contrasto ≥ 4,5:1 |

### 6.2 P1 — Prima della produzione

| ID | Attività | Stima | Criteri di accettazione |
|---|---|---|---|
| E1 | Suite completa in CI (PostgreSQL 17, Playwright) con `tests/KNOWN_FAILURES.json` che può solo diminuire | 0,5 g | Fallisce su ogni nuovo errore e su ogni test della lista che torna verde |
| E2 | Branch protection su `main` con check obbligatori (azione del fondatore su GitHub) | XS | `protected:true`; una PR senza check non si può mergiare |
| E4 | Telemetria minima: `onerror`/`unhandledrejection` verso una tabella Supabase senza contenuti privati, avvisi quote Supabase, Play vitals | 1–2 g | Errore provocato visibile in tabella senza dati personali; Data safety aggiornata |
| E6 | QA su dispositivo (matrice 6.4) | 1 g fondatore | Nessun P0/P1 aperto |
| E7 | Kit store: grafica 1024×500, almeno 4 screenshot con coppia sintetica, descrizioni in italiano | 1 g | Approvato dal fondatore |
| P1-ci | Rigenerare `MIGRATION_CUTOFF.json`; controllo automatico del BUILD_ID (M-04); decidere il destino della migrazione V3 (applicare o togliere da `main`) | 0,5 g | Test f2a/f2c verdi; test che fallisce se i file runtime cambiano senza nuovo BUILD_ID |
| P1-sec | Revoca dei privilegi larghi (M-10) su staging prima; protezione password compromesse se il piano lo permette | 1 g | Test di invarianza: 0 TRUNCATE per ruoli client |
| P1-ops | Runbook di ripristino e prova di restore; procedura per richieste privacy (export, separazione, cancellazione) entro 30 giorni | 1 g | Runbook nel repo; prova di restore registrata |
| P1-repo | Repository privato o accettazione esplicita; anteprime Cloudflare dei branch non più collegate al Supabase di produzione | XS | Decisione registrata |

### 6.3 Protocollo fisico notifiche (estratto, da eseguire sull'APK di staging `com.usapp.us.staging`)

Coppie sintetiche A{a1,a2} e B{b1,b2} su US-STAGING; telefono P sotto test. PASS solo con screenshot.

| # | Scenario | PASS |
|---|---|---|
| T0 | Installazione, login a1, "Attiva" notifiche | Richiesta permesso solo dopo il tap; un banner generico entro 60 s |
| T1 | App in primo piano | Nessun banner di sistema; contenuto visibile in app |
| T2 | App chiusa dalle recenti | Banner generico; il tap apre l'app (con blocco se attivo) |
| T3 | Offline: a2 invia 3 eventi, P fa logout di a1 offline, poi online e login b1 | **Zero** banner di A dopo il logout |
| T4 | Logout a1 e login b1 entro 1–2 s da un invio di a2 | Zero banner dopo il tap di logout |
| T6 | Riavvio con b1 attivo, senza aprire l'app | Banner generico dopo l'avvio |
| T7 | b1 disattiva le notifiche (anche offline) | Nessun banner |

T5 (Doze), T8 (canali) e T9 (aggiornamento sopra versione precedente) sono utili ma non bloccanti.

### 6.4 Matrice minima QA su dispositivo

Due telefoni (lo Xiaomi del fondatore e un secondo produttore), build firmata da Play (traccia interna): avvio a freddo, login e logout, cambio account, le quattro tab con coppia nuova e coppia popolata, fotocamera, microfono, posizione negata e concessa, notifiche (6.3), widget, blocco biometrico, tasto Indietro, tastiera sui campi, carattere di sistema al 130% e 200%, TalkBack sulle schermate di login e Impostazioni, rete lenta e offline.

### 6.5 P2 — Dopo la 1.0

PR #180 (settimana reale); esportazione in app; separazione/unpair self-service; matrice JWT Storage live; vault di #190; iOS e APNs con avviso generico; R8; controllo versione minima; SRI/CSP e cache media della PWA; riscrittura dei 38 test obsoleti; notifiche con testo per categoria o apertura diretta del contenuto; ritocchi di accessibilità minori; etichette in inglese.

---

## 7. Piano di parallelizzazione senza conflitti

Regola: una corsia = un branch = un proprietario dei file elencati. Il **BUILD_ID** viene aggiornato da ogni PR runtime al momento del rebase e le PR runtime si mergiano una alla volta, nell'ordine sotto.

| Corsia | Attività | File di proprietà | Può partire subito? |
|---|---|---|---|
| 1 Notifiche | A1, A4, A2 | `notifications.js`, `android/` (manifest incluso), `native-plugins/us-push-support`, `supabase/functions/_shared` | Sì |
| 2 Pipeline Play | B1, B3 | `.github/workflows/android-*`, `android/app/build.gradle`, `scripts/build-*` | Sì (B2 dopo il merge di A2, perché tocca il manifest) |
| 3 Ciclo di vita DB | C3, C4 | nuove migrazioni, nuova Edge function, `settings.js` | Dopo C1 (decisione) |
| 4 Posizione | C2 | funzioni posizione in `app.js`, migrazione `couple_locations`, testo privacy in `settings.js` | Sì; la modifica a `settings.js` passa alla corsia 3 se sono attive insieme |
| 5 Pagine legali | C5 | nuova cartella pagine statiche in `cloudflare/` | Sì (bozze), testo finale dopo C1 |
| 6 Auth pubblica | D1 | `public-auth.js`, `index.html` (blocco auth), `config.toml` | Dopo il merge di A2 |
| 7 Qualità | E1, E3, P1-ci | `tests/`, nuovo workflow, `app-lock.css`, `top-chrome.css`, `styles.css`, `settings.css` | Sì |

Ordine dei merge: corsia 1 → 7 (CSS e CI) → 2 → 4 → 3 → 6. Ogni migrazione SQL passa prima da staging con autorizzazione separata.

---

## 8. Operazioni minime che richiedono il fondatore

1. **Decisioni da scrivere in `DECISIONS.md`:** Policy A semplificata, tempi di cancellazione e conservazione, export e separazione su richiesta, testo generico delle notifiche Android (M-03), posizione approssimata.
2. **Google Play Console:** creare o confermare l'account (personale o organizzazione), verifica identità, dichiarazione DSA, creazione dell'app `com.usapp.us` (non modificabile dopo).
3. **Firma:** [Decisa il 2026-10-13: Play App Signing con chiave generata da Google + chiave di upload dedicata.] Scelta raccomandata = chiave generata da Play + nuova chiave di upload; i fondatori reinstallano una volta l'app sideloaded (i dati sul server restano). Creare e custodire la chiave di upload; aggiungere il segreto GitHub (nessun agente tocca i valori).
4. **Supabase:** decidere il passaggio a un piano con backup per la produzione e firmare il DPA; scegliere il provider SMTP e il dominio mittente.
5. **Pagine legali:** approvare i testi di privacy, termini e cancellazione; scegliere un'email di supporto; eventuale revisione legale.
6. **Autorizzazioni puntuali:** merge di ogni PR; SQL su staging e poi produzione (C2, C3, C4); modifica Auth di produzione (D1); lettura dei bundle Edge (A3).
7. **Prove su telefono:** protocollo 6.3 e matrice 6.4.
8. **Tester:** reclutare almeno 12 tester per 14 giorni consecutivi se l'account è personale.
9. **GitHub:** attivare la branch protection su `main`; decidere se rendere privato il repository.
10. **Pubblicazione:** approvare scheda, screenshot e percentuali del rilascio graduale.

---

## 9. Sequenza di rilascio

**Gate 0 — Pronto per test interno**
- A1–A5 completate; B1 e B2 completate; firma decisa; app creata in Console.
- Informativa privacy pubblicata (C5 almeno in versione iniziale).
- Coppia demo o account creati a mano per il team.

**Traccia di test interno** (fondatori e pochi intimi): AAB firmato da `main` dopo il merge di #187, mai una build senza `UsGuardedMessagingService`. Esecuzione di 6.3 sulla build Play e della matrice 6.4. Lettura del rapporto pre-lancio di Play.

**Gate 1 — Pronto per test chiuso**
- C1–C6 completate e verificate su staging (cancellazione inclusa).
- Posizione minimizzata in produzione; microfono funzionante.
- D1 (o account creati a mano) e D2 pronti; E3 e E5 passati.
- Supabase con backup decisi; contatto di supporto attivo.

**Test chiuso**: almeno 12 tester iscritti per 14 giorni consecutivi (se l'account è personale), coppie reali con consenso, nessun dato reale negli screenshot. Si raccolgono crash, problemi di accesso e richieste privacy. Ogni incidente privacy ferma il test.

**Gate 2 — Pronto per produzione**
- Registrazione pubblica in produzione (D1) con SMTP e protezioni.
- Cancellazione eseguita almeno una volta end-to-end su staging e prova a vuoto in produzione.
- E1, E2, E4, P1-ops completate; Policy A ratificata; Data safety e scheda finali.

**Produzione**: richiesta di accesso alla produzione, rilascio graduale con soglie di stop (crash, incidenti privacy, errori di accesso) e procedura di rollback. Mai riportare i mittenti Edge al formato vecchio una volta che esistono token nativi.

---

## 10. Primo sprint esecutivo proposto

**Obiettivo:** chiudere la deriva delle notifiche, avere la pipeline Play e le decisioni del fondatore, senza toccare la produzione.

**Prima attività da eseguire:** **A1 + A4 → A2**: congelare i deploy da `main`, trovare la causa del test di ri-registrazione push, poi portare la PR #187 a uno stato mergiabile (rebase, BUILD_ID, canale, revisione di sicurezza). Tutto il resto del lato Android dipende da questo.

| Corsia | Attività dello sprint | Esito atteso |
|---|---|---|
| 1 Notifiche | A1, A4, A2 (fino alla richiesta di merge) | #187 pronta al merge con revisione |
| 2 Pipeline | B1 (in attesa della decisione firma per l'upload), B3 | AAB di prova generato in CI |
| 4 Posizione | C2 su branch e test PGlite | PR draft pronta per lo staging |
| 5 Pagine legali | C5 in bozza | Bozze di privacy, termini, cancellazione da approvare |
| 7 Qualità | E1, E3, P1-ci | Suite completa in CI con lista che può solo diminuire; correzioni piccole |
| Fondatore | C1, decisione firma, account Play, piano Supabase e SMTP, branch protection | Decisioni registrate |

Fuori dallo sprint: SQL di produzione, merge senza autorizzazione, deploy, modifiche ai segreti, pubblicazione.

---

## Appendice — Evidenze

- Suite su `main` `9de2073`: `node --test` → tests 1783, pass 1723, fail 54, cancelled 0, skipped 6 (durata 421,8 s). Classificazione: 2 reali (blocco app CSS; ri-registrazione push a freddo), 3 deriva del registro migrazioni, 11 dipendenti dall'ambiente (gare inviti MC2, richiedono PostgreSQL 17), 38 obsoleti. Il confronto con la baseline documentata (40 fallimenti, 111 saltati) non è diretto, perché qui girano anche i test browser.
- Check delle PR: #180 9/9 verdi (10/10); #187 6/6 verdi (11/10); #189 13/13 verdi (11/10); #190 1 rosso, solo Cloudflare `us-staging-s31` (script mancante sul branch).
- Ultima esecuzione CI su codice di `main`: `0682a9b` (PR #179), 7/7 verdi; i merge successivi sono solo documentali.
- I report specialistici completi e la revisione indipendente sono conservati fuori dal repository pubblico, nei file del progetto, perché contengono dettagli di sicurezza.
