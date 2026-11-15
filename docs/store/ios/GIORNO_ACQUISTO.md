# US per iPhone — la lista del giorno dell'acquisto

Per il founder. Ogni passo dice **chi** lo fa: tu (sito Apple, GitHub, Supabase) o Claude (codice, sempre con il tuo via per push, merge e produzione). Il codice è pronto sul branch `claude/ios-store-v1-127e94` ([missione](../../missions/ios-store-v1.md)).

Tempo: circa 1–2 ore il primo giorno, più l'attesa di Apple per l'iscrizione (da qualche ora a 2 giorni).

## Prima di pagare

- **Apple ID** con l'autenticazione a due fattori attiva, nome e cognome veri.
- **Persona fisica o organizzazione?** Da persona fisica costa uguale e basta il documento, ma su App Store il venditore sarà **«Francesco Monti»**, non «Moonee Lab». Per avere «Moonee Lab» serve iscriversi come organizzazione, con una società e un numero D-U-N-S (settimane). Consiglio: persona fisica adesso.
- **Operatore commerciale (UE, DSA):** App Store Connect chiede se sei un «trader». Se vendi o venderai US Plus la risposta è sì, e nell'UE si vedranno pubblicamente indirizzo, telefono ed email. Da sentire con il commercialista insieme a Plus (D4, punto 11).

## 1. Iscrizione (tu)

1. Vai su [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll) (dal PC va bene; dall'app «Apple Developer» su un iPhone è più veloce).
2. Scegli **Individual / Persona fisica**, accetta il contratto, paga **99 $ l'anno** (addebitati in euro). Rinnovo automatico: segnalo in calendario.
3. Aspetta la mail «Welcome to the Apple Developer Program».

## 2. Team ID (tu → Claude)

1. [developer.apple.com/account](https://developer.apple.com/account) › Membership details › **Team ID** (10 caratteri, per esempio `AB12CD34EF`). Non è un segreto.
2. GitHub › repository US › Settings › Environments › **New environment** `ios-deploy`:
   - Required reviewers: tu;
   - Deployment branches: solo `main`;
   - Environment variables › `APPLE_TEAM_ID` = il Team ID.
3. Mandalo a Claude: scrive il file dei link universali con
   `node scripts/write-apple-app-site-association.mjs <TEAM ID>`
   e aggiunge `'.well-known/apple-app-site-association'` a `RUNTIME_FILES` in `scripts/build-cloudflare-pages.mjs` (il test pretende che arrivino insieme).

## 3. Contratti (tu)

[appstoreconnect.apple.com](https://appstoreconnect.apple.com) › Business: accetta il contratto per le app gratuite. «Paid Apps», dati fiscali e banca servono solo quando si vende Plus.

## 4. Identificativo dell'app (tu)

[developer.apple.com/account](https://developer.apple.com/account) › Certificates, IDs & Profiles › Identifiers › **+** › App IDs › App:
- Description: `US`
- Bundle ID: **Explicit** `app.uscouple` (fatto il 13/11/2026: `com.usapp.us` era già preso su Apple)
- Capabilities: **Push Notifications**, **Associated Domains** e **Sign in with Apple** (Enable as a primary App ID). App Groups più avanti, con i widget.

## 4b. Accesso con Apple e Google (tu, poi Supabase con il tuo via)

Il client Google per iPhone **si può creare anche oggi**, prima dell'acquisto: non chiede niente ad Apple.
1. **Google Cloud** › progetto «US Play» › API e servizi › Credenziali › Crea credenziali › ID client OAuth › tipo **iOS**, bundle ID `app.uscouple` (Team ID e App Store ID si aggiungono dopo, sono facoltativi). Mandami il client ID (`…apps.googleusercontent.com`, non è un segreto): lo metto in `ios/App/App/Info.plist`.
2. **Chiave Sign in with Apple** (dopo l'acquisto): Certificates, IDs & Profiles › Keys › **+** › nome `US Accedi con Apple`, spunta **Sign in with Apple** › Configure › App ID primario `app.uscouple` › Register. Scarica il `.p8` (**una volta sola**) e annota il Key ID. Serve al server per revocare il token quando qualcuno elimina l'account.
3. **Supabase staging, poi produzione** (Authentication › Sign In / Providers), ogni passo col tuo via:
   - **Apple:** acceso, **Client IDs** = `app.uscouple`. Le impostazioni OAuth (Services ID, chiave segreta) restano vuote: servono solo al sito, non all'app.
   - **Google:** in **Client IDs** aggiungi il client iOS dopo quello web: `<client web>,<client iOS>`. Il controllo del nonce resta acceso (US lo manda).
   - Secret delle Edge Function (quando arriva la revoca): `APPLE_SIGN_IN_KEY_ID`, `APPLE_SIGN_IN_PRIVATE_KEY` (il `.p8`); il Team ID è già `APNS_TEAM_ID`.

## 5. Chiave delle notifiche APNs (tu, poi Supabase con il tuo via)

1. Certificates, IDs & Profiles › **Keys** › **+** › nome `US APNs`, spunta **Apple Push Notifications service (APNs)**, ambiente **Sandbox & Production** › Register.
2. **Download** del file `AuthKey_XXXXXXXXXX.p8`: si scarica **una volta sola**. Tienilo in un posto sicuro (non nel repository, non in chat). Annota il **Key ID** (10 caratteri).
3. Secret delle Edge Function di Supabase (Dashboard › Edge Functions › Secrets, oppure `supabase secrets set`):
   - `APNS_KEY_ID` = il Key ID
   - `APNS_TEAM_ID` = il Team ID
   - `APNS_PRIVATE_KEY` = tutto il contenuto del file `.p8`, righe `BEGIN`/`END` comprese
   - `APNS_TOPIC` non serve (vale `app.uscouple`)

   L'app iOS di TestFlight usa la **produzione**: senza questi secret le notifiche iOS restano spente e quelle Android non cambiano. Sono un'impostazione di produzione: li metti tu, oppure Claude con il tuo via esplicito. Non serve ripubblicare le funzioni.

## 6. Chiave API di App Store Connect, per firmare dal CI (tu)

1. App Store Connect › Users and Access › **Integrations** › App Store Connect API › Team Keys › **+**:
   - nome `US GitHub`, accesso **Admin** (serve per la firma automatica nel cloud).
2. Scarica `AuthKey_YYYYYYYYYY.p8` (**una volta sola**); annota **Key ID** e **Issuer ID** (in alto nella pagina).
3. In PowerShell, nella cartella del file:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_YYYYYYYYYY.p8")) | Set-Clipboard
   ```
4. GitHub › Settings › Environments › `ios-deploy` › Environment secrets:
   - `APP_STORE_CONNECT_KEY_ID`
   - `APP_STORE_CONNECT_ISSUER_ID`
   - `APP_STORE_CONNECT_KEY_P8_B64` (quello copiato al punto 3)

## 7. Record dell'app (tu → Claude)

1. App Store Connect › App › **+** › Nuova app: piattaforma iOS, nome `US: app per coppie` (se è preso: `US – app per coppie` o `US: coppia`), lingua principale **Italiano**, bundle `app.uscouple`, SKU `us-ios-1`, accesso completo.
2. App Information › **Apple ID** (un numero di 10 cifre circa): mandalo a Claude, che lo scrive in `APP_STORE_ID` in `app-update.js` (serve al pulsante «Aggiorna» sotto la versione minima).

## 8. Primo TestFlight (tu avvii, GitHub costruisce)

Prima Claude porta il branch su `main` (con il tuo via: è anche una patch del sito, vedi [nota della patch](../PROSSIMA_PATCH_PRODUZIONE.md)).

1. GitHub › Actions › **iOS TestFlight (App Store Connect)** › Run workflow › branch `main`, versione `1.4.0`.
2. Approva il deploy nell'ambiente `ios-deploy`.
3. Dopo 15–30 minuti: App Store Connect › la tua app › **TestFlight**: la build è «In elaborazione», poi pronta. La domanda sulla crittografia non compare (l'app dichiara solo HTTPS).
4. Internal Testing › **+** gruppo «Noi» › aggiungi te; per Bea: Users and Access › invitala con il ruolo «Marketing» (vede solo TestFlight), poi aggiungila al gruppo.
5. Sul telefono: app **TestFlight** › installa US › prova la lista della [missione](../../missions/ios-store-v1.md) (§6).

Se la firma automatica del CI non riesce (succede alla prima volta con alcuni account): il log dice perché; Claude prepara la firma manuale (certificato di distribuzione creato con OpenSSL dal PC e profilo App Store nei secret). Non serve un Mac.

## 9. Link d'invito (Claude, poi il sito)

Dopo il merge del passo 2.3 Cloudflare pubblica il file. Controllo:
```bash
curl -sI https://www.uscouple.app/.well-known/apple-app-site-association
```
Deve rispondere `200` con `content-type: application/json`. Apple lo legge dalla sua copia ([app-site-association.cdn-apple.com/a/v1/www.uscouple.app](https://app-site-association.cdn-apple.com/a/v1/www.uscouple.app)), che si aggiorna entro un giorno. Attenzione: se un giorno `www.uscouple.app` reindirizza altrove (punto 8 dell'audit), questo indirizzo deve restare `200` senza reindirizzamenti.

## 10. Coppia demo per la revisione (tu, o Claude con il tuo via)

Due account nuovi in **produzione** (Apple prova l'app vera), già in coppia, con qualche contenuto: una domanda risposta, due Ricordi, un Ti penso. Mai la vostra coppia. Le credenziali vanno solo in App Store Connect › App Review Information.

## 11. Invio alla revisione (tu)

App Store Connect › la tua app › versione 1.4.0:
- testi, parole chiave, URL e screenshot: [scheda](APP_STORE_SCHEDA.md);
- App Privacy: [etichette](PRIVACY_LABELS.md);
- età: [scheda, «Età»](APP_STORE_SCHEDA.md);
- App Review Information: note e coppia demo, tuo telefono;
- build: quella di TestFlight;
- rilascio: **manuale** dopo l'approvazione;
- **Invia per la revisione**. Di solito risponde in 1–2 giorni.

## 12. Dopo l'uscita

- Versione minima iOS: `update public.app_min_version set min_version_code = <build> where platform = 'ios'` — produzione, con il tuo via, solo quando serve.
- Widget, posto delle foto, Sign in with Apple: le fasi della [missione](../../missions/ios-store-v1.md).
- Rinnovo dell'iscrizione: ogni anno; se scade, l'app sparisce dallo Store.
- Widget Scriptable di Bea: resta acceso finché i widget WidgetKit Foto & Noi e Ti penso (fase W1) non sono sul suo iPhone. Poi si spegne, col tuo via: funzioni `us-widget-state` e `widget-scriptable-setup`, cron `us-widget-scriptable-state-expiry`, token rimasti. Prima di allora non si pubblica `us-widget-state` dal repository: spegnerebbe il widget di Bea.
