# US · Widget Scriptable (iPhone)

Due widget per US, senza app iOS nativa, Xcode, WidgetKit o account Apple Developer:

- **US-Ti-Penso** — piccolo invio con un tocco; disponibile in formato small e medium.
- **US-Noi** — foto Home scelta per US e giorni insieme; formato medium e small.

Si installa da iPhone/iPad: **no Mac, no Xcode, no Apple Developer account**.

La PWA e Supabase restano le autorità. I widget leggono soltanto lo stato essenziale e riusano il backend Ti Penso già esistente.

## Installazione per Beatrice

Francesco deve prima passarle i due file `US-Ti-Penso.js` e `US-Noi.js` (per esempio tramite iCloud Drive o File). I file non contengono credenziali.

1. Installa **Scriptable** dall’App Store.
2. Apri Scriptable e importa `US-Ti-Penso.js`.
3. Eseguilo una volta. In US, apri **Impostazioni → Widget US → Configura Scriptable**, copia il codice monouso e incollalo nella richiesta di Scriptable.
4. Il primo scambio salva i due token separati in Scriptable Keychain. Il codice scade dopo 10 minuti e non si può riusare.
5. Aggiungi alla Home un widget Scriptable **small** per il tap Ti Penso, oppure **medium** per il riquadro informativo + area cuore.
6. Tieni premuto il widget → **Modifica widget** → scegli `US-Ti-Penso`.
7. Importa `US-Noi.js`, aggiungi un secondo widget Scriptable (medium consigliato, small supportato) e seleziona `US-Noi`.

Il secondo script riusa le credenziali già presenti nel Keychain: non serve incollare un altro codice. Se l’installazione del codice fallisce dopo lo scambio, genera un nuovo codice da US.

### Formati dei widget

- **Small Ti Penso:** il tap su tutto il widget invia Ti Penso.
- **Medium Ti Penso:** il cuore invia; l’area informativa apre US.
- **Medium Noi:** foto, giorni insieme e nomi; apre US in HTTPS.
- **Small Noi:** stessa informazione, composizione compatta; apre US in HTTPS.

Eseguendo manualmente gli script in Scriptable si apre l’anteprima: Ti Penso mostra small, Noi medium per default. Per le anteprime alternative, usa `scriptable:///run/US-Ti-Penso?family=medium` o `scriptable:///run/US-Noi?family=small`; questi parametri contengono solo la dimensione, non credenziali.

## Uso

- Nel widget small Ti Penso, tutto il riquadro invia il segnale. Nel medium, soltanto il cuore invia; la parte informativa apre US su HTTPS.
- Un invio è considerato riuscito soltanto quando il backend risponde `sent: true`. In caso di errore il widget non salva il timestamp di successo.
- US-Noi usa soltanto `relationship.daysTogether`, i nomi e `homePhotoUrl` del contratto `us-widget-state`. La foto è esclusivamente la Foto Home scelta in US.
- Se rete o URL firmato non sono disponibili, US-Noi mostra l’ultima foto/stato in cache. Scriptable/iOS decide quando aggiornare: l’intervallo richiesto non è una garanzia realtime.
- Un 401 per token revocato/scaduto elimina la cache privata di US-Noi e i nomi memorizzati da Ti Penso; errori di rete/5xx mantengono la cache offline.

## Accesso e revoca

In US apri **Impostazioni → Widget US**. Da lì puoi verificare lo stato dell’accesso o revocare Scriptable. La revoca è globale per il profilo: disabilita tutti i widget Scriptable collegati a quell’account. Dopo la revoca, esegui di nuovo la procedura di configurazione.

La configurazione scambia un codice monouso breve per due token distinti: uno di sola lettura e uno con il solo scope `think:send`. I token permanenti non sono mostrati in US, non entrano in URL o file normali e vivono soltanto in Scriptable Keychain. Entrambi hanno una scadenza a 180 giorni. `widget-think-send` verifica direttamente la scadenza dell’action token; `us-widget-state` associa lo state token all’installazione Scriptable e verifica `revoked_at` e `expires_at` a ogni richiesta. Il job `pg_cron` resta housekeeping; i token legacy/native senza associazione Scriptable conservano il comportamento precedente.

## Note tecniche

- Endpoint stato: `GET /functions/v1/us-widget-state`, header `x-us-widget-token`.
- Invio: `POST /functions/v1/widget-think-send`, header `x-us-widget-token`, body `{ "actionId": "UUID v4" }`.
- L’URL Scriptable contiene soltanto `action=send`, mai token.
- Nessuna service key o logica di invio duplicata nei file Scriptable.
- Le date e i giorni insieme provengono dal backend (autorità calendario Europe/Rome); il client non ricalcola la storia della relazione.
- Android/KWGT resta fuori da questa V1: in futuro potrà riusare gli stessi contratti.
