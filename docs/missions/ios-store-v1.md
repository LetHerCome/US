# Missione — iOS Store V1 (app per iPhone al livello di Android 1.4)

**Stato:** IN BRANCH (`claude/ios-store-v1-127e94`), niente su `main`, niente in produzione.
**Fonte:** richiesta del founder del 05/11/2026: portare iOS al livello della produzione Android adesso, per comprare l'account Apple Developer il prima possibile. iOS è al 36,5% in Italia e in circa una coppia su due c'è un iPhone, che oggi usa solo il sito.
**Base:** `main` `dd70e38a` (rilascio 1.4, Android nel test chiuso «Alpha»).
**Cambia D3 del 10/10** («Android prima, Apple dopo»): Apple parte adesso, senza fermare Android.
**Decisioni iOS che restano** (`DECISIONS.md`, 06/10): iOS 16.0 con Swift Package Manager; bundle e schema `com.usapp.us`; App Group riservato `group.com.usapp.us.shared`, mai i refresh token nell'App Group; dati del WebView fuori dai backup; origine `capacitor://localhost` congelata; Indietro = swipe dal bordo sinistro verso `UsNavigation.handleNativeBack()`; APNs diretto, niente Firebase su iOS; blocco solo con Face ID o Touch ID.

## 1. Audit Android ↔ iOS, funzione per funzione

Legenda: ✅ c'è · 🟡 c'è ma manca un pezzo · ❌ manca · — non esiste su iOS.
«Senza account» vuol dire che si scrive e si compila oggi in CI; «Dopo» vuol dire che serve l'account Apple (Team ID, firma, chiavi, App Store Connect).

| Funzione | Android 1.4 | iOS prima di questa missione | Cosa si fa | Quando |
|---|---|---|---|---|
| Guscio, WebView, bundle locale | `UsActivity`, `UsWebView` | ✅ `UsBridgeViewController`, bundle `capacitor://localhost` | niente | — |
| Indietro | tasto/gesto di sistema → `handleNativeBack()` | ✅ swipe dal bordo sinistro → stessa funzione, mai uscita | invariato; da provare sull'iPhone con i caroselli che partono dal bordo | prova dopo |
| Aree sicure, bordo a bordo | `SystemBars` + `--us-safe-*` | ✅ `contentInset never` + `env(safe-area-inset-*)` | invariato | — |
| Tastiera | `fix4.js` misura `visualViewport` | ✅ comportamento WebKit di serie, lo stesso della PWA su iPhone | invariato; da provare sull'iPhone (vedi §6) | prova dopo |
| Sessione fuori dai backup | `allowBackup=false` | ✅ `Library/WebKit` escluso | invariato | — |
| Blocco con biometria | `us-app-lock` | ✅ `us-app-lock` iOS (Face ID / Touch ID, Keychain `ThisDeviceOnly`) | invariato | — |
| Vibrazioni | `@capacitor/haptics` | ✅ | invariato | — |
| Notifiche | FCM v2 + controllo del proprietario sul telefono | 🟡 app pronta (`@capacitor/push-notifications`, `us-push-support` iOS, `notifications.js`, `aps-environment`); il server manda già APNs (`native-push-transport.mjs`) | manca solo la chiave APNs `.p8` nei secret di Supabase; la capability Push si accende da sola con la firma automatica | **dopo** |
| Aggiornamento dell'app | Play in-app update + versione minima (`get_app_min_version`) | 🟡 il plugin `AppUpdate` c'è, ma su iOS `openAppStore` vuole l'ID numerico dell'App Store e la ricerca su Apple fallisce finché l'app non è nello Store | `app-update.js`: ID dell'App Store passato al plugin (solo iOS lo legge), e se la ricerca fallisce la versione installata si legge da `App.getInfo()`, così il blocco sotto la versione minima vale lo stesso. Numero di build = minuti dal 2026 come il `versionCode` di Play | ora; l'ID si scrive **dopo** |
| Icona dell'app | logo senza cornice su bianco (04/11) | 🟡 logo con cornice su fondo scuro (base M15) | stessa icona di Android, dagli asset APPROVED, con l'inquadratura del launcher Android | ora |
| Icone premio (Notte, Oro, Neon) | `us-app-icon` con `activity-alias` | ❌ | plugin `us-app-icon` iOS con `setAlternateIconName`, tre set di icone composti dagli strati APPROVED | ora |
| Splash | colore dell'Atmosfera (Android 13+) | 🟡 schermata di lancio fissa `#08040E` | stesso colore della splash Android predefinita (`#26142E`, da dove parte l'animazione d'apertura) e stesso simbolo. Il colore per Atmosfera **non si può** su iOS: la schermata di lancio è statica | ora |
| Link d'invito `/invito` | App Links + `assetlinks.json` | ❌ (lo schema `com.usapp.us://open/…` c'è) | Universal Links: entitlement `applinks:www.uscouple.app`, modello di `apple-app-site-association`, tipo giusto in `cloudflare/_headers`. Il JS (`onboarding.js`) accetta già l'URL | ora; il Team ID e la pubblicazione del file **dopo** |
| Fotocamera, microfono (Lasciato per te, video) | permessi Android | ✅ frasi nell'Info.plist; Capacitor concede `getUserMedia` | invariato | — |
| Salvare una foto nella Galleria | download nel browser | ❌ **crash**: su iPhone si usa il foglio di condivisione, e «Salva immagine» chiude l'app se manca `NSPhotoLibraryAddUsageDescription` | frase aggiunta | ora |
| Posizione (distanza) | `ACCESS_COARSE_LOCATION` | ✅ `NSLocationWhenInUseUsageDescription` + precisione ridotta | invariato; da provare sull'iPhone (WKWebView può chiedere due volte) | prova dopo |
| Posto delle foto (Mappa dei Ricordi) | `us-photo-place` (GPS dell'originale) | ❌ su iPhone il posto arriva solo se il file lo conserva | plugin iOS con PHPicker + posizione del `PHAsset`; serve anche una riga in `ricordi-place.js` (file del pacchetto di correzioni dell'audit) | fase 2 |
| Batteria del partner | `UsWidgetBridge.getBatteryStatus` | ❌ (WKWebView non ha la Battery API) | arriva con il ponte widget iOS (fase W0 sotto) | fase W0 |
| Widget (8) | `us-widget-bridge` | ❌ | piano a fasi (§4) | dopo l'ok del founder |
| Accesso con Google | `us-google-signin` (Credential Manager) | — il pulsante resta nascosto da solo (manca il plugin) | decisione del founder (§3) | ora la scelta |
| Lingue | italiano e inglese | 🟡 solo italiano dichiarato | `CFBundleLocalizations` it/en e frasi dei permessi in inglese | ora |
| iPad | — | 🟡 il progetto dichiara iPhone e iPad | solo iPhone nel primo rilascio: niente screenshot iPad, l'app gira comunque su iPad | ora |
| Manifesto privacy | Sicurezza dei dati di Play | 🟡 vuoto | dati raccolti (allineati a `privacy.html`) e API con motivazione | ora |
| Pacchetto per lo Store | workflow Play con ambiente `play-deploy` | ❌ | workflow `ios-testflight.yml` (manuale, ambiente `ios-deploy`, firma automatica con la chiave API di App Store Connect, carica su TestFlight, mai l'IPA come artifact: il repo è pubblico) | ora scritto, **dopo** lanciato |

## 2. Cosa si fa in questa missione (senza account)

1. `Info.plist`: frase per salvare in Galleria, lingue it/en, frasi dei permessi in inglese (`en.lproj/InfoPlist.strings`), solo iPhone. Restano `ITSAppUsesNonExemptEncryption = false` e le frasi già presenti.
2. `PrivacyInfo.xcprivacy`: dati raccolti, nessun tracciamento, `SystemBootTime` (il blocco misura i 60 s in background con l'orologio monotono).
3. Icone: predefinita come Android 1.4; Notte, Oro e Neon come icone alternative. Tutto da `assets/ASSET_MANIFEST.json` (APPROVED), con hash in `ios/brand-assets-manifest.json`. Schermata di lancio `#26142E`.
4. `us-app-icon` iOS (`setAlternateIconName`), con la stessa interfaccia JS di Android (`get`, `set`).
5. Universal Links: entitlement, modello AASA, script che lo scrive col Team ID, intestazione in `cloudflare/_headers`.
6. Aggiornamenti: `app-update.js` neutrale (ID App Store, ripiego su `App.getInfo()`).
7. CI: `ios-native.yml` controlla i nuovi pezzi, compila, avvia l'app nel simulatore e salva uno screenshot. `ios-testflight.yml` pronto per il giorno dopo l'acquisto.
8. Testi App Store, etichette privacy, età, note per la revisione, screenshot e lista del giorno dell'acquisto: [`docs/store/ios/`](../store/ios/).

Fuori da questa missione: widget iOS (§4), posto delle foto su iOS, Sign in with Apple (se il founder la sceglie, §3), privacy aggiornata con Apple (va con il rilascio iOS).

## 3. Accesso: la regola 4.8 di Apple

Apple chiede un accesso «equivalente e rispettoso della privacy» (in pratica Sign in with Apple) **solo se** l'app offre un accesso di terzi come Google. Oggi su iPhone il pulsante Google non compare: `google-auth.js` lo mostra solo se c'è il plugin nativo, e su iOS non c'è.

| | A. Sign in with Apple + Google su iOS | B. Solo email su iOS nel primo rilascio |
|---|---|---|
| Lavoro | plugin nativo Apple (`ASAuthorizationController`) e Google iOS, provider Apple su Supabase (staging poi produzione), revoca del token Apple quando si elimina l'account (Edge `delete-account`), privacy e testi | nessun codice nuovo: è già così |
| Serve l'account Apple | sì, per provarlo (capability Sign in with Apple) | no |
| Chi ha l'account Google su Android | entra anche su iPhone con Google | su iPhone deve impostare una password con «Password dimenticata» (da provare su staging prima del rilascio) |
| Tempo | 2–3 giorni dopo l'acquisto, più la revisione | zero |

**Consiglio: B per il primo rilascio, A nel primo aggiornamento.** Si arriva prima in TestFlight e in revisione; Apple e Google arrivano insieme dopo, provati su staging. Da decidere: founder.

## 4. Widget iOS (WidgetKit) — piano a fasi

I widget sono la parte più vista nei video. Su iOS si fanno con un'estensione WidgetKit che legge un'istantanea dall'App Group `group.com.usapp.us.shared`; il token per «Ti penso» sta nel Keychain condiviso, mai nell'App Group (decisione del 06/10). Stesso contratto JS di Android (`platform.js`, `widgets.js`), così il JS non cambia.

| Fase | Cosa | Note |
|---|---|---|
| W0 | ponte `UsWidgetBridge` iOS: istantanea e foto nell'App Group, credenziale nel Keychain condiviso, batteria (`UIDevice`), `getInstalledWidgets` da WidgetKit; niente «aggiungi alla Home» (iOS non lo permette: Widget Hub mostra i passi) | accende anche la batteria del partner per chi ha l'iPhone |
| W1 | **Foto & Noi** (piccolo, medio) e **Ti penso** | Ti penso: su iOS 17+ il cuore invia dal widget (App Intent), su iOS 16 apre l'app. L'animazione del cuore sopra la Home non esiste su iOS: il widget cambia stato |
| W2 | La domanda di oggi, Distanza e batteria, Come stai | sola lettura |
| W3 | Ricordi a pila, Lasciato per te, Lavagna, Post-it | |
| W4 | widget della schermata di blocco (iOS 16+) | Ti penso e giorni insieme, piccoli |

Prima di W0 servono: l'account (App Group e Keychain condiviso si registrano sul profilo), la scelta del founder sull'ordine e un giro di disegni Pastello/Midnight in SwiftUI da approvare. Ogni fase si prova su staging prima della produzione.

**Oggi su iPhone c'è già un widget (05/11/2026, dall'audit della produzione):** Bea usa un widget Scriptable servito dalla produzione, con le funzioni `us-widget-state` v9 e `widget-scriptable-setup` v6 del 25/09 e il cron `us-widget-scriptable-state-expiry`. C'è un'installazione attiva, con il token usato il 05/11.
- Nel repository Scriptable è ritirato dal 06/10 (`tests/pre-native-cleanup.test.js`), ma il ritiro non è mai stato pubblicato. **Pubblicare `us-widget-state` dal repository spegnerebbe il widget di Bea.**
- Piano: Scriptable resta com'è finché Foto & Noi e Ti penso (W1) non sono sull'iPhone di Bea. Poi si propone al founder di spegnerlo: funzioni, cron e token, ogni passo col suo via.
- Fino ad allora nessuno tocca quelle funzioni né il cron (vale anche per il punto 7 dell'audit del 05/11).

## 5. Dopo l'acquisto dell'account

Lista passo passo: [`docs/store/ios/GIORNO_ACQUISTO.md`](../store/ios/GIORNO_ACQUISTO.md). In breve: iscrizione come persona fisica (99 $ l'anno), Team ID, bundle `com.usapp.us`, chiave API di App Store Connect nei secret GitHub, chiave APNs `.p8` nei secret di Supabase (staging poi produzione), record dell'app, ID dell'App Store nel codice, AASA pubblicato, primo TestFlight, account demo per la revisione.

## 6. Da provare sul primo iPhone (TestFlight)

- tastiera: campi in basso (risposte, Note, Lasciato per te) visibili e pagina che torna a posto alla chiusura;
- swipe Indietro: chiude i fogli e torna indietro; con i caroselli di Ricordi non deve partire due volte;
- posizione: quante volte l'iPhone chiede il permesso (WKWebView può aggiungere una seconda domanda);
- «Salva immagine» dal foglio di condivisione;
- note vocali e video in Lasciato per te;
- Face ID (blocco, rientro dopo 60 s);
- notifiche (attiva, ricevi, tocca, «Ricambia»), con il telefono bloccato e sbloccato;
- link d'invito da WhatsApp e da Note: apre l'app, non Safari;
- cambio dell'icona (iOS mostra sempre il suo avviso).

## 7. Rischi della revisione Apple

| Regola | Rischio per US | Cosa c'è |
|---|---|---|
| 4.2 (funzioni minime: «sembra un sito») | **il più alto**: US è anche un sito, e l'app usa lo stesso codice web | notifiche, Face ID, icone premio, vibrazioni, foglio di condivisione; i widget (W1) lo abbassano molto. Nelle note per la revisione si elencano le funzioni native. Se Apple respinge per 4.2, la risposta è W1 |
| 4.8 (accesso con terzi) | solo se c'è Google | strada B: niente Google su iPhone; strada A: Sign in with Apple |
| 5.1.1(v) (eliminazione dell'account) | — | Impostazioni › Privacy e dati › Elimina account, e la pagina web |
| 1.2 (contenuti degli utenti) | contenuti solo tra due persone | «Segnala un problema o un contenuto», «Esci dalla coppia», email di contatto |
| 2.3.1 (scheda fedele) | promettere i widget | la scheda iOS non li nomina finché non ci sono |
| 2.1 (completezza) | il revisore non ha un partner | coppia demo già unita, credenziali nelle note |

## 8. Gate

Ogni push sul remoto, ogni lancio di workflow, merge, migrazione, secret, acquisto e pubblicazione ha il suo via esplicito del founder. Il JS condiviso resta neutrale per piattaforma (test `ios-native-baseline`).
