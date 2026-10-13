# US — Recupero del keystore interno Android

Stato: procedura pronta, **mai eseguita**. Serve perché l'unica copia del keystore interno permanente è il segreto GitHub `ANDROID_SIGNING_BUNDLE_B64`. Nessuna nuova chiave viene generata: il certificato resta lo stesso, quindi gli APK già installati continuano ad aggiornarsi.

File: `.github/workflows/android-signing-recovery.yml`, `scripts/android-signing-recovery.sh` e lo strumento per Windows `scripts/windows/US-recupero-keystore.cmd` (un solo file, doppio clic). Test: `tests/android-signing-recovery.test.js`.

## Garanzie

- **Avvio solo manuale.** `workflow_dispatch` da `main`, solo per il proprietario del repository, solo scrivendo `RECUPERA-KEYSTORE-US`. Nessun push, PR o pianificazione lo avvia.
- **Destinatario unico.** Il risultato è sigillato con CMS (AES-256) per un certificato creato sul PC di Francesco da `US-recupero-keystore.cmd`, con chiave privata RSA 4096 **non esportabile** nell'archivio certificati di Windows. Nessuna password condivisa e nessun ripiego: senza un certificato RSA ≥ 3072 bit valido il job si ferma.
- **Stesso certificato, verificato tre volte.** Il keystore del segreto deve avere l'impronta fissata nel workflow (`f5e17f8e…eb782`, `CN=US Internal, OU=US, O=US, L=Pescara, ST=Abruzzo, C=IT`, RSA 3072, letta da apksigner nel run 38429362065). La stessa impronta deve comparire nei report di firma del run interno più recente e del più vecchio ancora disponibili su `main`. Dopo il cambio password l'impronta deve essere ancora identica.
- **Contenuto minimo.** Solo il keystore PKCS12 con la nuova password, il nuovo valore del segreto e un `LEGGIMI.txt`. Il keystore vecchio con le password esposte non viene incluso.
- **Niente in chiaro.** Nel log compaiono solo impronte, tipo e alias. Le password sono mascherate e passano a `keytool` tramite variabili. Prima dell'upload il job verifica che il file sigillato sia CMS AES-256 e che non contenga né la nuova password né il contenuto leggibile. In caso di errore non c'è nulla da caricare. L'artifact dura 1 giorno e il runner viene ripulito comunque.
- **Nessun segreto modificato** dal workflow.

Provato in locale con keystore e certificato usa e getta: recupero, sigillo e apertura con lo strumento Windows eseguito da PowerShell 7 su Linux, più 9 casi di errore. Non provati qui, perché richiedono Windows: il doppio clic sul file `.cmd`, la creazione del certificato con `New-SelfSignedCertificate` e l'apertura dall'archivio certificati di Windows.

## Sequenza

| # | Passo | Chi |
|---|---|---|
| 1 | Nuova revisione e merge della PR su `main` (GitHub avvia i `workflow_dispatch` solo dal branch predefinito) | Francesco autorizza |
| 2 | Scaricare `scripts/windows/US-recupero-keystore.cmd` da GitHub (Download raw file) e aprirlo con doppio clic. Se Windows mostra "PC protetto da Windows": Ulteriori informazioni › Esegui comunque. Crea il certificato, lo copia negli appunti, apre la pagina del workflow e mostra l'impronta da ritrovare nel log | Francesco |
| 3 | Nella pagina aperta: Run workflow su `main`, `confirm = RECUPERA-KEYSTORE-US`, `recipient_certificate` = Ctrl+V. **È l'estrazione vera: serve il suo ok esplicito** | Francesco |
| 4 | Controllo del log: "Recipient certificate SHA-256" uguale all'impronta del passo 2, certificato di firma uguale all'impronta fissata | Claude e Francesco |
| 5 | Scaricare l'artifact `US-signing-recovery-sealed` in Download e fare di nuovo doppio clic su `US-recupero-keystore.cmd`. Crea `US-keystore-recuperato` sul Desktop, poi cancella il file scaricato e il certificato di recupero. Copiare la cartella su due supporti offline e la password di `LEGGIMI.txt` nel gestore password | Francesco |
| 6 | Settings › Secrets and variables › Actions › `ANDROID_SIGNING_BUNDLE_B64` › Update: incollare `NUOVO-VALORE-ANDROID_SIGNING_BUNDLE_B64.txt`. Facoltativo: variabile `ANDROID_INTERNAL_CERT_SHA256` = impronta fissata (serve alla pipeline Play) | Francesco |
| 7 | Avviare un build interno e verificare stessa impronta e password `***` nel log | Claude |
| 8 | Eliminare l'artifact dalla pagina del run, se non è già scaduto | Francesco |

Dopo il passo 6 le password vecchie, visibili nei log pubblici, non servono più a nulla in uso. Il cambio password non annulla però una copia del file keystore eventualmente sottratta in passato. I log hanno mostrato solo le password, mai il file, che è rimasto nel segreto.
