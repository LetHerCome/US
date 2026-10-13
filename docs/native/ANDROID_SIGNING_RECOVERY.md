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

## Prova su Windows vero

Il workflow `android-signing-recovery-windows-smoke.yml` gira su `windows-latest` a ogni modifica dello strumento, con un keystore usa e getta e senza alcun segreto:
- lancia `US-recupero-keystore.cmd` tramite `cmd.exe` e Windows PowerShell, come un doppio clic;
- verifica che il certificato sia RSA 4096, per cifratura documenti, con chiave non esportabile;
- sigilla il keystore di prova con lo script del workflow;
- lo riapre dall'archivio certificati di Windows e controlla che byte e impronta coincidano;
- verifica che nulla venga cancellato prima della conferma `BACKUP FATTO`, e che la pulizia rimuova poi cartella, file scaricato e certificato.

## Sequenza

Ogni passo è separato. Il recupero vero (passo 3) parte solo con un ok specifico di Francesco.

| # | Passo | Chi |
|---|---|---|
| 1 | Nuovo checkpoint e merge della PR su `main` (GitHub avvia i `workflow_dispatch` solo dal branch predefinito). Il merge da solo non esegue nulla | Francesco autorizza |
| 2 | Scaricare `US-recupero-keystore.cmd` dal link a un **commit fisso** indicato da Claude (pulsante "Download raw file") e controllarlo prima di aprirlo: `certutil -hashfile %USERPROFILE%\Downloads\US-recupero-keystore.cmd SHA256` deve dare `e7157f572547d352443fc9c3c2156d2df29fad663ad66bb9d51f932e7777522c`. Solo se coincide: doppio clic. Se Windows lo blocca perché scaricato da Internet: tasto destro › Proprietà › Sblocca, solo per questo file verificato. Lo strumento crea il certificato, lo copia negli appunti, apre la pagina del workflow e mostra l'impronta da ritrovare nel log | Francesco |
| 3 | Nella pagina aperta: Run workflow su `main`, `confirm = RECUPERA-KEYSTORE-US`, `recipient_certificate` = Ctrl+V. **È l'estrazione vera: serve un ok specifico di Francesco** | Francesco |
| 4 | Controllo del log: "Recipient certificate SHA-256" uguale all'impronta del passo 2, certificato di firma uguale all'impronta fissata | Claude e Francesco |
| 5 | Scaricare l'artifact `US-signing-recovery-sealed` in Download e fare di nuovo doppio clic sullo strumento. Crea `US-keystore-recuperato` sul Desktop e **non cancella nulla**: il file sigillato e il certificato restano come copia di riserva. Copiare `us-internal-signing.p12` su due supporti offline e controllare ogni copia con lo SHA-256 mostrato. Salvare la password di `LEGGIMI.txt` nel gestore password, separata dalle copie | Francesco |
| 6 | Settings › Secrets and variables › Actions › `ANDROID_SIGNING_BUNDLE_B64` › Update: incollare `NUOVO-VALORE-ANDROID_SIGNING_BUNDLE_B64.txt`. Facoltativo: variabile `ANDROID_INTERNAL_CERT_SHA256` = impronta fissata (serve alla pipeline Play). Tra il passo 3 e questo nessun merge su `main` che tocchi Android, così non parte nessuna build firmata con le credenziali vecchie | Francesco |
| 7 | Avviare un build interno e verificare stessa impronta del certificato e password `***` nel log | Claude |
| 8 | Terzo doppio clic sullo strumento e conferma `BACKUP FATTO`: cancella la cartella sul Desktop, il file scaricato e il certificato di recupero. Eliminare l'artifact dalla pagina del run, se non è già scaduto | Francesco |

La password precedente del keystore va considerata compromessa. Dopo il passo 6 non è più in uso. Il cambio password non annulla però una copia del file keystore eventualmente sottratta in passato. I log hanno mostrato solo le password, mai il file, che è rimasto nel segreto.
