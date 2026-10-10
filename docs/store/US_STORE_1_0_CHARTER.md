# US Store 1.0 — Carta del prodotto e delibere

**Status:** FASE 0 / CANDIDATO DOCUMENTALE — da revisionare prima del merge
**Data:** 2026-10-10 (Europe/Rome)
**Autorità:** delibera Presidenza US Store 1.0 del 10 ottobre 2026.
**Base Git revisionata:** main @ b0c9f82d7830f13a0310016067e36da961855d23.
**Applicazione:** Google Play per primo; iOS/App Store successivamente.
**Nota:** questo documento stabilisce la direzione del rilascio, non certifica che l'app sia già pronta né autorizza deploy, SQL, pubblicazione o merge.

## 1. Decisioni presidenziali

| Delibera | Esito | Vincolo |
|---|---|---|
| D1 — Identità | APPROVATO | US è lo spazio privato di coppia, fondato sulla reciprocità. Non un social, una chat generalista o una classifica di compatibilità. |
| D2 — Contenuto V1 | APPROVATO | Quattro sezioni Oggi, Noi, Ricordi, Gioca. Consolidare quanto già integrato prima di nuovi moduli. |
| D3 — Distribuzione | APPROVATO | Android/Google Play prima; mantenere iOS compilabile, avviare distribuzione iPhone in fase successiva. |
| D4 — Modello economico | DA RIVEDERE | Nessun prezzo, US Plus, abbonamento, paywall, acquisto in-app, entitlement, posizionamento freemium o spesa commerciale approvati. Ricerca e simulazioni non sono approvazione. |
| D5 — Nuove feature | APPROVATO | Stop a nuovi giochi Arcade, Diario/Scrapbook totale, nuove mascotte/Compagni e grandi redesign fino alla V1. Eccezione per capacità indispensabili a lanciare: signup/onboarding, privacy, eliminazione/esportazione dati, sicurezza, supporto, store requirements, bugfix, performance, accessibilità. |

## 2. Promessa di prodotto

**US — Solo voi due. Un mondo vostro.**

Una persona lascia qualcosa → il partner lo scopre → risponde o agisce → nasce un esito comune che può restare nei Ricordi.

Ogni missione futura deve soddisfare almeno uno di questi test:
1. Cambia in modo verificabile l'esperienza del partner.
2. Consente un outcome autenticamente condiviso.
3. Conserva un momento significativo senza inventare dati.

Non introdurre notifiche, punti, streak, task o valute per gonfiare l'engagement.

## 3. Ambito funzionale V1 (quattro tab immutabili)

- **Oggi:** foto a tutto schermo, Countdown, Ti Penso, Lasciato per te, priorità Daily, temi/effetti già previsti entro entitlements server reali. Barra superiore completa solo su Oggi.
- **Noi:** calendario unico mese/elenco/settimana, impegni condivisi/personali, eventi, Quest e accessi secondari. La Distanza resta nascosta nella pagina ma la logica non viene cancellata. Lavagna apre la settimana inline. Non riattivare il calendario legacy come seconda superficie.
- **Ricordi:** timeline, album/carousel inline con descrizione per foto, Conserva e Rivivi esistenti, media privati e relativi permessi. Diario 3D/Scrapbook fuori V1.
- **Gioca:** Daily protagonista, Game V2, Swipe, catalogo bento, due schede Giochi/Sintonia, progression server-authoritative. Limite attuale tre sessioni: non passare a cinque senza delibera successiva. Arcade live fuori V1.
- **Fondamenta trasversali:** navigazione a quattro tab, popup coerenti, Phosphor, gesture Android Back, widget Android esistenti, Maudit esistente, privacy e accessibilità.

La qualità premium riguarda la cura dell'esperienza di base; non presuppone un abbonamento.

## 4. In scope necessario al rilascio pubblico

- Primo accesso per utenti sconosciuti senza provisioning manuale: signup/password/verification/recovery, creazione coppia e inviti sicuri, waiting e edge cases.
- Account lifecycle: chiusura/separazione coppia, cancellazione account verificabile, esportazione/accesso ai dati, regole per contenuti con proprietà condivisa.
- Notifiche e sessioni private: niente leak tra account/coppie, inclusi logout, cambio account, consegne ritardate e widget.
- Release Android aggiornata: AAB, certificati, Play App Signing, versionCode crescente, upgrade sopra APK esistenti se compatibile, QA reale.
- Documentazione store: Data Safety, permessi, privacy policy, terms, pagina Web cancellazione, contatti supporto, descrizioni IT e screenshot con dati sintetici.
- Stabilità, prestazioni, crash reporting rispettoso della privacy e accessibilità verificati su device.

## 5. Non-obiettivi finché D5 è attiva

- Rewrite del frontend (React, Tailwind, framework change) o cambio backend.
- Nuova navigazione, sezioni o home dashboard.
- Multipiattaforma simultaneo come vincolo al lancio Android.
- Nuovi minigiochi, nuove mascotte sbloccabili, nuovo Diario, altra economia di progressione.
- Nuove sottoscrizioni o servizi AI/orchestratori.
- Pricing, paywall, SDK billing o decisione su monetizzazione (D4 resta sospesa).

Una nuova feature obbligatoria per compliance richiede specifica dedicata, audit del codice e scope minimo.

## 6. Regole del cantiere

- Proprietario decisioni di prodotto, spese e rilascio: Presidenza.
- Direzione prodotto / QA di accettazione: Capocantiere.
- Implementazione e verifiche su branch isolato; review indipendente per auth, DB, privacy e store.
- Mai mergeare PR documento o codice senza approvazione esplicita; mai inferire deploy automatico sicuro da merge GitHub.
- La memoria operativa vive in docs/CURRENT_STATE.md, docs/DECISIONS.md e in questo pacchetto; le vecchie proposte non prevalgono sui lock del 10 ottobre.
- Ogni modifica deve nominare SHA base/head, test, impatto su installazioni, compatibilità e rollback.

## 7. D4 — Processo di riesame (nessuna decisione anticipata)

Il modello economico sarà discusso **dopo** evidenza da una beta:
- costi di storage, traffico e assistenza per coppia attiva;
- utilizzo ricorrente/retention e disponibilità a pagare (interviste, senza test ingannevoli);
- comparazione opzioni: gratuito, acquisto singolo, subscription per coppia, donazione/supporter, ibrido;
- privacy, fatturazione e Store Billing in ciascun scenario;
- compatibilità con accesso ai dati e storici già creati.

Output richiesto: memo decisionale con tre scenari, rischi, costi netti e proposta; Presidente decide. Nessun codice di monetizzazione finché non approvato.

## 8. Documenti operativi

- [Baseline verificata](US_STORE_1_0_BASELINE.md)
- [Piano esecutivo](US_STORE_1_0_EXECUTION.md)
- [QA e release gates](US_STORE_1_0_QUALITY_GATES.md)
- [Prima missione](../missions/us-store-s1-android-release-baseline-v1.md)
