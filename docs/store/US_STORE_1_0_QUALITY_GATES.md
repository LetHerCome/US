# US Store 1.0 — Quality Gates, QA e Play-readiness

**Data:** 2026-10-10
**Regola:** test CI = una fonte; non sostituisce device reale, live tenant-isolation, app store review e consenso Presidenza.
**Scope:** test e decisioni; nessuna implementazione o produzione autorizzata da questa checklist.

## Gate G0 — Baseline e tracciabilità

- [ ] Main SHA, branch feature SHA, build ID PWA, versionCode e signing fingerprint riportati nello stesso report.
- [ ] Distinzione per ogni funzione: PROGETTATA / IN BRANCH / MERGED / LIVE / TESTATA SU DEVICE.
- [ ] 40 failure di test globali individuate e classificate. Nessuna regressione nuova; i fallimenti su aree di sicurezza/boot/persistence sono blocker fino a fix o revisione formale documentata.
- [ ] Per tutte le missioni: suite mirata, npm test, Cloudflare/Capacitor builds, git diff --check, CI Android/iOS se applicabile.
- [ ] Nessun test disabilitato o escluso solo per far apparire verde il report; tutti gli skip spiegati.

## Gate G1 — Android reale / upgrade sicuro

Matrice minima: Xiaomi Android dell'owner + secondo produttore Android; PWA Android Chrome e Capacitor. Su iOS per la V1: almeno CI unsigned simulatore senza regressione.

- [ ] Firmato con chiave permanente; installazione come **update** con stesso applicationId/com.usapp.us e versionCode crescente; nessun clear-data.
- [ ] Login sessione preservato; app lock/biometria continua a funzionare dopo update e riavvio.
- [ ] Widget esistenti Ti Penso, Countdown, Noi 2x1, Foto & Noi sopravvivono, conservano ID e preferenze.
- [ ] Ti Penso: stato ready immediato dopo success, rolling 24h solo invii confermati e solo account locale; errori/duplicati/offline non incrementano.
- [ ] Foto & Noi: cambia dopo foto effettivamente dipinta in Oggi, non finge background refresh con app chiusa.
- [ ] Noi 2×1: ritratti validi o fallback, distanza attuale/ultima nota coerente, niente coordinate persistite nella UI widget, no pulsante GIOCA.
- [ ] Swipe globale tab disabilitato; Back laterale attivo; swipe giochi/carousel Ricordi ancora funzionante.
- [ ] Modal centrali: safe area, tastiera, focus/Back, scroll e chiusura; reduced motion.
- [ ] Foto Ricordi: lazy/thumbnail/album privati, scroll verticale vs foto orizzontale, performance in rete lenta.
- [ ] Device permission: fotocamera/location/push negate e riabilitate senza crash.
- [ ] Storage e cache senza leakage fra account; signout e offline/proc-kill gestiti.

## Gate G2 — Backend e isolamento coppie (BLOCCANTE)

- [ ] Due coppie sintetiche indipendenti, almeno quattro account; ogni read/write RPC applica membership server-side.
- [ ] Verificare RPC SECURITY DEFINER (grants limitati, auth.uid/membership, search_path) e advisor critici; RLS enabled senza policy può essere intenzionale, documentare.
- [ ] MC2: codici hash at-rest, scadenza, revoca, consumazione una volta, simultaneità/race e tentativi non autorizzati.
- [ ] Cross-account/local cache, foto, token widget, notification deep links isolati in logout, switch e avvio a freddo.
- [ ] FCM reale: server revoke fallito/provider unregister fallito, offline, push queued e restore network; nessun private alert di A recapitato quando dispositivo usato da B. Fino ad allora no beta multi-coppia pubblica.
- [ ] Migrazioni SQL: preflight, backup/rollback pianificato, staging, idempotenza, grant/RLS, record nel ledger e no delete di storico.
- [ ] PR #177: completamento *stessa sessione* + entrambi Daily lo stesso giorno Europe/Rome; XP/read state dal server; righe legacy non attribuite retroattivamente; UI non inventa stati.

## Gate G3 — Account lifecycle e privacy (BLOCCANTE STORE)

- [ ] Registrazione/verify/recovery completate e testate con utenti mai visti; login e invite waiting funzionano.
- [ ] Eliminazione account disponibile in app e tramite pagina pubblica Web; non deve richiedere password impossibile da ottenere; gestire conferma dell'identità e richieste secondo policy.
- [ ] Policy separazione/unpair e responsabilità dei dati di coppia esplicita: cosa può cancellare un individuo? cosa succede a messaggi/foto condivisi? Permessi server verificati.
- [ ] Export dati utente/coppia conforme alle regole dichiarate; file privati mai in URL pubblico o log.
- [ ] Privacy policy, termini, supporto, data safety/permissions coerenti con codice e SDK effettivi; nessuna promessa non implementata (e.g. E2EE).
- [ ] Registri operativi senza corpi di messaggi o token; crash/analytics privacy-preserving, consenso dove richiesto.

## Gate G4 — Premium UX (D5 freeze attiva)

- [ ] Oggi: foto/Countdown, una sola priorità, no duplicati/overlap.
- [ ] Noi: mese/elenco/settimana, + corretto, evento/owner, back, senza secondo calendario.
- [ ] Ricordi: feed con carosello inline per-foto, no video/autoplay non richiesto; upload/eliminazione rispettano permessi.
- [ ] Gioca: Giochi/Sintonia, Daily/reveal, waiting/risposta, nessuna percentuale finta, nessun XP inventato.
- [ ] Popup e bottom nav: Phosphor, touch target, contrasto e Dynamic Type/font scaling.
- [ ] Perf target *da misurare* su dispositivi di riferimento: crash-free sessions >= 99.5%; cambio tab già caldo preferibilmente <400ms; boot mediano preferibilmente <3s. Questi non sono dati misurati e non sostituiscono test qualitativi.
- [ ] Versioni PWA/cache coerenti con bundle e aggiornamento senza mescolanza asset vecchi/nuovi.

## Gate G5 — Google Play submission

- [ ] Verificare titolarità Play Console e tipo/data account; applicabilità minimo 12 tester/14 giorni.
- [ ] Confermare appId immutabile, certificato/firma di produzione ed eventuale compatibilità con APK extra-Play esistenti.
- [ ] AAB release firmato e validato, Play App Signing configurato secondo decisione firma; chiavi mai nei documenti/log.
- [ ] SDK target API >=36 al 10/10/2026, verificare requisito aggiornato prima della submission.
- [ ] Test credentials per revisore, screenshot e video solo con dati sintetici, privacy policy URL, data deletion Web URL.
- [ ] Data Safety, contenuti e permessi compilati secondo comportamento osservato, non progettato.
- [ ] Internal test, closed test come richiesto, feedback triage, prelaunch report e policy review.
- [ ] Piano staged rollout con criteri stop e rollback, monitoraggio crash e ticket privacy.

## Gate G6 — iOS successivo (non blocca Android)

- [ ] Apple Developer account/costo approvato separatamente; keychain/APNs entitlements.
- [ ] iPhone fisico con Safe Area/Face ID, Push foreground/background/killed, restore e account deletion.
- [ ] TestFlight/tester, privacy/App Store Connect, review metadata, accessibility.
- [ ] Nessun pagamento o US Plus presupposto da D4.

## Report standard per ogni missione

| Campo | Dato |
|---|---|
| Scope, branch, base SHA, HEAD SHA | Obbligatorio |
| Stato (branch/merged/live/device QA) | Obbligatorio |
| Test focused/full/bundles e confronto baseline | Obbligatorio |
| Rischi P0/P1/P2 con riproduzione | Obbligatorio |
| Dispositivi/OS, signed upgrade, versione | Se native |
| Dati e auth/tenant/permessi toccati | Sempre |
| Rollback/ripristino | Se cambia runtime o DB |
| Decisione Presidente richiesta | Merge/SQL/deploy/spese/pubblicazione separati |

### Fonti ufficiali da riconfermare vicino alla submission
- https://developer.android.com/google/play/requirements/target-sdk
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/answer/10144311
- https://developer.android.com/studio/publish/app-signing
