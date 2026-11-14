# Missione — iOS Store V1 (app per iPhone al livello di Android 1.4)

**Stato:** IN BRANCH (`claude/ios-store-v1-127e94`), niente su `main`, niente in produzione.
**Fonte:** richiesta del founder del 05/11/2026: portare iOS al livello della produzione Android adesso, per comprare l'account Apple Developer il prima possibile. iOS è al 36,5% in Italia e in circa una coppia su due c'è un iPhone, che oggi usa solo il sito.
**Base:** `main` `dd70e38a` (rilascio 1.4, Android nel test chiuso «Alpha»).
**Cambia D3 del 10/10** («Android prima, Apple dopo»): Apple parte adesso, senza fermare Android.
**Decisioni iOS che restano** (`DECISIONS.md`, 06/10): iOS 16.0 con Swift Package Manager; schema `com.usapp.us`; bundle iOS `app.uscouple` dal 13/11 (`com.usapp.us` era preso su Apple); App Group riservato `group.app.uscouple.shared`, mai i refresh token nell'App Group; dati del WebView fuori dai backup; origine `capacitor://localhost` congelata; Indietro = swipe dal bordo sinistro verso `UsNavigation.handleNativeBack()`; APNs diretto, niente Firebase su iOS; blocco solo con Face ID o Touch ID.

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
| Widget (9 + schermata di blocco) | `us-widget-bridge` | ❌ | piano a fasi (§4) | dopo l'ok del founder |
| Accesso con Google e con Apple | `us-google-signin` (Credential Manager) | — il pulsante Google restava nascosto (mancava il plugin) | founder, 05/11: **Apple e Google** (§3). Plugin iOS Google (browser di sistema, PKCE) e Apple pronti; pulsanti e conferma da collegare | plugin ora; pulsanti col via sui file condivisi; Supabase e revoca **dopo** |
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

**Decisione del founder (05/11/2026): A, «Apple e Google».** (Il consiglio era B per il primo rilascio.)

### 3.1 Strada A: cosa è pronto e cosa manca

**Pronto sul branch (senza account):**
- `native-plugins/us-apple-signin` (nuovo, solo iOS): il foglio di Apple (`ASAuthorizationController`), nome ed email, nonce come per Google; restituisce il token, il codice monouso per il server e il nome del primo accesso. Entitlement `com.apple.developer.applesignin`.
- `native-plugins/us-google-signin` per iOS, **senza l'SDK di Google**: browser di sistema (`ASWebAuthenticationSession`), PKCE S256, `state`, lo stesso nonce; stessa interfaccia JS di Android. Il client ID iOS va in `Info.plist` (`UsGoogleIOSClientID`, vuoto finché non c'è).
- `google-auth.js`: `UsAppleAuth` accanto a `UsGoogleAuth` (accesso, conferma con lo stesso account Apple per eliminare o uscire), 18+ e Termini anche per gli account Apple. Si mostra solo dove c'è il plugin: nessun controllo di piattaforma.
- `supabase/functions/_shared/apple-sign-in.mjs`: segreto ES256, scambio del codice con il refresh token di Apple, revoca all'eliminazione (TN3194). Solo il modulo, con i test.
- Il server accetta già la conferma con Apple: l'accesso con token è `amr` «oauth», come Google.
- **Pulsanti e conferma (fatto il 05/11, col via della sessione dell'audit sui file condivisi):** «Continua con Apple» subito sotto «Continua con Google» nell'accesso e nella registrazione (`index.html`, `app.js`), bianco su fondo scuro con il logo del carattere di sistema dell'iPhone (`auth-first-run.css`, nessun asset nuovo); un account Apple conferma con Apple per eliminare o uscire (`settings.js`, `account-deletion.js`); il nome dato da Apple riempie il campo dell'onboarding (`onboarding.js`); frasi inglesi (`i18n-en.js`); la pagina pubblica di eliminazione nomina Apple (`elimina-account.html`). Il pulsante Google su iPhone compare già, ma finché manca il client iOS dice «non disponibile».

**Manca, in quest'ordine:**
1. ~~Pulsanti e conferma~~ fatto, vedi sopra.
2. **Google Cloud (founder, si può fare subito):** client OAuth di tipo iOS nel progetto «US Play», bundle `app.uscouple`; il client ID va in `Info.plist`.
3. **Supabase, prima staging poi produzione (con il via del founder):** provider Apple acceso con Client IDs `app.uscouple` (per l'app nativa non serve il segreto); provider Google con Client IDs `<web>,<iOS>` (web per primo), controllo del nonce acceso.
4. **Revoca del token (dopo l'acquisto):** chiave «Sign in with Apple» (.p8) nei secret, tabella solo service role per il refresh token (migrazione su staging), Edge che scambia il codice dopo l'accesso, `delete-account` che revoca prima di eliminare; se manca il token, il messaggio di fine eliminazione dice come togliere US da Impostazioni › Apple ID › Accedi con Apple.
5. **Privacy:** `privacy.html` IT/EN con Apple (accesso e notifiche) e la scheda App Store.
6. **Prove su TestFlight:** accesso nuovo, accesso di un account già esistente con la stessa email, «Nascondi la mia email», eliminazione dell'account (con revoca), uscita dalla coppia.

## 4. Widget iOS (WidgetKit): tutti i widget Android più la schermata di blocco

**Scopo (14/11/2026, sessione dei widget iOS):** su iPhone tutti i widget Android di US, uguali nell'aspetto e nel comportamento, più widget per la schermata di blocco. Il JS condiviso con Android non cambia: l'estensione legge la stessa istantanea v2 (`platform.js` › `normalizeWidgetSnapshot`, `UsWidgetContract.java`) e le stesse immagini che l'app prepara già (`writeWidgetPhoto`, `writeWidgetNoiPortrait` con i posti `pair`, `me`, `partner`, `memories`, `memories_wide`, `lavagna`, `lavagna_night`). I tocchi aprono gli stessi link `us://widget/<tipo>` che `widgets.js` sa già leggere.

### 4.1 Android → iPhone, widget per widget

Taglie: il 2×2 Android è il **piccolo** di iOS, il 4×2 è il **medio**, un widget allargato fino a 4×4 è il **grande**.

| Widget (classe Android) | Android | iPhone | Cosa mostra | Tocco | Differenze su iOS |
|---|---|---|---|---|---|
| Foto & Noi (`UsPhotoWidgetProvider`) | 2×2, allargabile | piccolo, medio, grande | la foto di Oggi che cambia ogni ora (adesso e le due dopo), i giorni insieme | apre la foto di Oggi | nessuna. Le tre foto diventano tre voci della timeline, come l'allarme Android. Tema chiaro: sfuma nella crema; scuro come prima |
| Ti penso (`UsThinkWidgetProvider`, `UsThinkHeartActivity`, `UsThinkWidgetActionReceiver`) | 2×2, 4×2 | piccolo, medio | solo il cuore (decisione del 02/11): vuoto, pieno dopo l'invio, attenuato mentre invia o se il widget non è collegato. Le frasi («Bea ti ha pensato · 2 min fa», «Ricambiato · adesso», «Non è partito», «Apri US per collegarlo») sono solo per VoiceOver | tutto il widget è il cuore: invia subito, in sottofondo; non collegato apre US | **iOS 17+**: il cuore è un pulsante (App Intent) che invia dal widget con lo stesso token e lo stesso `actionId` (il server scarta i doppi). **Animazione sopra la Home: impossibile su iOS** (un widget non apre finestre): il cuore fa il battito dentro il widget e passa a «Ricambiato · adesso». **iOS 16**: il tocco apre US su Ti penso (un tocco in più) |
| Distanza e batteria (`UsNoiWidgetProvider`) | 2×1, 2×2, 4×2 | piccolo, medio | distanza o «meno di 3 km», da quanto, batteria della tua persona (un giorno al massimo), le due foto tonde | apre Noi | **il 2×1 non esiste sulla Home di iOS**: lo sostituisce il rettangolare della schermata di blocco. La batteria di chi ha l'iPhone va a gradini di 5% (`UIDevice`) |
| La domanda di oggi (`UsDailyWidgetProvider`) | 4×2 (anche 2×2) | medio, piccolo | la domanda, a chi tocca, mai le risposte | apre la domanda | nessuna |
| Lasciato per te (`UsMessageWidgetProvider`) | 2×2, 4×2 | piccolo, medio | busta chiusa, solo tipo e ora | apre il Lasciato | nessuna |
| Ricordi a pila (`UsMemoriesWidgetProvider`) | 2×2, 4×2 | piccolo, medio | la pila disegnata dall'app, «Un anno fa» solo quel giorno, titolo, quanti | apre Ricordi | nessuna |
| Come stai (`UsStatusWidgetProvider`) | 4×2 (anche 2×2) | medio, piccolo | l'emoji di tutti e due, la parola nella forma scelta, da quando (12 ore) | apre Come stai in Oggi | nessuna |
| Lavagna (`UsLavagnaWidgetProvider`) | 2×2, allargabile | piccolo, medio, grande | l'ultimo disegno (chiaro e scuro), chi e quando | apre la lavagna | nessuna |
| Post-it (`UsPostitWidgetProvider`) | 2×2, allargabile | piccolo, medio | l'ultimo post-it sulla sua carta, chi, «+N» | apre la bacheca | nessuna |
| Giorni insieme (`UsDaysWidgetProvider`) | nascosto | — | — | — | **non si porta**: su Android resta solo perché i widget già messi non si rompano; su iPhone non ce ne sono |

Uguale per tutti:
- **Aggiornamento:** come Android. Quando l'app scrive l'istantanea si ridisegnano tutti; in mezzo una timeline già calcolata (mezzanotte di Roma, cambio della foto ogni ora, fine di «Ricambiato», scadenza di Come stai e della batteria). Nessuna rete in sottofondo; l'unica chiamata è l'invio di Ti penso.
- **Temi:** chiaro → Pastello, scuro → Midnight (`colorScheme`). iOS 18 «colorato» e iOS 26 «trasparente»: i disegni restano leggibili e le foto restano a colori.
- **Caratteri:** Fraunces e Figtree stanno nell'estensione. Su iOS i testi sono testo vero nel carattere dell'app, senza le immagini di testo di `UsWidgetArt`.
- **StandBy (iPhone in carica, orizzontale):** usa i widget **piccoli della Home**, non quelli della schermata di blocco; di notte iOS li tinge di rosso.
- **iPad:** l'app è solo per iPhone (`TARGETED_DEVICE_FAMILY = 1`) e sull'iPad gira in modalità iPhone: lì i widget non ci sono.
- **«Aggiungi alla Home» da Impostazioni › Widget:** iOS non lo permette. Il ponte risponde `supported: false` e Widget Hub dice già «Questo telefono non aggiunge widget da solo. Usa i widget della Home.» (nessun cambio). Alternativa da approvare: i passi iOS (tieni premuto sulla Home › Modifica › Aggiungi widget › US), con un piccolo cambio neutro del JS (il testo arriva dal ponte).
- **Settimana guidata:** il passo «widget sulla Home» compare su iPhone da solo appena c'è il ponte (`hasWidgetBridge`), e si conta con `getInstalledWidgets` (WidgetKit sa quali widget di US sono messi).

### 4.2 Schermata di blocco (iOS 16+: rotondo, rettangolare, sopra l'ora)

La schermata di blocco la vede chiunque: niente foto e niente testi privati. Nomi e frasi si segnano «privati» (`privacySensitive`): a telefono bloccato iOS li copre, e compaiono quando Face ID riconosce chi lo tiene.

| Proposta | Forme | Cosa mostra da bloccato |
|---|---|---|
| A. Ti penso | rotondo | il cuore, pieno quando ti ha pensato e non hai ricambiato. iOS 17+: il tocco invia; iOS 16: apre US |
| B. Giorni insieme | rotondo, sopra l'ora | «195 giorni», «♡ 195 giorni insieme» |
| C. Ultimo Ti penso ricevuto | rettangolare | «Ti ha pensato · 10 min fa»; il nome solo dopo Face ID |
| D. La domanda di oggi | rotondo, rettangolare | da fare / tocca a te / fatta; mai la domanda |
| E. Distanza e batteria | rotondo, rettangolare | anello della batteria della tua persona; «12 km · 45%» |
| F. Come stai | rotondo | l'emoji della tua persona (in un solo colore) |
| G. Lasciato per te | rotondo | la busta, con un punto se ce n'è uno chiuso |
| H. Sfida della settimana | rotondo | **serve un dato nuovo nell'istantanea (JS condiviso)**: dopo, con un via a parte |
| Controllo «Ti penso» (iOS 18+) | Centro di Controllo, i due pulsanti in basso della schermata di blocco, tasto Azione | un tocco invia, con lo stesso App Intent |

### 4.3 Fasi

| Fase | Cosa | Note |
|---|---|---|
| W0 | ponte `UsWidgetBridge` iOS (stessi metodi di Android): istantanea validata in Swift come `UsWidgetContract.java`, foto nell'App Group, token di Ti penso nel Keychain condiviso, batteria (`UIDevice`), `getInstalledWidgets`; estensione `app.uscouple.widgets`; firma e CI | accende anche la batteria del partner per chi ha l'iPhone |
| W1 | **Foto & Noi** e **Ti penso** | poi, quando sono sull'iPhone di Bea, si propone lo spegnimento del widget Scriptable |
| W2 | La domanda di oggi, Distanza e batteria, Come stai | |
| W3 | Ricordi a pila, Lasciato per te, Lavagna, Post-it | |
| W4 | schermata di blocco (§4.2) e Controllo «Ti penso» | |

**Scelte del founder (14/11/2026, `DECISIONS.md`):** quest'ordine; sulla schermata di blocco A, B, E, F, G e il Controllo (non C, D, H per ora); il battito del cuore dentro il widget; i passi per iPhone in Impostazioni › Widget. Prima del codice: i disegni SwiftUI Pastello/Midnight approvati (tavola del 14/11, in attesa: https://claude.ai/artifact/7r3PaBCzW1AP1sgqruCo71). Ogni fase: PR verde in `ios-native.yml`, build TestFlight pronta da lanciare; niente lancio né merge senza il via del founder, e non prima che Bea confermi la build 1.5.0 (457497).

### 4.4 Firma: cosa fa la CI e cosa deve fare il founder

`scripts/ios-asc-signing.mjs` crea a ogni giro un certificato Apple Distribution e un profilo App Store; si estende a due profili (app e `app.uscouple.widgets`), firma a mano tutti e due i target ed esporta con tutti e due. Il Keychain condiviso non va registrato (i profili App Store lo includono). **L'API di Apple non crea l'App Group e non lo assegna agli identificativi**: va fatto una volta a mano, su developer.apple.com › Certificates, Identifiers & Profiles › Identifiers:
1. «+» › **App Groups** › Continue › descrizione «US condiviso», identificativo `group.app.uscouple.shared` › Register.
2. «+» › **App IDs** › App › descrizione «US Widgets», Bundle ID «Explicit» `app.uscouple.widgets`, spunta **App Groups** › Continue › Register.
3. Apri `app.uscouple` › accanto ad App Groups «Configure» › spunta `group.app.uscouple.shared` › Continue › Save (Apple avvisa che i profili vanno rifatti: la CI li rifà a ogni giro).
4. Stessa cosa su `app.uscouple.widgets`.

### 4.5 Il widget Scriptable di Bea

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

Prima di portare iOS su staging: unire o ribasare su `mission/us-store-s3-1-public-auth-staging-20261011`, dove c'è già il pacchetto dell'audit del 05/11 (sessione dell'audit, 05/11: meno conflitti in `index.html`, `app.js`, `settings.js`, `i18n-en.js`).


Ogni push sul remoto, ogni lancio di workflow, merge, migrazione, secret, acquisto e pubblicazione ha il suo via esplicito del founder. Il JS condiviso resta neutrale per piattaforma (test `ios-native-baseline`).
