# US 1.0 — Bozza dichiarazioni Google Play

Stato: **bozza** del 13/10/2026, ricavata dal codice del repository e dall'audit `audit-2026-10-13/03-security-privacy.md`. Non è stata inviata a Play Console. Nessun comportamento non ancora implementato è dichiarato come esistente.

Marcatori:
- **[DIPENDE #190]**: vale solo dopo il merge dell'eliminazione account (PR #190). Prima di allora Play Console non accetta la scheda, perché un'app con account deve offrire l'eliminazione in app e via web.
- **[DIPENDE POSIZIONE]**: la risposta cambia secondo la decisione sulla posizione (sezione 2.3).
- **[DA DECIDERE: Francesco]**: dato che solo il fondatore può fornire.

Documenti collegati: `PRIVACY_POLICY_DRAFT.md`, `TERMS_DRAFT.md` in questa cartella; pipeline AAB in `docs/native/ANDROID_PLAY_BUNDLE.md`.

## 1. Scheda "Sicurezza dei dati"

### 1.1 Domande generali

| Domanda | Risposta | Base nel codice |
|---|---|---|
| L'app raccoglie o condivide dati utente? | Sì | Supabase Auth, tabelle di coppia, bucket `us-media` |
| Tutti i dati sono cifrati in transito? | Sì | solo HTTPS verso Supabase, FCM, Spotify; il gate AAB vieta il cleartext |
| Offrite un modo per chiedere l'eliminazione dei dati? | Sì **[DIPENDE #190]** | oggi assente; la #190 aggiunge eliminazione in app, pagina web `/elimina-account` ed email |
| Dati raccolti solo per uso effimero? | No | i contenuti restano salvati per la coppia |

Nessun SDK di analisi, pubblicità o crash reporting. Nessun permesso AD_ID (verificato dal gate AAB). Nessuna vendita di dati.

### 1.2 Tipi di dati

"Facoltativo" significa che l'utente può usare l'app senza fornire quel dato. Finalità per tutti: **Funzionalità dell'app**; per email e nome anche **Gestione dell'account**. Nessun dato è usato per pubblicità, analisi o personalizzazione di marketing.

| Categoria Play | Dato in US | Raccolto | Condiviso con terzi | Obbligatorio |
|---|---|---|---|---|
| Info personali › Indirizzo email | email di accesso (Supabase Auth) | Sì | No | Sì |
| Info personali › Nome | nome, nome della coppia, data di inizio | Sì | No | Sì |
| Posizione › Posizione precisa | coordinate dal GPS del telefono | Sì | **[DIPENDE POSIZIONE]** | No |
| Posizione › Posizione approssimativa | stessa funzione (permesso COARSE) | Sì | **[DIPENDE POSIZIONE]** | No |
| Foto e video › Foto | foto dei momenti, foto profilo, miniature | Sì | No | No |
| Foto e video › Video | video di "Lasciato per te" (i Momenti accettano solo foto) | Sì | No | No |
| File audio › Registrazioni vocali | note vocali | Sì | No | No |
| Messaggi › Altri messaggi in-app | messaggi "Lasciato per te", pensieri | Sì | No | No |
| Contenuti generati dall'utente | risposte alle domande, umori, calendario, liste, giochi | Sì | No | No |
| Attività nelle app › Interazioni | progressi, giochi giocati, streak | Sì | No | Sì |
| Attività nelle app › Cronologia ricerche in-app | testo cercato nel pannello musica | Sì | **Vedi nota Spotify** | No |
| ID dispositivo o altri ID | token FCM, ID installazione, sottoscrizione Web Push | Sì | No | No (solo se si attivano le notifiche) |

Non raccolti: dati finanziari, salute, contatti, calendario di sistema, file, SMS, cronologia web, ID pubblicitario, dati biometrici (lo sblocco con impronta resta sul telefono e non arriva al server).

Note:
- **Partner.** Quello che un utente pubblica è visibile al partner della coppia: è il funzionamento dichiarato dell'app, avviato dall'utente, e per Play non è "condivisione con terze parti".
- **Fornitori.** Supabase (database, autenticazione, file), Google Firebase Cloud Messaging (notifiche), Cloudflare (distribuzione della web app) trattano dati per nostro conto: per Play sono fornitori di servizi, non condivisione.
- **Spotify.** La ricerca brani passa dalla funzione server `spotify-search`, che invia a Spotify solo il testo cercato, senza identificativi dell'utente. Il brano scelto viene mostrato con il player incorporato di `open.spotify.com`, che il telefono carica direttamente da Spotify. Proposta: dichiarare "Cronologia ricerche in-app" come **raccolta, non condivisa** (inviata a un fornitore per eseguire la funzione richiesta). Se il consulente legale preferisce la lettura prudente, va segnata anche come condivisa. **[DA DECIDERE: Francesco, con D-10]**

### 1.3 Eliminazione **[DIPENDE #190]**

Testi allineati all'implementazione della #190 (`docs/store/US_S3_2_ACCOUNT_DELETION_V1.md` §8 sul suo branch). Se la #190 cambia prima del merge, la scheda segue la #190, non questo documento.
- Gli utenti possono chiedere l'eliminazione: Sì, in app (Impostazioni › Privacy e dati › Elimina account), via web (`https://[DOMINIO]/elimina-account`, raggiungibile senza login) e via email.
- Nessun periodo per annullare: eliminazione immediata dopo password e conferma, completamento entro 30 giorni.
- Dati che restano e perché: con la Policy A i contenuti condivisi con il partner restano a lui, senza nome dell'autore, perché fanno parte della sua storia; una ricevuta tecnica senza contenuti resta per 12 mesi, per dimostrare l'avvenuta eliminazione.
- Copia dei propri dati: su richiesta via email, entro 30 giorni.
- Non scrivere "tutti i dati vengono eliminati".

URL per Play Console (campo "Link per eliminare l'account"): `https://[DOMINIO]/elimina-account` **[DA DECIDERE: Francesco, dominio pubblico]**.

## 2. Problemi da risolvere prima di inviare la scheda

### 2.1 Eliminazione account
Bloccante: senza la #190 su `main` e nell'AAB, la risposta "Sì" alla domanda sull'eliminazione sarebbe falsa.

### 2.2 Dominio pubblico
Nel repository non c'è un dominio di produzione. Privacy policy, termini e pagina di eliminazione devono stare su un URL pubblico raggiungibile senza login. **[DA DECIDERE: Francesco]**

### 2.3 Posizione **[DIPENDE POSIZIONE]**
Comportamento attuale, verificato nel codice:
- `app.js` (~riga 1255) salva latitudine e longitudine con 6 decimali (circa 10 cm) a ogni aggiornamento;
- il partner legge le coordinate grezze, non solo la distanza;
- non esiste un modo per cancellare la posizione salvata;
- il testo in Impostazioni (`settings.js:552`) dice "salvata solo per la distanza tra voi", che non corrisponde al comportamento.

Con il codice attuale la dichiarazione onesta è "posizione precisa raccolta e visibile al partner". Il testo in app va corretto in ogni caso, altrimenti la divulgazione in app non coincide con la scheda.

Due varianti, scelta di Francesco:
- **A (consigliata): minimizzare.** Solo permesso `ACCESS_COARSE_LOCATION`, distanza calcolata dal server, il partner non riceve mai coordinate, spiegazione in app prima della richiesta del permesso, comando "Smetti di condividere e cancella la posizione". Richiede una modifica al codice e una migrazione (staging prima, produzione con autorizzazione). Per Play la posizione è approssimativa solo se indica un'area di almeno 3 km² (Play Help 10787469): arrotondare a 2 decimali (circa 1 km, cioè meno di 1 km²) resta posizione precisa. Si dichiara "approssimativa" solo se ciò che si raccoglie rispetta quella soglia; altrimenti si dichiara "precisa" anche con la variante A.
- **B: lasciare com'è.** Dichiarare posizione precisa, correggere il testo in Impostazioni in "La tua posizione esatta è visibile al partner", aggiungere la cancellazione. Rischio di revisione più alto.

In entrambi i casi l'app usa solo la posizione in primo piano: il gate AAB vieta `ACCESS_BACKGROUND_LOCATION`, quindi non serve il modulo per la posizione in background.

Dal 27/01/2027 (anteprima delle norme Play, Play Help 16909972): la posizione precisa è ammessa solo se quella approssimativa (o il pulsante di posizione di Android) non basta, e ogni app che chiede permessi di posizione deve compilare una dichiarazione in Play Console. Per una distanza tra partner la posizione approssimativa basta, quindi la variante B diventa difficile da difendere da quella data.

### 2.4 Permesso `INSTALL_SHORTCUT`
Lo dichiara il plugin dei widget (`native-plugins/us-widget-bridge/android/src/main/AndroidManifest.xml`) e finisce nel bundle. Resta: su HyperOS/MIUI, il sistema dell'owner, il pulsante "Aggiungi alla Home" dei widget (`requestPinAppWidget`) funziona solo se l'app ha il permesso "Scorciatoie nella schermata Home", che compare solo per le app che dichiarano `INSTALL_SHORTCUT`. È un permesso normale: non richiede dichiarazioni in Play Console e non raccoglie dati.

## 3. Altre dichiarazioni di Play Console

| Sezione | Risposta proposta | Note |
|---|---|---|
| Informativa sulla privacy | URL pubblico della `PRIVACY_POLICY_DRAFT.md` pubblicata | [DA DECIDERE: dominio] |
| Annunci | L'app **non** contiene annunci | nessun SDK pubblicitario |
| Accesso all'app | Alcune funzioni richiedono accesso: fornire **due account demo** già collegati in coppia (email + password) e istruzioni | in produzione la registrazione pubblica è chiusa (#189); senza account demo la revisione fallisce. Account da creare in produzione da Francesco ed escludere da notifiche reali (D-12) |
| Classificazione dei contenuti | vedi sezione 4 | |
| Pubblico di destinazione | **18 anni e oltre** | sezione 5 |
| App di notizie | No | |
| App per il COVID-19 | No | |
| App governativa | No | |
| Funzionalità finanziarie | Nessuna | |
| Salute | Nessuna funzione sanitaria | |
| Permessi sensibili | Nessun modulo richiesto: niente posizione in background, SMS, chiamate, accesso a tutti i file, allarmi esatti | verificato dal gate AAB |
| ID pubblicità | L'app non usa l'ID pubblicità | niente AD_ID nel bundle |
| Contatto sviluppatore | email di supporto **[DA DECIDERE: Francesco, D-11]**, sito web facoltativo | l'email è pubblica sulla scheda dello store |
| Prezzo | Gratuita, nessun acquisto in app | |
| Categoria | Lifestyle (alternativa: Social) | |

## 4. Questionario classificazione contenuti (IARC)

Categoria del questionario: **Social o comunicazione** (l'app serve a comunicare tra due persone).

| Domanda | Risposta |
|---|---|
| Violenza, sangue, paura | No |
| Contenuti sessuali o nudità creati dallo sviluppatore | No |
| Linguaggio volgare creato dallo sviluppatore | No |
| Sostanze controllate, alcol, tabacco | No |
| Gioco d'azzardo simulato o reale | No |
| Gli utenti possono interagire o scambiarsi contenuti | **Sì** (solo con il partner della coppia, non con estranei) |
| Condivide la posizione dell'utente con altri utenti | **Sì** [DIPENDE POSIZIONE: con la variante A è "solo distanza"; se il partner non vede la posizione la risposta diventa No] |
| Acquisti digitali | No |
| Contenuti non moderati generati dagli utenti visibili a estranei | No: i contenuti sono visibili solo alla coppia |
| L'app è un browser o un motore di ricerca | No |

Esito atteso: classificazione bassa con descrittore "Gli utenti interagiscono" e, se resta, "Condivide la posizione".

## 5. Pubblico di destinazione e contenuti

- Fasce di età: **solo 18+**. Motivazione: app per coppie, con posizione, foto e messaggi privati; non è pensata per minori e non si dichiara "progettata per famiglie".
- L'app potrebbe attirare involontariamente i bambini? **No.**
- Conseguenza nei termini: età minima 18 anni (vedi `TERMS_DRAFT.md`). Oggi l'app non verifica l'età all'accesso: la dichiarazione si basa sui termini e sul pubblico previsto. **[DA DECIDERE: Francesco]** se aggiungere una conferma "Ho almeno 18 anni" alla registrazione (#189).

## 6. Cosa deve fare Francesco

| # | Decisione o azione | Blocca |
|---|---|---|
| 1 | Titolare del trattamento (nome o ditta, indirizzo) e email di supporto (D-11) | privacy, termini, Play Console |
| 2 | Dominio pubblico per privacy, termini e `/elimina-account` | privacy, eliminazione |
| 3 | Posizione: variante A o B (sezione 2.3) | Data safety, rating |
| 4 | Regione e piano Supabase, durata backup (D-8) | privacy (trasferimenti e conservazione) |
| 5 | Revisione legale dei testi (D-10) | pubblicazione |
| 6 | Due account demo in produzione per i revisori Google (D-12) | accesso all'app |
| 7 | Compilare i moduli in Play Console con queste risposte, dopo il merge della #190 | pubblicazione |
