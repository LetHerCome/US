# US V6 — Verifica del candidato Daily Reveal

Base: main `1251e49`, ricontrollata prima della PR. Branch: `codex/us-v6-daily-reveal`.
PR [#176 — draft](https://github.com/LetHerCome/US/pull/176); candidato codice
`4d238b8257fd042fd0882b589aa13111f68ca6a9` (il commit successivo aggiorna solo i documenti).
Stato: candidato per review; **NOT READY per release**. Nessun nuovo fail rispetto alla base.
Nessuna modifica dati, RPC, RLS, XP, budget settimanale, SW, marker o asset approvati.

## Risultati

| Verifica | Esito |
|---|---|
| Focused Daily/controller/reveal/Conserva + SQL PGlite + popup | 80 test: 72 pass, 8 skipped |
| Daily browser (Chrome locale, Playwright 1.62.1) | 6 pass, 0 skipped |
| PWA/static runtime/precache/logout/popup | 38 pass, 0 skipped |
| Browser PWA install/relaunch/offline/upgrade | 5 pass, 0 skipped |
| npm test | 1769 test: 1625 pass, 40 fail, 104 skipped |
| main isolato, stesso lockfile | 1757 test: 1614 pass, 42 fail, 101 skipped |
| Cloudflare Pages | PASS, 169 file |
| Capacitor web | PASS, 166 file, SHA256 bundle 8b790415d73f8fbc71eaa08baa392e74c8177349e32df9da48b557961f1abe97 |
| cap sync android | PASS, nessun diff Android |
| Gradle testDebugUnitTest + assembleDebug offline | BLOCKED ambiente, prima della compilazione |
| Build iOS | Non eseguibile su host Windows |
| node --check app.js / stories.js; git diff --check | PASS |

Gli 8 skipped focused sono gli harness multi-processo PostgreSQL, che richiedono
binari Linux, utente OS postgres e root. Nessuna connessione a produzione usata
per compensarli. Le prove PGlite reali verificano reveal, receipt, Conserva,
permessi e isolamento; i test JS verificano concorrenza del client.

`npm test` non è verde. Confronto per nome dei fallimenti: **zero nuovi**.
Il test M9E obsoleto pretendeva testo nel pulsante ormai nascosto: aggiornato al
contratto V5 con editor/CTA nascosti e risposte autorizzate. Il timeout P1 recovery
della base non si è riprodotto nell'ultima esecuzione (non è una correzione P1).

## Comandi riproducibili

- `npm ci --prefer-offline --no-audit --no-fund`
- `node --test tests/us-v6-daily-reveal.test.js tests/m9e-daily-question-client.test.js tests/m10-2-daily-reactions.test.js tests/m10-2-daily-reveal-states.test.js tests/m12b-4-daily-keepsake-client.test.js tests/m12b-4-daily-question-keepsakes.test.js tests/m12b-4-daily-question-keepsakes-race.test.js tests/m9e-daily-question-concurrency.test.js tests/us-vnext-m3-daily-question.test.js tests/us-reveal-calendar-clarity-v5.test.js tests/centered-popups-v1.test.js`
- `node --test tests/us-v6-daily-reveal-browser.test.js` (Playwright disponibile;
  qui runtime Codex configurato tramite PLAYWRIGHT_NODE_MODULES e Chrome locale
  tramite PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH; CI installa Playwright 1.62.1
  temporaneamente senza cambiare package/lockfile)
- `npm test`
- `npm run build:cloudflare-pages`; `npm run build:capacitor-web`; `npx cap sync android`
- `node --test tests/service-worker-static-runtime.test.js tests/us-perf-1-0-precache.test.js tests/logout-device-revocation.test.js tests/centered-popups-v1.test.js`
- `node --test tests/pwa-startup-browser.test.js` (stesso runtime browser)
- Android: `gradlew.bat --offline --no-daemon testDebugUnitTest assembleDebug`.
  JDK 21 e SDK locali presenti; fallisce nel bootstrap Gradle con
  `java.io.IOException: Unable to establish loopback connection`.
  Confermato con stacktrace e preferIPv4Stack: `UnixDomainSockets.connect:
  Invalid argument: connect`. Nessun APK installato/prodotto.

## Verifica visiva mobile

Confronto prima/dopo nello stesso browser, dati fittizi, nessuna chiamata Supabase
reale. Viewport 320×568, 390×844 e 844×390. In aggiunta, CSS nativo Android attivo
tramite le classi html us-native/us-native-android; safe area simulate 24px/20px
nella prova con risposte lunghe. Non è un test di una WebView fisica.

Verificati: popup centrale entro gli inset, nessun overflow orizzontale, un solo
pannello scrollabile, risposta lunga e stringa senza spazi, apertura dall'inizio,
chiusura/Back, nessun editor visibile nel reveal, nomi della coppia Giulia/Marco,
Conserva disponibile e raggiungibile. Prova viewport ridotto a 390×360 per la
tastiera e reduced motion. Testi e interazioni dei casi non risposto/inviato/in
attesa/ready/già visto/errore e retry sono coperti dai test runtime.

Schermate:

| Viewport | Prima | Dopo | Dopo, reveal corto |
|---|---|---|---|
| 320×568 | [prima](before/daily-320x568.png) | [dopo](after/daily-320x568.png) | [due risposte + Conserva](after/daily-short-320x568.png) |
| 390×844 | [prima](before/daily-390x844.png) | [dopo](after/daily-390x844.png) | [due risposte + Conserva](after/daily-short-390x844.png) |
| 844×390 | [prima](before/daily-844x390.png) | [dopo](after/daily-844x390.png) | [risposte e scroll](after/daily-short-844x390.png) |

Prima/dopo sul reveal corto sono disponibili anche in before/daily-short-*.png.
I file PNG sono evidenza QA, non asset distribuiti nell'app.

### Android e iOS fisici: verifiche ancora aperte

- [ ] Android WebView: apertura da Gioca e da notifica, gesture bar e navigazione
  a tre pulsanti; safe area reale, notch e rotazione durante il popup.
- [ ] Tastiera IME reale: digitazione, invio, refresh in primo piano e ritorno
  dall'app in background; bozza mantenuta, nessun doppio invio, CTA raggiungibile.
- [ ] Offline reale durante risposta/Conserva/reveal; ritorno rete, retry e
  riapertura con receipt già salvata; nessun falso successo.
- [ ] Back hardware/gesture: chiude solo il popup, ripristina scroll/focus;
  riapertura rapida durante l'animazione di chiusura.
- [ ] Android meno recente/low-end: scroll lungo, zoom testo/accessibilità e
  reduced motion del sistema senza scatti o pannello invisibile.
- [ ] iOS PWA standalone: notch/home indicator, landscape e tastiera reale.

Queste prove richiedono un candidato installabile e dispositivi. Questa missione
non autorizza installazione/aggiornamento APK, release o deploy. Non segnate PASS.

## Navigazione generale e PR #170

`tests/navigation-soak-browser.test.js`: due timeout su tile Noi nascoste
`[data-noi-open="resonance"]` e `[data-noi-open="eventi"]`. Riprodotti identici
nella copia isolata di main: nessuna regressione Daily. Il Back del popup Daily
è invece esercitato dal nuovo test browser.

PR #170 OPEN, head `b58fb08`: sovrappone app.js, index.html, styles.css e
modal-center.css. Le modifiche qui sono Daily; la PR widget/motion non viene
incorporata. Chi integra la seconda PR deve ricontrollare anche shell, motion e
cache marker; niente merge automatico.

## Review

Review indipendente read-only: due Important riprodotti e corretti con test
RED → GREEN (Conserva dopo identity switch; refresh durante save). Un Minor
sul ciclo A → B → A corretto con lock/token e regressione dedicata. Nessuna
modifica a SQL o storico, nessuna mutazione di produzione.

## Fallimenti completi della suite, già presenti su main

- **tests/f2a1-production-baseline.test.js:198:1** — F2A.1 cutoff: MIGRATION_CUTOFF.json is current and accounts for every file and ledger row
- **tests/f2a2-ledger-reconciliation.test.js:55:1** — F2A.2 guard: supabase/migrations holds only the baseline and newer; history can never run
- **tests/f2c-edge-cron-source-truth.test.js:79:1** — F2C migration: created by the CLI after the baseline, the only forward migration
- **tests/ios-media-self-healing.test.js:29:1** — foreground ripara Home avatar e Ricordi senza richiedere un nuovo login
- **tests/ios-media-self-healing.test.js:36:1** — Stories Left for You e album hanno recovery media esplicita
- **tests/m10-1d-risonanza-progress.test.js:114:1** — M10.1D: Risonanza is progress accumulated inside US — never relationship quality
- **tests/m12b-5-rivivi-living-archive.test.js:259:1** — M12B.5 story: a Moment that is the photo of a lived source says so; an Event without photo is a read-only record
- **tests/m12b-5-rivivi-living-archive.test.js:286:1** — M12B.5 media and icons: signed URLs only, private media cache untouched, Phosphor icons already in the shell
- **tests/m12c-risonanza-v2.test.js:40:1** — M12C: UI explains XP history, never relationship quality or a second score
- **tests/m2b-ui-cleanup.test.js:108:1** — i controlli delete restano espliciti e hanno target 44px
- **tests/m6b-calendar-surface.test.js:326:1** — M6B (35): Eventi/shared_events keeps rendering exactly as before; the calendar reads only calendar_entries
- **tests/m7b-da-vivere-ui.test.js:241:1** — M7B runtime: hydrateNoiIdeas è collegato alla navigazione verso Noi senza toccare la logica del Calendario
- **tests/m7c-da-vivere-calendar.test.js:163:1** — M7C UI: the entry created from an idea is always shared, and never touches shared_events
- **tests/m7c-da-vivere-calendar.test.js:190:1** — M7C UI: "quando" in Da vivere is read from calendar_entries through the Calendar module, never copied
- **tests/m9d-noi-hub.test.js:65:1** — M9D/Progression V1: Sintonia explains only server-backed meaningful actions
- **tests/maudit-interaction.test.js:286:1** — Settings: one "Maudit" switch row, device-local, correct accessible state, no explanatory copy
- **tests/n2-native-experience.test.js:21:1** — SystemBars Capacitor 8.5 usa inset CSS e contenuto chiaro sul shell scuro
- **tests/native-notifications-v1-db.test.js:78:1** — N2 migration: forward-only, after every earlier migration, fails closed
- **tests/native-notifications-v1-dispatch.test.js:81:1** — contract: every catalogue entry builds a valid, URL-free, allow-listed notification
- **tests/native-notifications-v1-dispatch.test.js:105:1** — contract: the Web Push wire format keeps exactly the keys the service worker reads
- **tests/native-notifications-v1-dispatch.test.js:114:1** — dispatch: one logical event reaches Web Push AND native devices under ONE claim
- **tests/native-notifications-v1-dispatch.test.js:136:1** — dispatch: a native-only recipient is reached; Web Push never consumes the event first
- **tests/native-notifications-v1-dispatch.test.js:148:1** — dispatch: rows of another couple are skipped
- **tests/native-notifications-v1-dispatch.test.js:159:1** — dispatch: invalid tokens are removed, transient and config failures keep the token
- **tests/native-notifications-v1-dispatch.test.js:172:1** — dispatch: a thrown transport error is transient, never deletes
- **tests/native-notifications-v1-dispatch.test.js:184:1** — dispatch: missing configuration fails safely without consuming the event
- **tests/native-notifications-v1-dispatch.test.js:206:1** — dispatch: a failed recipient query releases the claim
- **tests/native-notifications-v1-dispatch.test.js:216:1** — dispatch: Web Push 404/410 prunes the subscription exactly as before
- **tests/native-notifications-v1-dispatch.test.js:268:1** — transport config: missing or malformed secrets leave the provider not ready
- **tests/native-notifications-v1-dispatch.test.js:282:1** — transport FCM: signed RS256 assertion, HTTP v1 message, channel and data contract
- **tests/native-notifications-v1-dispatch.test.js:314:1** — transport APNs: ES256 provider token, sandbox vs production host, headers, category
- **tests/native-notifications-v1-dispatch.test.js:342:1** — transport: provider errors are classified (invalid token / transient / config / rejected)
- **tests/native-notifications-v1-native.test.js:34:1** — N2 Android: official plugin + local support plugin synced, channels match the server contract
- **tests/native-notifications-v1-native.test.js:57:1** — N2 iOS: APNs forwarding, Push entitlement, Ricambia category, environment detection
- **tests/native-notifications-v1-native.test.js:102:1** — N2 payload contract: only allow-listed targets, UUID refs, no URL ever navigates
- **tests/us-home-cleanup-noi-board-daily-move.test.js:84:1** — Daily Question: Gioca owns the visible entry; transient nudge and existing push converge on the same flow
- **tests/us-home-cleanup-noi-board-daily-move.test.js:93:1** — Home cleanup runtime is present in Cloudflare/native builds and in the atomic PWA shell
- **tests/us-perf-1-0.test.js:125:1** — perf 1.0: Settings pre-fills after Home settles, but hydrates at once when it is the launch page
- **tests/w1-3-silent-send.test.js:193:1** — MainActivity resta vuota e nessuna credential entra nello snapshot
- **tests/widget-system.test.js:435:1** — plugin: niente Supabase client o session token, storage privato non-backup, MainActivity invariata

I fallimenti native notifications includono ledger/contratti/provider già
incoerenti nella base; non sono assorbiti o mascherati nella Missione 1.
I nuovi test CI Daily sono separati dalle verifiche native generali esistenti.
