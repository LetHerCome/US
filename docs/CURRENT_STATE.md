# US — Current State

**Status:** OPERATIONAL STATUS AUTHORITY
**Verified snapshot:** 2026-10-15
**Verified main SHA:** ac553ad (PR #202 merged)

Stati: PROGETTATO / IN BRANCH / MERGED / SQL o Edge APPLICATO (staging? produzione?) / TESTATO SU DEVICE. Non confonderli. Ogni merge su `main` pubblica il web di produzione (Cloudflare Pages), ma non applica SQL né Edge. Merge, SQL di produzione, deploy Edge e pubblicazione Store richiedono ciascuno un'autorizzazione separata del founder.

## Governance (invariata)

- D1/D2/D3/D5 approvati; D4 (monetizzazione) da rivedere: niente prezzi, paywall o billing.
- Prodotto V1: Oggi, Noi, Ricordi, Gioca. Sintonia dentro Gioca, calendario unico in Noi, top bar completa solo su Oggi. Freeze D5 attivo.
- N3.7 global sizing resta congelato.

## Merged su main dal 10/10 (web di produzione già pubblicato)

| PR | Cosa | Stato server / device |
|---|---|---|
| #191 #192 #193 | Pipeline AAB Play con gate; recupero keystore interno Android | Nessun AAB pubblicato su Play. |
| #187 | Notifiche Android FCM data-only con owner gate (S3/P0) | Xiaomi con APK staging: T0 T2 T3 T4 T6 T7 T9 PASS (riferito dal founder, non da log). Da ritestare sulla prima build di produzione: pacchetto A già in volo dopo il login di B; registrazione FCM su rete mobile. `send-web-push` v4 solo su STAGING; produzione ancora v14. iOS/APNs non provato. Issue #181 aperta. |
| #189 | Registrazione, verifica email e recupero password **solo STAGING** | `PRODUCTION_SIGNUP_RELEASED = false`; produzione `enable_signup = false`. Mancano SMTP, URL legali (`LEGAL_URLS` vuoto) e #190 live: [checklist](store/US_S3_1_PRODUCTION_AUTH_RELEASE.md). Invio email reale su staging non certificato. |
| #195 | Posizione solo approssimata: il partner vede solo la distanza | `20261014180000_location_approximate_v1` **non applicata** (né staging né produzione, secondo la PR). Finché manca, il web mostra l'ultima distanza nota. |
| #197 | Sintonia: niente punti per eventi dello stesso giorno o retrodatati, uno al giorno | `20261014210000_sintonia_event_xp_guard` **non applicata** (né staging né produzione, secondo la PR). |
| #199 | Contenuti 1.0, lingua per persona, correzioni server | 3 migrazioni + 8 Edge function da pubblicare ([guida](store/US_1_0_LINGUA_E_CONTENUTI_SQL.md)). Il client funziona anche col server vecchio (resta in italiano). |
| #200 #201 #202 | Redesign «Due colori, un Noi», nuovo Maudit, inglese; Ricordi come il mockup; swipe sulla domanda di Oggi | Solo client. «Staging ok» del founder il 15/10 sull'anteprima `us-staging-s31`. QA su build firmata non registrata. |

CI di main su ac553ad: verde (APK firmato interno, iOS simulator, widget, motion, privacy FCM, UI polish).

## SQL ed Edge in attesa — stato in produzione da confermare dal founder

Nessuna PR o documento registra l'applicazione in produzione di queste migrazioni presenti su `main`. Considerarle **non applicate** finché il founder non conferma:

1. `20261009100419_us_v3_oggi_looks_rewards` (cosmetici V3; non applicata al 10/10)
2. `20261014180000_location_approximate_v1` (#195)
3. `20261014210000_sintonia_event_xp_guard` (#197)
4. `20261014220000_content_1_0` (#199)
5. `20261014230000_us_1_0_locale_content_en` (#199)
6. `20261015000000_us_1_0_server_fixes` (#199: sospende il cron dei promemoria calendario fino alla 1.1, revoca grant inutili)

Edge function da pubblicare dopo l'SQL (#199): `send-web-push`, `game-v2-push`, `game-v2-push-worker`, `daily-question-push-worker`, `monthiversary-job`, `delete-moment`, `left-for-you-push-worker`, `widget-think-send`.

Ordine: staging, verifica, produzione, poi Edge. Mai `db push` verso staging: il suo registro usa versioni proprie ([stato staging](store/US_STAGING_STATUS.md)).

## PR aperte

- [#198](https://github.com/LetHerCome/US/pull/198) — deploy manuale delle Edge function da GitHub Actions, con approvazione del founder. Prerequisito di #190/#196.
- [#190](https://github.com/LetHerCome/US/pull/190) DRAFT — eliminazione account (Policy A) e ciclo di vita della coppia. Non applicata a staging né produzione. **Blocca lo Store** (issue #183).
- [#196](https://github.com/LetHerCome/US/pull/196) DRAFT, sopra #190 — Esci dalla coppia, Segnala, export dati. Flag spenti al merge.
- [#194](https://github.com/LetHerCome/US/pull/194) DRAFT — bozze Play allineate a #190. Merge dopo #190.
- [#180](https://github.com/LetHerCome/US/pull/180) DRAFT, ferma dal 10/10 — S2 settimana condivisa in Gioca; SQL solo su STAGING.
- [#144](https://github.com/LetHerCome/US/pull/144) (ferma dal 7/10) e [#67](https://github.com/LetHerCome/US/pull/67) (TEMP DIFF) — da chiudere o riprendere.

## Gate Store ancora aperti ([Quality Gates](store/US_STORE_1_0_QUALITY_GATES.md))

- G0: #200 riporta 2001 test con 37 fallimenti, tutti già presenti su main (Android/Gradle, browser, registro migrazioni F2A/F2C). Il 15/10 `npm test` su Windows locale si blocca prima di finire. Triage da fare.
- G1: aggiornamento firmato della build di produzione su Xiaomi; widget e app lock dopo l'aggiornamento.
- G2: isolamento coppie con 4 account sintetici su staging; FCM A→B in volo e su rete mobile.
- G3: eliminazione account live in app e via web, Privacy/Termini pubblicati, SMTP, registrazione pubblica.
- G5: Play Console, Firebase di produzione, Data Safety, test chiuso.

**Working plan:** [Carta Store](store/US_STORE_1_0_CHARTER.md) · [Baseline](store/US_STORE_1_0_BASELINE.md) · [Execution](store/US_STORE_1_0_EXECUTION.md) · [Quality Gates](store/US_STORE_1_0_QUALITY_GATES.md).

## Historical snapshot (2026-10-10, superseded)

- Main `0682a9b` con Store S1-A (#179: widget V2 + Premium Motion). #167–#170 chiuse come superate.
- #187 era DRAFT; S2 #180 DRAFT con SQL solo su STAGING; in produzione nessuna RPC S2.
- US-STAGING raggiunge la parità di schema e passa lo smoke sintetico multi-coppia ([evidenza](store/US_STAGING_STATUS.md)).
- Suite completa: circa 40 fallimenti di base da classificare.

## Historical operating snapshot (2026-10-04, superseded for current status)

**Snapshot:** 2026-10-04  
**Production main at snapshot:** `33aef370837f152ba9d338745fdd4ec1fe5b0c58`

The Gioca plan below (Arcade, 5 sessions/week) is suspended by the D5 freeze of 2026-10-10.

### Foundation

**US 2.0 backend foundation: COMPLETE.**

Closed and merged:
- F2A.1 production capture;
- F2A.2 migration baseline;
- F2C Edge/Cron source of truth;
- Security/RLS hardening;
- F2A.3 retention/operations.

Operational retention and Left-for-You cleanup are active. Product work is the priority.

### Live product

Primary navigation:
- Oggi
- Noi
- Ricordi
- Gioca

Important live capabilities:
- email + password login;
- Oggi hero, Daily Question, calendar insight, Ti penso and Lasciato per te;
- Noi with Sintonia, Ritmo, rewards/unlocks, Quest, Calendar and Events;
- Ricordi with Moments/albums, Conservati, chapters and contextual Rivivi;
- Gioca Game V2 with Per voi, Swipe, six game families, sealed rounds/reveal and weekly custom question;
- calendar month/week, start/end time and quick presets;
- Stories and archive;
- Web Push (Native Notifications V1 — FCM/APNs through the same dispatcher — is a review candidate, not live: needs Firebase/APNs configuration and the rollout in `docs/native/NATIVE_NOTIFICATIONS_V1_ROLLOUT.md`);
- PWA + existing Capacitor/native support.

### Product focus at that time: Gioca

Decided next work:
1. Live Game Foundation + Pulse V1.
2. Then Stack Together.
3. Then Relay.
4. Then Duo Maze once the live layer is proven.
5. Separately: move questionnaire/game weekly allowance from 3 to 5.
6. Weekly content refresh and larger Gioca catalog.
7. Redesign “Crea domanda” to be obvious: write → seal → partner discovers it while playing.

Arcade does not consume the questionnaire Game V2 weekly allowance in the first live-games mission.

### Secondary follow-ups

- password recovery/change-password UX;
- Rivivi resurfacing beyond anniversary-only cases;
- simplify Noi/Sintonia presentation;
- absorb or retire the hidden Da vivere surface;
- frontend/CSS consolidation without redesign;
- future productization: remove hardcoded couple-specific assumptions and add onboarding.
