# US — Recupero del keystore interno Android

Stato: procedura pronta, **mai eseguita**. Serve quando l'unica copia del keystore interno permanente è il segreto GitHub `ANDROID_SIGNING_BUNDLE_B64`. Nessuna nuova chiave viene generata: il certificato resta lo stesso, quindi gli APK già installati continuano ad aggiornarsi.

Workflow: `.github/workflows/android-signing-recovery.yml` (test: `tests/android-signing-recovery.test.js`).

## Garanzie

- Parte solo a mano (`workflow_dispatch`), solo da `main`, solo per il proprietario del repository e solo scrivendo `RECUPERA-KEYSTORE-US`. Nessun push, PR o pianificazione lo avvia.
- Nel log compaiono solo tipo del keystore, alias e impronta SHA-256 del certificato (dati pubblici). Le password sono mascherate prima dell'uso e passano a `keytool` tramite variabili, mai sulla riga di comando.
- Prima di produrre qualsiasi file, confronta il certificato del segreto con quello che firma gli APK interni attuali (`signature.txt` dell'ultimo build riuscito su `main`, oppure l'impronta passata a mano). Se non coincidono si ferma senza caricare nulla.
- Ricrea il keystore in formato PKCS12 con una nuova password casuale di 32 caratteri (uguale per archivio e chiave) e verifica che il certificato sia identico.
- L'unico artifact è `US-signing-recovery-encrypted`: un 7z AES-256 con anche i nomi dei file cifrati, aperto con la password già in possesso del fondatore (`ANDROID_INTERNAL_ARTIFACT_PASSWORD`, almeno 24 caratteri). Il workflow verifica che non si apra con una password sbagliata. Resta disponibile 1 giorno.
- Non modifica alcun segreto. A fine job cancella tutto dal runner.

## Contenuto dell'archivio

| Cartella | Contenuto |
|---|---|
| `1-backup-originale/` | keystore attuale così com'è nel segreto e il JSON del segreto, con le password vecchie (esposte nei log pubblici prima del 13/10/2026: non riusarle) |
| `2-nuovo-keystore/` | `us-internal-signing.p12` (stesso certificato, nuova password) e `NUOVO-VALORE-ANDROID_SIGNING_BUNDLE_B64.txt`, già pronto da incollare nel segreto |
| `LEGGIMI.txt` | impronta del certificato, alias e nuova password |

## Sequenza

| # | Passo | Chi |
|---|---|---|
| 1 | Merge della PR con questo workflow su `main` (GitHub avvia i `workflow_dispatch` solo dal branch predefinito) | Francesco autorizza |
| 2 | Actions › "Android signing recovery (manual, owner only)" › Run workflow su `main`, `confirm = RECUPERA-KEYSTORE-US`, impronta vuota | Francesco |
| 3 | Controllo del log: impronta uguale a quella degli APK interni, nessun valore sensibile | Claude |
| 4 | Scaricare `US-signing-recovery-encrypted`, aprirlo con 7-Zip e la password degli artifact interni, copiare la cartella su due supporti offline e la nuova password nel gestore password | Francesco |
| 5 | Settings › Secrets and variables › Actions › `ANDROID_SIGNING_BUNDLE_B64` › Update: incollare il contenuto di `NUOVO-VALORE-ANDROID_SIGNING_BUNDLE_B64.txt`. Facoltativo: creare la variabile `ANDROID_INTERNAL_CERT_SHA256` con l'impronta di `LEGGIMI.txt` (serve alla pipeline Play) | Francesco |
| 6 | Avviare un build interno e verificare che la firma abbia la stessa impronta e che le password nel log siano `***` | Claude |
| 7 | Eliminare l'artifact dalla pagina del run (scade comunque dopo 1 giorno) e il file 7z scaricato dalla cartella Download, dopo averlo copiato offline | Francesco |

Dopo il passo 5 le password vecchie, visibili nei log pubblici, non aprono più nulla di in uso. Il keystore vecchio resta nel backup offline solo come riserva.
