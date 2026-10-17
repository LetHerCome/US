# Informativa sulla privacy di US — BOZZA

> Bozza aggiornata il 17/10/2026, da far rivedere a un consulente legale (D-10) prima della pubblicazione. I campi tra parentesi quadre vanno compilati da Francesco. Eliminazione account (PR #190), uscita dalla coppia, segnalazioni e copia dei dati (PR #196) sono su `main` dal 17/10; la posizione approssimativa (variante A) dal 14/10 (PR #195). Le sezioni su eliminazione, uscita, segnalazioni e copia valgono quando i loro interruttori sono accesi in produzione. Versione inglese: `PRIVACY_POLICY_DRAFT.en.md`, da tenere allineata.

Ultimo aggiornamento: [DATA]

## 1. Chi siamo
US è un'app per coppie. Titolare del trattamento: [NOME O DITTA], [INDIRIZZO], email moonee.team@gmail.com.

## 2. Quali dati trattiamo e perché

| Dati | Perché | Base giuridica |
|---|---|---|
| Email e password (la password non viene mai conservata in chiaro: il fornitore di autenticazione ne salva solo un hash) | creare e proteggere il tuo account | esecuzione del contratto |
| Nome, nome della coppia, data di inizio della relazione | far funzionare lo spazio di coppia | esecuzione del contratto |
| Foto, note vocali, messaggi, risposte, umori, eventi del calendario, liste, partite; video solo in "Lasciato per te", fino a 30 secondi o 20 MB | mostrarli al tuo partner, che è lo scopo dell'app | esecuzione del contratto |
| Posizione approssimativa di questo telefono, solo se attivi la funzione e solo mentre l'app è aperta | calcolare la distanza tra voi | consenso, revocabile in qualsiasi momento dall'app (Impostazioni › Posizione › Smetti e cancella) o dalle impostazioni del telefono |
| Token di notifica del dispositivo e identificativo di installazione | inviarti le notifiche che hai attivato | esecuzione del contratto |
| Progressi e attività nell'app (ad esempio giochi completati) | far funzionare le funzioni dell'app | esecuzione del contratto |
| Testo cercato nella ricerca musicale | trovare il brano su Spotify | esecuzione del contratto |
| Segnalazioni che ci invii: il motivo scelto e il testo che scrivi | esaminare il problema e, se serve, rimuovere un contenuto o sospendere un account | legittimo interesse alla sicurezza del servizio e obblighi di legge |

Non usiamo i tuoi dati per pubblicità, non li vendiamo e non usiamo strumenti di analisi o di tracciamento. Lo sblocco con impronta o volto avviene sul telefono: il dato biometrico non ci arriva mai.

**Posizione**. Prima di chiederti il permesso, l'app ti spiega a cosa serve. Usiamo solo la posizione approssimativa: il telefono la arrotonda prima di inviarla e il nostro server la conserva solo con questa precisione. La distanza tra voi viene calcolata dal server. Il tuo partner vede solo la distanza, nell'app e nel widget Noi sulla schermata Home (sotto i 3 km soltanto "vicini"), mai dove sei. Con "Smetti e cancella" la condivisione si ferma e la posizione salvata viene cancellata subito.

## 3. Chi vede i tuoi dati
- **Il tuo partner** vede ciò che pubblichi nello spazio di coppia e, se attivi la posizione, solo la distanza tra voi.
- **Fornitori** che trattano dati per nostro conto:
  - Supabase (database, autenticazione, archiviazione file), regione [REGIONE SUPABASE];
  - Google Firebase Cloud Messaging (notifiche);
  - Cloudflare (distribuzione dell'app web).
- **Spotify** riceve il testo che cerchi, inviato dal nostro server senza dati che ti identificano. Quando apri un brano, il player viene caricato direttamente da Spotify e si applica l'informativa di Spotify.
- Le autorità, solo se la legge lo impone.

Alcuni fornitori possono trattare dati fuori dallo Spazio economico europeo, con le garanzie previste dal GDPR (clausole contrattuali standard o decisioni di adeguatezza). [DA VERIFICARE con regione e contratti dei fornitori]

## 4. Sicurezza
Le comunicazioni sono cifrate (HTTPS). L'accesso ai dati è limitato alla tua coppia con regole lato database. I file sono serviti con link temporanei.

## 5. Quanto conserviamo i dati
Finché il tuo account è attivo, con queste eccezioni:
- i contenuti "Lasciato per te" già aperti vengono cancellati 30 giorni dopo l'apertura, salvo quelli conservati nei Ricordi;
- la posizione resta salvata solo finché la condividi: con "Smetti e cancella" viene cancellata subito;
- le segnalazioni vengono cancellate 12 mesi dopo l'invio;
- la copia dei tuoi dati che ti mandiamo su richiesta viene cancellata dopo 7 giorni.

Quando chiedi l'eliminazione, dopo aver confermato la password, il tuo account viene eliminato subito e non può essere recuperato. La rimozione dei file si completa entro 30 giorni. Conserviamo per 12 mesi solo una ricevuta tecnica dell'eliminazione (identificativo dell'account e della coppia, date, esito), senza contenuti.

[DIPENDE PIANO SUPABASE, D-8] Oggi non teniamo copie di backup del database. Se le attiveremo, questo paragrafo indicherà per quanto tempo vengono conservate prima di essere sovrascritte.

## 6. Eliminare l'account
Puoi chiedere l'eliminazione dall'app (Impostazioni › Privacy e dati › Elimina account), dalla pagina https://[DOMINIO]/elimina-account o scrivendo a moonee.team@gmail.com.

Eliminiamo il tuo profilo e i tuoi dati personali: risposte, umore, quiz, posizione, dispositivi e notifiche, storie, appuntamenti personali, messaggi programmati non ancora consegnati. Quello che avete condiviso nello spazio di coppia (Momenti e foto, messaggi già consegnati, appuntamenti ed eventi condivisi, desideri, i 'lasciati per te' che il tuo partner ha conservato, la storia della coppia) resta al tuo partner, senza il tuo nome; il partner può cancellarlo. Se eri l'ultimo membro della coppia, viene cancellato tutto lo spazio. Puoi chiedere una copia dei tuoi dati prima dell'eliminazione (vedi il punto 9).

## 7. Uscire dalla coppia
Puoi uscire dalla coppia senza eliminare il tuo account (Impostazioni › Voi › Esci dalla coppia), confermando con la password. Lo spazio di coppia si chiude subito e nessuno dei due può più entrarci. Valgono le stesse regole dell'eliminazione: cancelliamo i tuoi dati personali di quella coppia, mentre quello che hai condiviso nello spazio di coppia resta al tuo partner, senza il tuo nome. Il tuo account resta: puoi creare un nuovo spazio o accettare un nuovo invito. Se eri l'ultimo membro della coppia, viene cancellato tutto lo spazio.

## 8. Segnalazioni
Puoi segnalare un problema o un contenuto da Impostazioni › App e supporto › Segnala un problema o un contenuto, scegliendo un motivo e scrivendo cosa è successo, oppure scrivendo a moonee.team@gmail.com. La segnalazione la legge solo il team di US, mai il tuo partner. Leggiamo ogni segnalazione e, se un contenuto o un account viola i termini, possiamo rimuovere il contenuto o sospendere l'account. Conserviamo la segnalazione per 12 mesi dall'invio; se nel frattempo elimini l'account, resta senza il tuo nome.

## 9. I tuoi diritti
Hai diritto di accesso, rettifica, cancellazione, limitazione, portabilità e opposizione, e puoi revocare il consenso alla posizione in qualsiasi momento. Per avere una copia dei tuoi dati, o per esercitare un altro diritto, scrivi a moonee.team@gmail.com: rispondiamo entro 30 giorni. La copia ti arriva via email: è un file con i tuoi dati e i link alle tue foto, valido 7 giorni, e non contiene quello che ha scritto il tuo partner. Puoi presentare reclamo al Garante per la protezione dei dati personali (garanteprivacy.it) o all'autorità del Paese in cui vivi.

## 10. Minori
US è riservata a persone maggiorenni: alla registrazione confermi di avere almeno 18 anni. Non raccogliamo consapevolmente dati di minori di 18 anni; se scopriamo che un account appartiene a un minore, lo chiudiamo.

## 11. Modifiche
Se cambiamo questa informativa, aggiorniamo la data in alto e, per modifiche importanti, te lo segnaliamo nell'app.
