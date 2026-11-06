# Android live: US di staging nell'app Android, senza APK nuovi

Dal 04/11/2026. Serve per provare US nell'app Android vera (WebView, plugin nativi, tastiera, foto) mentre si cambia il codice: si salva un file e l'app si ricarica da sola in circa 2 secondi. Il founder usa l'emulatore; Claude legge e guida la stessa app via DevTools.

## Come si usa

1. Avvia l'emulatore `US_Visual_Phone` (Android Studio › Device Manager) oppure collega il telefono via USB con il debug attivo.
2. `npm run android:live`: costruisce la parte web di **staging**, la serve su `http://localhost:5174` (solo questo PC) e fa `adb reverse` verso i dispositivi collegati. Resta acceso e ricostruisce a ogni salvataggio.
3. Solo la prima volta, o quando cambia il codice nativo: `npm run android:live:apk`. Costruisce e installa l'app **US LIVE** (`com.usapp.us.staging.live`, build di debug). Convive con US e con US STAGING.

Altri comandi di `node scripts/android-live.mjs`:

- `reload`: ricarica l'app adesso.
- `eval "<js>"`: esegue JavaScript nel WebView dell'app e stampa il risultato (Chrome DevTools Protocol).
- `shot <file.png>`: screenshot del dispositivo.

## Cosa è e cosa non è

- La parte web viene da `scripts/build-capacitor-web.mjs`, riscritta per US-STAGING con la stessa funzione dell'APK di staging firmato (`isolateStagingBuild`). La chiave pubblica di staging arriva da `US_STAGING_SUPABASE_PUBLISHABLE_KEY` oppure dal sito di staging.
- `server.url` sta solo nel `capacitor.config.json` copiato negli asset durante `apk`, e lo script lo rimette com'era alla fine. HTTP in chiaro è permesso solo verso `localhost` e `127.0.0.1` e solo nelle build di debug (`android/app/src/debug/`). Release e bundle Play non cambiano.
- **Serve ancora un APK nuovo** per codice nativo: plugin, widget, icone, manifest.
- **Non funzionano nell'app live:** le notifiche push (manca `google-services.json`). L'accesso con Google nativo probabilmente no, perché la firma di debug non è registrata (da verificare al primo accesso). L'accesso si fa una volta e poi resta nell'app.
- Gradle su questo PC: lo script imposta `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=%USERPROFILE%\gtmp`. Se Gradle non parte, va lanciato fuori dal sandbox.
