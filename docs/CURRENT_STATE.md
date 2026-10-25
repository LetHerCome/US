# US — Current State

**Status:** OPERATIONAL STATUS AUTHORITY
**Verified snapshot:** 2026-10-17
**Verified main SHA:** 21a7992 (PR #211 merged)

Stati: PROGETTATO / IN BRANCH / MERGED / SQL o Edge APPLICATO (staging? produzione?) / TESTATO SU DEVICE. Non confonderli. Ogni merge su `main` pubblica il web di produzione (Cloudflare Pages), ma non applica SQL né Edge. Merge, SQL di produzione, deploy Edge e pubblicazione Store richiedono ciascuno un'autorizzazione separata del founder.

## Aggiornamento 26/10 — 1.2.x, Supabase Pro, verso il test chiuso

- **Su `main`:**
  - #224 Fluidità 2;
  - #225 accoglienza, widget «La domanda di oggi» e styles.css snellito;
  - #226–#228 notifiche: lettura fallita, avvio a freddo, codice di Google e «Attiva» in 5G completato da solo.
- **Google Play, test interno:** 1.2.0 (428759), 1.2.1 (428838), 1.2.2 (428862), 1.2.3 (428905).
- **Supabase:**
  - produzione nell'organizzazione Pro, con compute Micro e backup giornalieri;
  - staging spostato in un'organizzazione gratuita («US Staging»).
- **In branch:** Accesso V1, cioè registrazione con email aperta in produzione e accesso con Google ([spec](missions/accesso-v1.md)). Serve al test chiuso su Play, per cui la Console è in preparazione.
- **Notifiche in 5G:** sul telefono del founder il token di Google arriva con il Wi-Fi e non in 5G. Con la 1.2.3 il messaggio mostra il codice vero e US completa l'attivazione da solo appena la rete risponde. La causa del rifiuto in 5G non è ancora nota.

## Aggiornamento 25/10 — rilascio 1.1.0

- **Su `main`:** #223 (`d3e5c8f`): Contenuti 1.1, Fluidità 1, Il vostro anno, Compagni. Web di produzione pubblicato con la build `us-anno-compagni-20261025-28`.
- **Produzione Supabase, SQL applicato il 25/10** (Claude, con l'OK del founder): `20261022160549_content_1_1`, `20261022170733_year_recap_v1`, `20261022213000_companions_v1`. Controllo in sola lettura dopo: domande del giorno 182 → 364; Maudit tenuto per 2 coppie su 2; `get_companions_v1` e `get_couple_year_recap` solo per `authenticated`; `couple_companion_unlocks` chiusa con RLS; nessuna tabella del check-in.
- **Google Play:** 1.1.0 (428615) nel test interno, run 40207625190, caricata dal workflow dopo l'approvazione del founder sull'ambiente `play-deploy`.
- **Il punto della settimana:** congelato, solo su staging, sul branch `claude/payred-app-comparison-b2594e` (allineato a `main` il 25/10, build `us-staging-checkin-20261025-29`).
- **Prossima missione:** Fluidità 2 ([spec](missions/fluidita-2.md)).

## Aggiornamento 22/10 (le sezioni più sotto sono rimaste al 17/10)

- **Su `main` dal 17/10:** #190 eliminazione account, #196 Esci dalla coppia / Segnala / export, #194, #214–#222. Le righe più sotto che le danno come DRAFT sono superate.
- **Produzione:** il confronto in sola lettura del 22/10 mostra che lo schema S3.2 e le Edge `delete-account`, `account-deletion-worker`, `leave-couple`, `export-user-data` e `delete-moment` sono già in produzione, con `us-account-deletion-worker` attivo.
- **Staging (US-STAGING):** riportato al livello della produzione il 22/10, con le differenze documentate ([stato staging](store/US_STAGING_STATUS.md)). È l'ambiente di prova per le nuove funzioni.
- **Missione in corso:** check-in settimanale «Il punto della settimana» ([spec](missions/weekly-checkin-v1.md)), con l'eccezione D5 del 22/10.
- **Ruoli:** dal 22/10 Claude fa architettura, review e implementazione; Codex per ora non si usa.

## Governance (invariata)

- D1/D2/D3/D5 approvati; D4 (monetizzazione) da rivedere: niente prezzi, paywall o billing.
- Prodotto V1: Oggi, Noi, Ricordi, Gioca. Sintonia dentro Gioca, calendario unico in Noi, top bar completa solo su Oggi. Freeze D5 attivo.
- N3.7 global sizing resta congelato.

## Google Play — test interno (dal 16/10)

- Account sviluppatore «Moonee Lab» (personale); app `com.usapp.us` sul canale **test interno**. Firma app generata da Google + chiave di upload dedicata (secret `ANDROID_PLAY_UPLOAD_BUNDLE_B64`).
- Release: 1.0.0 (415497), 1.0.1 (415614), 1.0.2 (415655). Il `versionCode` Play è in minuti dal 2026-01-01 UTC (#209); gli APK interni installati a mano restano in secondi epoch.
- Il founder e Bea installano da Play. Il founder conferma che le notifiche reali funzionano sulla build Play.
- Nessun test chiuso né release di produzione su Play.

## Produzione Supabase — applicato il 16/10

- **SQL** (founder, SQL Editor): `20261014180000_location_approximate_v1`, `20261014220000_content_1_0`, `20261014230000_us_1_0_locale_content_en`, `20261015000000_us_1_0_server_fixes`. `20261009100419_us_v3_oggi_looks_rewards` e `20261014210000_sintonia_event_xp_guard` erano già presenti. Controllo in sola lettura: tutte e sei `true`.
- **Edge** da `main` 21a7992 con il workflow manuale (#198): `send-web-push`, `game-v2-push`, `game-v2-push-worker`, `daily-question-push-worker`, `monthiversary-job`, `left-for-you-push-worker`, `widget-think-send`, `calendar-reminders-worker`, `delete-moment`.
- Piano **Free**, egress oltre quota (115% il 16/10); **nessun backup di produzione**. Misura dell'egress prevista 19–21/10.

## Merged su main dal 15/10 (web di produzione già pubblicato)

| PR | Cosa | Stato server / device |
|---|---|---|
| #203 | Docs al 15/10 | — |
| #204 | Suite completa su Windows: 0 fallimenti su 1998 | — |
| #198 | Deploy manuale delle Edge function da GitHub Actions | Usato il 16/10 per la produzione. |
| #205 | Egress: un URL firmato per foto, valido 24 h, riusato tra i riavvii | Solo client. Effetto sull'egress da misurare. |
| #206 | Widget Android nello stile «Due colori», anteprime senza nomi | Nelle build Play. |
| #207 → #208 | #207 (foto intera su sfondo sfocato) revertita; #208: foto di nuovo a schermo pieno, domanda lunga più piccola | Solo client. |
| #209 | `versionCode` Play in minuti dal 2026 | Usato per le release Play. |
| #210 | Oggi: la colonna in basso non esce più dallo schermo; il widget mostra «Inviato» | Solo client. |
| #211 | Notifiche Android che dicono cosa è successo: tipo `k` in allow-list nel pacchetto FCM, testo scritto dal telefono ([decisione 16/10](DECISIONS.md)) | Edge pubblicate il 16/10; notifiche reali confermate dal founder sulla build Play. iOS/APNs non provato. |

Fino al 15/10: #187 FCM con owner gate, #189 registrazione solo STAGING, #195 posizione approssimata, #197 guardia XP Sintonia, #199 contenuti 1.0 e lingua, #200–#202 redesign. Il loro SQL/Edge è ora in produzione (sopra).

## Staging (US-STAGING)

- #190 + #196: migrazioni e function applicate su staging. Testati: eliminazione account (il partner conserva i contenuti senza autore); il partner può eliminare ricordi/foto senza autore (fix sul branch di #190); layout di Segnala (fix su #196). Non ancora confermati: limite di frequenza delle segnalazioni, export dati. Da fare: test 5 (si elimina l'ultimo membro), 9 (pagina pubblica di eliminazione), 6 (esci dalla coppia).
- Il branch QA temporaneo `claude/qa-store-lifecycle` costruisce l'anteprima `us-staging-s31`: **mai fare merge**.
- Dettagli: [stato staging](store/US_STAGING_STATUS.md). Mai `db push` verso staging.

## PR e issue aperte

- [#190](https://github.com/LetHerCome/US/pull/190) DRAFT — eliminazione account (Policy A) e ciclo di vita della coppia. Su staging, non in produzione. **Blocca lo Store** (issue #183).
- [#196](https://github.com/LetHerCome/US/pull/196) DRAFT, sopra #190 — Esci dalla coppia, Segnala, export dati. Flag spenti al merge.
- [#194](https://github.com/LetHerCome/US/pull/194) DRAFT — bozze Play allineate a #190. Merge dopo #190.
- [#180](https://github.com/LetHerCome/US/pull/180) DRAFT — S2 settimana condivisa in Gioca; SQL solo su STAGING.
- [#144](https://github.com/LetHerCome/US/pull/144) e [#67](https://github.com/LetHerCome/US/pull/67) ferme — da chiudere o riprendere.
- Issue [#181](https://github.com/LetHerCome/US/issues/181) (notifiche) e [#183](https://github.com/LetHerCome/US/issues/183) (eliminazione account).

## Gate Store ancora aperti ([Quality Gates](store/US_STORE_1_0_QUALITY_GATES.md))

- Registrazione pubblica **spenta** (`PRODUCTION_SIGNUP_RELEASED = false`, `enable_signup = false`); niente SMTP.
- Nessun dominio personalizzato. Privacy e Termini pubblicati su `us-a33.pages.dev/privacy` e `/termini` (IT ed EN), da far rivedere a un consulente (D-10).
- #190/#196: finire i test su staging, poi merge, SQL ed Edge in produzione.
- Piano Free oltre quota di egress, nessun backup di produzione.
- Play: Data Safety, test chiuso. iOS/APNs non provato.

**Working plan:** [Carta Store](store/US_STORE_1_0_CHARTER.md) · [Baseline](store/US_STORE_1_0_BASELINE.md) · [Execution](store/US_STORE_1_0_EXECUTION.md) · [Quality Gates](store/US_STORE_1_0_QUALITY_GATES.md).

## Historical snapshot (2026-10-15, superseded)

- Main `ac553ad` (#202). Migrazioni di V3, #195, #197, #199 non confermate in produzione; `send-web-push` di produzione v14; nessun AAB su Play; `npm test` su Windows si bloccava (risolto da #204).

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
