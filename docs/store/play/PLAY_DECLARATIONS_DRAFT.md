# US 1.0 — Bozza dichiarazioni Google Play

Stato: **bozza** del 13/10/2026, aggiornata il 14/10 con le decisioni di Francesco sull'audit di prodotto, ricavata dal codice del repository e dall'audit `audit-2026-10-13/03-security-privacy.md`. Non è stata inviata a Play Console. Nessun comportamento non ancora implementato è dichiarato come esistente.

Marcatori:
- **[DIPENDE #190]**: vale solo dopo il merge dell'eliminazione account (PR #190). Prima di allora Play Console non accetta la scheda, perché un'app con account deve offrire l'eliminazione in app e via web.
- **[DIPENDE #196]**: vale solo dopo il merge di Esci dalla coppia, Segnala e copia dei dati (PR #196, sopra la #190).
- **[DIPENDE POSIZIONE]**: vale solo dopo il merge della PR della posizione approssimativa (variante A, decisa da Francesco il 14/10; sezione 2.3).
- **[DA DECIDERE: Francesco]**: dato che solo il fondatore può fornire.

Documenti collegati: `PRIVACY_POLICY_DRAFT.md` e `TERMS_DRAFT.md` con le versioni inglesi `.en.md`, `STORE_LISTING_DRAFT.md` (scheda in italiano e inglese) in questa cartella; pipeline AAB in `docs/native/ANDROID_PLAY_BUNDLE.md`.

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
| Posizione › Posizione precisa | non raccolta: solo permesso COARSE, coordinate arrotondate a una cella di almeno 3 km² prima dell'invio **[DIPENDE POSIZIONE]** | No | No | — |
| Posizione › Posizione approssimativa | cella arrotondata, usata dal server per calcolare la distanza; il partner vede solo la distanza **[DIPENDE POSIZIONE]** | Sì | No | No |
| Foto e video › Foto | foto dei momenti, foto profilo, miniature | Sì | No | No |
| Foto e video › Video | video di "Lasciato per te", fino a 30 secondi o 20 MB (i Momenti accettano solo foto) | Sì | No | No |
| File audio › Registrazioni vocali | note vocali | Sì | No | No |
| Messaggi › Altri messaggi in-app | messaggi "Lasciato per te", pensieri | Sì | No | No |
| Contenuti generati dall'utente | risposte alle domande, umori, calendario, liste, giochi, quest; segnalazioni inviate dall'app: motivo e testo, lette solo dal team, cancellate 12 mesi dopo l'invio **[DIPENDE #196]** | Sì | No | No |
| Attività nelle app › Interazioni | progressi, giochi giocati, streak | Sì | No | Sì |
| Attività nelle app › Cronologia ricerche in-app | testo cercato nel pannello musica | Sì | **Vedi nota Spotify** | No |
| ID dispositivo o altri ID | token FCM, ID installazione, sottoscrizione Web Push | Sì | No | No (solo se si attivano le notifiche) |

Non raccolti: dati finanziari, salute, contatti, calendario di sistema, file, SMS, cronologia web, ID pubblicitario, dati biometrici (lo sblocco con impronta resta sul telefono e non arriva al server).

Note:
- **Semplificazioni della 1.0.** Ritmo nascosto, Confrontatevi unito a "E se…?", Da vivere dentro le Quest: nessun tipo di dato sparisce (Ritmo viene ancora calcolato, i dati di Da vivere restano sotto Quest), quindi le righe qui sopra non cambiano.
- **Partner.** Quello che un utente pubblica è visibile al partner della coppia: è il funzionamento dichiarato dell'app, avviato dall'utente, e per Play non è "condivisione con terze parti".
- **Fornitori.** Supabase (database, autenticazione, file), Google Firebase Cloud Messaging (notifiche), Cloudflare (distribuzione della web app) trattano dati per nostro conto: per Play sono fornitori di servizi, non condivisione.
- **Spotify.** La ricerca brani passa dalla funzione server `spotify-search`, che invia a Spotify solo il testo cercato, senza identificativi dell'utente. Il brano scelto viene mostrato con il player incorporato di `open.spotify.com`, che il telefono carica direttamente da Spotify. Proposta: dichiarare "Cronologia ricerche in-app" come **raccolta, non condivisa** (inviata a un fornitore per eseguire la funzione richiesta). Se il consulente legale preferisce la lettura prudente, va segnata anche come condivisa. **[DA DECIDERE: Francesco, con D-10]**

### 1.3 Eliminazione **[DIPENDE #190]**

Testi allineati all'implementazione della #190 (`docs/store/US_S3_2_ACCOUNT_DELETION_V1.md` §8 sul suo branch). Se la #190 cambia prima del merge, la scheda segue la #190, non questo documento.
- Gli utenti possono chiedere l'eliminazione: Sì, in app (Impostazioni › Privacy e dati › Elimina account), via web (`https://[DOMINIO]/elimina-account`, raggiungibile senza login) e via email.
- Nessun periodo per annullare: eliminazione immediata dopo password e conferma, completamento entro 30 giorni.
- Dati che restano e perché: con la Policy A i contenuti condivisi con il partner restano a lui, senza nome dell'autore, perché fanno parte della sua storia; una ricevuta tecnica senza contenuti resta per 12 mesi, per dimostrare l'avvenuta eliminazione.
- Copia dei propri dati: su richiesta al supporto, entro 30 giorni, inviata per email: un file JSON con i propri dati e i link alle proprie foto, validi 7 giorni (decisione 8 del 14/10, PR #196; il tasto in app arriva dopo la 1.0).
- Uscire dalla coppia (PR #196) non elimina l'account: chiude lo spazio con le stesse regole dell'eliminazione. Non va indicato come metodo di eliminazione.
- Non scrivere "tutti i dati vengono eliminati".

URL per Play Console (campo "Link per eliminare l'account"): `https://[DOMINIO]/elimina-account` **[DA DECIDERE: Francesco, dominio pubblico]**.

## 2. Problemi da risolvere prima di inviare la scheda

### 2.1 Eliminazione account
Bloccante: senza la #190 su `main` e nell'AAB, la risposta "Sì" alla domanda sull'eliminazione sarebbe falsa.

### 2.2 Dominio pubblico
Nel repository non c'è un dominio di produzione. Privacy policy, termini e pagina di eliminazione devono stare su un URL pubblico raggiungibile senza login. **[DA DECIDERE: Francesco]**

### 2.3 Posizione **[DIPENDE POSIZIONE]**
Decisione di Francesco (14/10): **variante A fatta bene**. Comportamento di `main` fino al merge della PR della posizione:
- `app.js` salva latitudine e longitudine con 6 decimali (circa 10 cm) a ogni aggiornamento;
- il partner legge le coordinate grezze, non solo la distanza;
- non esiste un modo per smettere o cancellare la posizione salvata;
- nessuna spiegazione prima del permesso; il testo in Impostazioni dice "salvata solo per la distanza tra voi", che non corrisponde.

Con la variante A, implementata nella PR della posizione:
- solo `ACCESS_COARSE_LOCATION` nel manifest (via `ACCESS_FINE_LOCATION`);
- il telefono arrotonda le coordinate a una cella di almeno 3 km² prima di inviarle, e il server le arrotonda di nuovo;
- la distanza è calcolata dal server; il partner non riceve mai coordinate e sotto i 3 km legge solo "vicini";
- spiegazione prima del permesso, con "Attiva" e "Non ora";
- in Impostazioni "Smetti e cancella": ferma la condivisione e cancella subito la posizione salvata.

Per Play la posizione è approssimativa solo se indica un'area di almeno 3 km² (Play Help 10787469): arrotondare a 2 decimali (circa 1 km, cioè meno di 1 km²) resterebbe posizione precisa. Con la cella di almeno 3 km² la dichiarazione è "posizione approssimativa, raccolta, non condivisa, facoltativa, solo funzionalità dell'app".

L'app usa solo la posizione in primo piano: il gate AAB vieta `ACCESS_BACKGROUND_LOCATION`, quindi non serve il modulo per la posizione in background.

Dal 27/01/2027 (anteprima delle norme Play, Play Help 16909972): la posizione precisa è ammessa solo se quella approssimativa (o il pulsante di posizione di Android) non basta, e ogni app che chiede permessi di posizione deve compilare una dichiarazione in Play Console. Con la variante A la dichiarazione è: posizione approssimativa, in primo piano, per mostrare la distanza tra i due partner.

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
| Permessi sensibili | Nessun modulo richiesto oggi: niente posizione in background, SMS, chiamate, accesso a tutti i file, allarmi esatti. Posizione solo approssimativa **[DIPENDE POSIZIONE]**; dal 27/01/2027 dichiarazione della posizione (sezione 2.3) | verificato dal gate AAB |
| ID pubblicità | L'app non usa l'ID pubblicità | niente AD_ID nel bundle |
| Contatto sviluppatore | email di supporto **[DA DECIDERE: Francesco, D-11]**, sito web facoltativo | l'email è pubblica sulla scheda dello store |
| Prezzo | Gratuita, nessun acquisto in app (1.0). Nella scheda non si promette "nessun abbonamento": Francesco valuterà piani mensili e annuali dopo la beta (decisione 10) | |
| Categoria | Lifestyle. Non Social né Incontri: farebbero scattare gli standard sulla sicurezza dei minori | |

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
| Condivide la posizione dell'utente con altri utenti | **No** con la variante A: il partner vede solo una distanza arrotondata, mai la posizione **[DIPENDE POSIZIONE]**. Se il consulente (D-10) preferisce la lettura prudente, Sì |
| Acquisti digitali | No |
| Contenuti non moderati generati dagli utenti visibili a estranei | No: i contenuti sono visibili solo alla coppia |
| L'app è un browser o un motore di ricerca | No |

Esito atteso: classificazione bassa con descrittore "Gli utenti interagiscono". Se un giorno arrivano domande piccanti, il questionario va rifatto.

## 5. Pubblico di destinazione e contenuti

- Fasce di età: **solo 18+**. Motivazione: app per coppie, con posizione, foto e messaggi privati; non è pensata per minori e non si dichiara "progettata per famiglie".
- L'app potrebbe attirare involontariamente i bambini? **No.**
- In Play Console attivare "Limita l'accesso ai minori".
- Conseguenza nei termini: età minima 18 anni e chiusura degli account di minori (vedi `TERMS_DRAFT.md`). Alla registrazione la spunta "Ho almeno 18 anni e accetto Termini e Privacy" (decisione 1 del 14/10: entra nella 1.0).
- Grafica dello store senza il gattino in primo piano, per non sembrare un'app per bambini.

### 5.1 Contenuti generati dagli utenti
Per prudenza Play tratta come contenuti degli utenti anche uno spazio a due. Le regole chiedono, e la 1.0 prevede:
- accettazione dei termini prima di pubblicare (spunta alla registrazione);
- "Segnala un problema o un contenuto" in Impostazioni › App e supporto, con quattro motivi e un testo libero, e una procedura scritta per il team (`docs/store/US_MODERATION_PROCEDURE.md` nella #196) per rimuovere un contenuto o sospendere un account **[DIPENDE #196]**;
- "Esci dalla coppia" in Impostazioni › Voi, che chiude subito lo spazio a due e ferma ogni condivisione tenendo l'account: è il blocco richiesto nelle conversazioni a due **[DIPENDE #196]**;
- nei termini, l'elenco di cosa è vietato (contenuti illegali, con minori, intimi condivisi senza consenso).

## 6. Cosa deve fare Francesco

| # | Decisione o azione | Blocca |
|---|---|---|
| 1 | Titolare del trattamento (nome o ditta, indirizzo) e email di supporto (D-11) | privacy, termini, Play Console |
| 2 | Dominio pubblico per privacy, termini e `/elimina-account` | privacy, eliminazione |
| 3 | ~~Posizione: variante A o B~~ Decisa il 14/10: A (sezione 2.3) | — |
| 4 | Regione Supabase (D-8). Piano: per ora gratuito e senza backup, Pro qualche settimana prima del lancio (decisione 6); allora si aggiorna la privacy sui backup | privacy (trasferimenti e conservazione) |
| 5 | Revisione legale dei testi (D-10) | pubblicazione |
| 6 | Due account demo in produzione per i revisori Google (D-12) | accesso all'app |
| 7 | Compilare i moduli in Play Console con queste risposte, dopo il merge della #190 | pubblicazione |
