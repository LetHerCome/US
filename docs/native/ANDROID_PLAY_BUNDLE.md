# US — Pipeline Google Play (AAB)

Stato: pipeline pronta in modalità di prova. La modalità di upload è bloccata finché la PR #187 non è su `main` e il fondatore non ha creato la chiave di upload. Nessuna build viene pubblicata da questa pipeline.

## Cosa fa

Workflow: `.github/workflows/android-play-bundle.yml`. Validatore: `scripts/validate-android-bundle.mjs` (test: `tests/android-play-bundle.test.js`).

1. Costruisce la web app Capacitor e sincronizza Android, verificando che il progetto committato non cambi.
2. Esegue `bundleRelease` e produce `app-release.aab`.
3. Verifica la firma (`jarsigner`), rifiuta la chiave di debug e, in modalità upload, rifiuta una chiave di upload uguale alla chiave interna permanente (confronto con l'impronta pubblica `ANDROID_INTERNAL_CERT_SHA256`: la chiave privata interna non viene mai aperta da questo workflow).
4. Esegue `bundletool validate` ed estrae il manifest finale del bundle.
5. Applica il gate US: pacchetto `com.usapp.us`, versionCode 1..2.100.000.000 e uguale a quello assegnato, versionName `x.y.z`, targetSdk ≥ 36, minSdk 26, niente `debuggable`/`testOnly`/cleartext, `allowBackup=false`, nessun permesso vietato (posizione in background, media, SMS, contatti, allarmi esatti, …), nessun componente esportato senza permesso oltre a `MainActivity`, un solo ricevitore FCM e cioè `UsGuardedMessagingService` (PR #187), web app presente, nessun keystore o `google-services.json` dentro il bundle, nessun segreto server (anche JWT `service_role` codificati) nei file di testo e nel codice dex, librerie native a 64 bit con segmenti ELF allineati a 16 KB (oggi solo `libdatastore_shared_counter.so` di AndroidX DataStore) e `BundleConfig` con `uncompressNativeLibraries.alignment = PAGE_ALIGNMENT_16K` (da `bundletool dump config`). Il bundle deve puntare a Supabase produzione e non deve contenere strumenti QA di staging (pannello FCM QA, tracce `qaTrace`, progetto o pacchetto US-STAGING). Se il manifest sorgente dichiara `UsGuardedMessagingService`, anche le build di prova devono avere solo quel ricevitore FCM.
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
2. **Firma (decisa il 13/10/2026):** Google Play App Signing con chiave di firma generata da Google e chiave di upload dedicata. Chi ha già l'APK interno sideload lo disinstalla una volta prima di installare da Play; i dati sul server restano.
3. **Chiave di upload**: generarla sul proprio computer (passo 6 della sequenza sotto) e conservarne una copia offline con le password. Con la firma generata da Google, Play registra come chiave di upload quella del primo AAB caricato.
4. **Tre segreti e una variabile GitHub** (Settings › Secrets and variables › Actions):
   - `ANDROID_PLAY_UPLOAD_BUNDLE_B64`: base64 di un JSON `{"keystoreBase64","storePassword","keyAlias","keyPassword"}`, stesso formato del segreto interno esistente;
   - `ANDROID_PLAY_ARTIFACT_PASSWORD`: una password di almeno 24 caratteri per aprire l'archivio cifrato con l'AAB;
   - `ANDROID_GOOGLE_SERVICES_JSON_B64`: già esistente, va solo confermato per `com.usapp.us`;
   - variabile (non segreta) `ANDROID_INTERNAL_CERT_SHA256`: l'impronta SHA-256 del certificato interno, che compare in `signature.txt` di ogni artifact `US-Android-Internal` (riga "certificate SHA-256 digest").
5. **Avvio**: dopo il merge della PR #187, Actions › "Android Play bundle (AAB)" › Run workflow su `main` con `signing = upload`. Scaricare `US-Play-candidate-encrypted`, aprirlo con 7-Zip e la password, caricare l'AAB a mano sulla traccia di **test interno** di Play Console.

## Sequenza: dal merge al primo test interno

| # | Passo | Chi | Prerequisito |
|---|---|---|---|
| 1 | Collaudo fisico T0–T7 e T9 della #187 superato | Francesco | — |
| 2 | Revert del pulsante QA temporaneo sulla #187, CI verde | Claude | 1 |
| 3 | Autorizzazione e merge della #187 su `main` | Francesco (autorizza) | 2 |
| 4 | Aggiornamento della #191 su `main`, CI verde con il controllo FCM obbligatorio, autorizzazione e merge | Claude prepara, Francesco autorizza | 3 |
| 5 | Creare l'app `com.usapp.us` in Play Console (account verificato, app gratuita) | Francesco | — |
| 6 | Generare la chiave di upload sul proprio computer, con copia offline: `keytool -genkeypair -v -keystore us-upload.jks -alias us-upload -keyalg RSA -keysize 4096 -validity 10000` | Francesco | — |
| 7 | Creare i segreti `ANDROID_PLAY_UPLOAD_BUNDLE_B64` (valore generato da `scripts/make-play-upload-secret.ps1`, che lo copia negli appunti senza mostrarlo) e `ANDROID_PLAY_ARTIFACT_PASSWORD`, e la variabile `ANDROID_INTERNAL_CERT_SHA256` | Francesco | 6 |
| 8 | Actions › "Android Play bundle (AAB)" › Run workflow su `main`, `signing = upload`, `version_name = 1.0.0` | Francesco (o Claude su richiesta) | 4, 7 |
| 9 | Controllare il report del run: deve essere tutto OK, incluso Firebase | Claude | 8 |
| 10 | Scaricare `US-Play-candidate-encrypted`, aprirlo con 7-Zip; in Play Console › Test interno › Crea release: accettare la chiave di firma generata da Google e caricare l'AAB. La chiave con cui è firmato il primo caricamento diventa la chiave di upload | Francesco | 5, 9 |
| 11 | Disinstallare l'APK interno dai telefoni di test, installare da Play, ripetere il controllo notifiche sul build Play | Francesco con istruzioni di Claude | 10 |

Play Console può chiedere di completare alcune dichiarazioni (privacy, accesso app, Data safety) prima di pubblicare anche sulla traccia interna: le bozze sono in `docs/store/play/`.

## Limiti noti

- `RECORD_AUDIO` assente dal manifest: il gate lo segnala come avviso (roadmap B2, manifest di competenza delle notifiche).
- APK interni firmati (`android-internal-release.yml`, `android-candidate-signed.yml`, `android-ui-integration-signed.yml`): finché il repository è pubblico l'APK non viene più caricato in chiaro. Viene caricato solo cifrato (7z AES-256) se esiste il segreto facoltativo `ANDROID_INTERNAL_ARTIFACT_PASSWORD` (≥ 24 caratteri), altrimenti restano solo hash, firma e info di build. Gli artifact già pubblicati prima di questa modifica restano scaricabili fino alla loro scadenza (30 giorni). Il workflow di staging della PR #187 (`s3-staging-android-qa.yml`) va protetto allo stesso modo.
- Gli asset sorgente (`assets/source`) restano nel bundle (roadmap B3).

## Prima prova reale (13/10/2026, commit `adace8c`, modo test)

Run CI 38327664779 verde: AAB di 24,8 MB, `bundletool validate` OK, firma verificata, pacchetto `com.usapp.us`, versionCode 1791851492, versionName 1.0.0, minSdk 26, targetSdk 36, niente AD_ID. Permessi del bundle: CAMERA, ACCESS_FINE/COARSE_LOCATION, POST_NOTIFICATIONS, INTERNET, ACCESS_NETWORK_STATE, VIBRATE, WAKE_LOCK, USE_BIOMETRIC, USE_FINGERPRINT, INSTALL_SHORTCUT, c2dm RECEIVE. Avvisi attesi: due ricevitori FCM standard (main senza #187), Firebase assente (build di prova), RECORD_AUDIO assente.
