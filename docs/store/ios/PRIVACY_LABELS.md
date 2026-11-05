# US per iPhone — etichette privacy di App Store Connect (bozza)

**Stato:** bozza del 05/11/2026. Fonte: `privacy.html` (aggiornata il 02/11), la Sicurezza dei dati di Play ([`PLAY_DECLARATIONS_DRAFT.md`](../play/PLAY_DECLARATIONS_DRAFT.md)) e il manifesto dell'app `ios/App/App/PrivacyInfo.xcprivacy`, che dice le stesse cose (lo controlla `tests/ios-store-v1.test.js`).

## Risposte generali

- **Raccogliete dati da questa app?** Sì.
- **Tracciamento** (dati usati per pubblicità o condivisi con data broker): **no**, per nessun dato. Nessun SDK di pubblicità, analisi o crash. Niente richiesta di tracciamento (ATT).
- **Finalità** per tutti i dati: solo **Funzionalità dell'app**. Mai pubblicità, analisi, personalizzazione o altre finalità.
- **Collegati all'identità:** sì, tutti tranne la cronologia delle ricerche (il testo cercato va a Spotify dal nostro server, senza dati dell'utente).

## Dati, uno per uno

| Categoria di Apple | Dato di Apple | In US | Collegato | Tracciamento |
|---|---|---|---|---|
| Informazioni di contatto | Nome | nome, nome della coppia, data di inizio | sì | no |
| Informazioni di contatto | Indirizzo email | email dell'account | sì | no |
| Contenuto dell'utente | Foto o video | foto dei Ricordi, foto profilo, foto della sfida, video di Lasciato per te | sì | no |
| Contenuto dell'utente | Dati audio | note vocali | sì | no |
| Contenuto dell'utente | Altri contenuti dell’utente | risposte, «Come stai», Note e post-it, disegni della lavagna, calendario, messaggi di Lasciato per te, segnalazioni | sì | no |
| Posizione | Posizione precisa | il posto di un Ricordo: arrotondato a circa 100 m, ma con tre decimali, che per Apple è «precisa» | sì | no |
| Posizione | Posizione approssimativa | la posizione per la distanza, arrotondata prima dell'invio | sì | no |
| Identificatori | ID utente | l'ID dell'account | sì | no |
| Identificatori | ID dispositivo | token delle notifiche (APNs) e ID di installazione casuale | sì | no |
| Dati di utilizzo | Interazioni con il prodotto | partite giocate, progressi di Sintonia | sì | no |
| Cronologia delle ricerche | Cronologia delle ricerche | il testo cercato nella ricerca musicale (come su Play) | **no** | no |
| Altri dati | Altri tipi di dati | livello della batteria, mostrato al partner | sì | no |

**Non raccolti:** dati finanziari, salute e fitness, contatti, cronologia di navigazione, dati sensibili, dati diagnostici, identificatori pubblicitari, acquisti. Face ID resta sul telefono: il dato biometrico non arriva mai a US.

**Da valutare con il consulente (D-10):** «Come stai» ha anche 🤒 «malato». È uno stato scelto dalla persona per il partner, non un dato sanitario: qui è tra gli «Altri contenuti dell’utente». Se il consulente lo legge come dato di salute, si aggiunge «Salute».

## Differenze da Android da scrivere in `privacy.html` prima del rilascio iOS

Non cambiate adesso (le pagine di produzione cambiano con il rilascio iOS, con il via del founder):
- **Notifiche su iPhone:** passano dal servizio di Apple (Apple Push Notification service), non da Firebase. Testo proposto per «Fornitori»: «Apple (Apple Push Notification service), per le notifiche su iPhone» / «Apple (Apple Push Notification service), for notifications on iPhone».
- **Accedi con Apple** (scelta del founder del 05/11, [missione](../../missions/ios-store-v1.md) §3): l'email (anche quella nascosta da Apple), il nome se lo condividi la prima volta e l'identificativo del tuo account Apple, come oggi per Google. Fornitore nuovo: Apple, anche per l'accesso. Il server tiene un token di Apple solo per revocarlo quando elimini l'account. Nelle etichette di App Store Connect non cambia niente: nome, email e ID utente ci sono già.
- **Google su iPhone:** passa dal browser di sistema dell'iPhone; i dati sono quelli di oggi (email, nome, immagine e identificativo Google).
- La data «Ultimo aggiornamento» si cambia insieme.
