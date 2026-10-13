# US — Pipeline Google Play (AAB)

Stato: pipeline pronta in modalità di prova. La modalità di upload è bloccata finché la PR #187 non è su `main` e il fondatore non ha creato la chiave di upload. Nessuna build viene pubblicata da questa pipeline.

## Cosa fa

Workflow: `.github/workflows/android-play-bundle.yml`. Validatore: `scripts/validate-android-bundle.mjs` (test: `tests/android-play-bundle.test.js`).

1. Costruisce la web app Capacitor e sincronizza Android, verificando che il progetto committato non cambi.
2. Esegue `bundleRelease` e produce `app-release.aab`.
3. Verifica la firma (`jarsigner`), rifiuta la chiave di debug e, in modalità upload, rifiuta una chiave di upload uguale alla chiave interna permanente.
4. Esegue `bundletool validate` ed estrae il manifest finale del bundle.
5. Applica il gate US: pacchetto `com.usapp.us`, versionCode 1..2.100.000.000 e uguale a quello assegnato, versionName `x.y.z`, targetSdk ≥ 36, minSdk 26, niente `debuggable`/`testOnly`/cleartext, `allowBackup=false`, nessun permesso vietato (posizione in background, media, SMS, contatti, allarmi esatti, …), nessun componente esportato senza permesso oltre a `MainActivity`, un solo ricevitore FCM e cioè `UsGuardedMessagingService` (PR #187), web app presente, nessun keystore o `google-services.json` dentro il bundle, nessun segreto server nei file di testo, nessuna libreria nativa (pagine da 16 KB).
6. Pubblica come artifact solo i report: `aab-validation.md/json`, `permissions.txt` (base per il modulo Data safety), manifest del bundle, certificato del firmatario, info di build.

## Modalità

| Modalità | Quando | Firma | AAB scaricabile |
|---|---|---|---|
| `test` | ogni push su branch diversi da `main`, PR, o manuale | chiave usa e getta generata sul runner, mai salvata | **No.** Il repository è pubblico: un artifact è scaricabile da qualunque utente GitHub. |
| `upload` | solo manuale (`workflow_dispatch`) e solo da `main` | chiave di upload Play | Sì, solo dentro un archivio 7z cifrato AES-256 (anche i nomi dei file), conservato 7 giorni |

In modalità `upload` il job fallisce se manca un segreto, se Firebase non è configurato o se il bundle non contiene il servizio FCM protetto. Quindi **una build Play da `main` fallisce finché la PR #187 non è mergiata**: è voluto (roadmap B-03).

## Versioni

- `versionCode` = secondi Unix al momento della build (stesso schema degli APK interni). Resta sopra a ogni APK interno già installato e raggiunge il limite Play di 2.100.000.000 solo a luglio 2036. Una volta caricato su Play non si può più scendere: lo schema va considerato definitivo.
- `versionName` = input manuale `x.y.z`, predefinito `1.0.0`.
- Gradle rifiuta qualsiasi versionCode fuori da 1..2.100.000.000 per ogni build e un versionName non `x.y.z` per le build Play.
- `targetSdk` 36, `compileSdk` 36, `minSdk` 26 (`android/variables.gradle`).

## Firma: separazione delle chiavi

| Chiave | Uso | Dove sta |
|---|---|---|
| Chiave interna permanente | APK interni sideload (`android-internal-release.yml`) | segreto `ANDROID_SIGNING_BUNDLE_B64` (esistente, non toccato) |
| Chiave di upload Play | solo per caricare l'AAB su Play Console | nuovo segreto `ANDROID_PLAY_UPLOAD_BUNDLE_B64` (da creare) |
| Chiave di firma app | firma che arriva sui telefoni da Play | custodita da Google (Play App Signing) |

Gradle usa la chiave di upload solo con `US_ANDROID_PLAY_UPLOAD=true` e in quel caso non ricade mai sulla chiave interna. Build locale: in `android/keystore.properties` (ignorato da Git) aggiungere `uploadStoreFile`, `uploadStorePassword`, `uploadKeyAlias`, `uploadKeyPassword`.

## Cosa serve al fondatore

Nessuno di questi valori va scritto in chat, nel repository o in un documento condiviso.

1. **Account Google Play Console** attivo e verificato, app `com.usapp.us` creata (l'ID non si cambia più).
2. **Decisione sulla firma** (una delle due):
   - (consigliata) lasciare che Google generi la chiave di firma app: chi ha già l'APK sideload deve disinstallarlo una volta; i dati sul server restano;
   - riusare la chiave interna come chiave di firma app (esportazione PEPK da Play Console): gli APK installati si aggiornano da Play, ma la chiave interna deve restare segreta per sempre.
3. **Chiave di upload**: generarla sul proprio computer (Android Studio › Generate Signed Bundle, oppure `keytool`), conservarne una copia offline con le password, registrarla in Play Console.
4. **Tre segreti GitHub** (Settings › Secrets and variables › Actions):
   - `ANDROID_PLAY_UPLOAD_BUNDLE_B64`: base64 di un JSON `{"keystoreBase64","storePassword","keyAlias","keyPassword"}`, stesso formato del segreto interno esistente;
   - `ANDROID_PLAY_ARTIFACT_PASSWORD`: una password lunga per aprire l'archivio cifrato con l'AAB;
   - `ANDROID_GOOGLE_SERVICES_JSON_B64`: già esistente, va solo confermato per `com.usapp.us`.
5. **Avvio**: dopo il merge della PR #187, Actions › "Android Play bundle (AAB)" › Run workflow su `main` con `signing = upload`. Scaricare `US-Play-candidate-encrypted`, aprirlo con 7-Zip e la password, caricare l'AAB a mano sulla traccia di **test interno** di Play Console.

## Limiti noti

- `RECORD_AUDIO` assente dal manifest: il gate lo segnala come avviso (roadmap B2, manifest di competenza delle notifiche).
- Il workflow interno esistente (`android-internal-release.yml`) carica l'APK firmato in chiaro come artifact di un repository pubblico. Va deciso se renderlo privato, cifrarlo o fermarlo dopo il lancio su Play.
- Gli asset sorgente (`assets/source`) restano nel bundle (roadmap B3).
- L'hash di bundletool è da fissare in `BUNDLETOOL_SHA256` dopo la prima esecuzione.
