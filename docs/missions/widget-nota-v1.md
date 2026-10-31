# Widget «Nota» V1 — disegno di sicurezza

**Fonte:** founder, 31/10/2026: quattro widget scelti da un'app di riferimento; questo è il quarto. Dipende dalle Note condivise (`docs/missions/note-condivise-v1.md`, branch `claude/note-condivise`, tabella `public.couple_notes`).
**Branch:** `claude/gallant-ardinghelli-bb2acf`. Solo Android. Prima staging; la produzione solo con il via del founder.
**Stato:** disegno scritto prima del codice (31/10/2026).

## Cosa vede e cosa fa chi lo usa

- Un widget quadrato con **una nota scelta** quando lo si mette sulla Home.
- Mostra il **titolo**, poi il **testo** oppure le **voci della lista** con il quadratino, e in fondo chi l'ha toccata per ultimo e quando: «Bea · 20 min fa».
- Le **voci si spuntano sul widget**, senza aprire US.
- La **matita** apre una **finestrella di scrittura** sopra la Home: un'Activity con tema da dialogo, non l'app. Lì si cambiano titolo, testo e voci, poi «Salva».
- Su Android non si scrive dentro un widget. Il founder lo sa e ha scelto la finestrella.
- Due persone che scrivono: **vince l'ultimo salvataggio**, come nell'app (D8 delle Note condivise). La spunta di una voce però è precisa: cambia solo quella voce, così non cancella quello che l'altra persona ha scritto nel frattempo.

## Regole di sicurezza

1. **Nessuna credenziale Supabase nel widget.** Niente sessione, niente refresh token, niente chiave. Come il widget Ti penso, il widget usa un **token del dispositivo**:
   - lo emette il server, per una persona e un dispositivo;
   - è casuale, 32 byte;
   - il server ne conserva solo l'hash SHA-256;
   - sul telefono sta cifrato con il Keystore di Android (`UsWidgetCredentialStore`);
   - scade dopo 180 giorni.
2. **Un token separato per le note**, con scope `note:rw`, diverso da `think:send`. Il token di Ti penso non guadagna nuovi poteri, e quello delle note non può mandare Ti penso. Uno per persona, dispositivo e scope: l'indice unico c'è già.
3. **Il token esiste solo finché c'è un widget Nota sulla Home.**
   - L'app lo chiede quando vede almeno un widget Nota.
   - Quando si toglie l'ultimo widget Nota, il telefono cancella token e copia delle note. L'app, alla prossima apertura, revoca il token sul server.
   - Logout ed eliminazione dell'account cancellano tutto, come oggi.
4. **Ogni scrittura passa da una funzione del server con il controllo di coppia**: l'Edge `widget-note`, poi l'RPC `public.widget_note_internal`, `security definer`, eseguibile solo da `service_role`. L'RPC rifiuta se:
   - il token non c'è, è revocato o scaduto, o ha uno scope diverso da `note:rw`;
   - la persona del token **non è più nella coppia** del token (ha lasciato o cambiato coppia);
   - la nota non è di quella coppia (stesso errore di «nota inesistente», così non si scopre niente delle altre coppie).
5. **Autore e ora li scrive il server**: `updated_by`, `updated_at` e `revision` li mette l'RPC. Il trigger delle Note condivise vale solo per il ruolo `authenticated`; qui scrive la funzione. `couple_id` e `created_by` non cambiano mai.
6. **Stessi limiti dell'app**, controllati nell'RPC e dai vincoli della tabella:
   - titolo 80 caratteri, testo 4000, 100 voci da 200 caratteri, voci nella forma `{id, text, done}`;
   - niente nota vuota.
   L'Edge rifiuta già le richieste fuori misura (corpo massimo 24 KB).
7. **Freno:** al massimo una scrittura ogni 400 ms per token (`last_action_at`), contro i doppi tocchi e i cicli. Le spunte ripetute sulla stessa voce con lo stesso valore non scrivono.
8. **Niente rete in background.**
   - Il widget va in rete solo dopo un tocco: spunta, apertura della finestrella, «Salva». La risposta riporta la nota aggiornata, che sostituisce la copia sul telefono.
   - Il resto del tempo il widget mostra la copia che l'app scrive quando è aperta: le note della coppia, solo se c'è un widget Nota.
9. **Indirizzo del server scelto dall'app, non fisso.**
   - Il widget Ti penso oggi chiama sempre la produzione (indirizzo fisso in `UsWidgetActionClient.java`), quindi nell'APK di staging non funziona.
   - Per la Nota l'app passa al telefono l'indirizzo delle Edge insieme al token. Il codice nativo accetta solo i due progetti US (produzione `iiakdfsxpywdkxravqjh`, staging `dugmhngrfkuieeletatb`) in `https`. Così un token non può finire su un altro server.
   - Ti penso resta com'è: cambiarlo è un lavoro a parte.
10. **Copia delle note sul telefono:**
    - nella cartella privata dell'app, esclusa dai backup (`noBackupFilesDir`, come la foto del widget), legata all'account (hash del proprietario);
    - solo le note della coppia, al massimo le 30 più recenti più quelle scelte dai widget;
    - si cancella con il logout, con un altro account o togliendo l'ultimo widget Nota.
11. **La finestrella non è esportata** (`exported="false"`). La apre solo il `PendingIntent` immutabile del widget, con l'id del widget e della nota. Sul telefono l'id viene ricontrollato contro la scelta salvata per quel widget.
12. **Nessun log del contenuto.** Né l'Edge né il codice nativo scrivono nei log testi, titoli o token.

## Pezzi

### Database: migrazione `widget_note_v1`, dopo `couple_notes_v1`

- `widget_action_tokens.scope`: il vincolo passa da `= 'think:send'` a `in ('think:send', 'note:rw')`.
- `public.widget_note_internal(p_token_hash text, p_op text, p_note_id uuid, p_payload jsonb)`, `security definer`, `search_path = ''`, solo `service_role`. Operazioni:
  - `get`: la nota, per la finestrella;
  - `toggle`: `{item_id, done}`; cambia solo quella voce, in un'unica `update` con `jsonb`, così una spunta non cancella le voci scritte nel frattempo;
  - `save`: `{title, body, items}`; vince l'ultimo, come nell'app.
  Restituisce la nota (`id, title, body, items, updated_at, revision`) e il nome di chi l'ha toccata per ultimo.
- Le note cambiate dal widget arrivano all'app con il tempo reale che c'è già (`couple_notes` è in `supabase_realtime`).

### Edge

- **`widget-device-token`:** accetta `scope` (`think:send` per default, oppure `note:rw`) per `issue` e `revoke`. Senza `scope` fa quello che fa oggi.
- **`widget-note`, nuova:**
  - `POST` con l'intestazione `X-US-Widget-Token`, corpo `{op, noteId, ...}`;
  - convalida tutto in `_shared/widget-note-contract.mjs`, testabile con Node;
  - chiama l'RPC con l'hash del token;
  - risponde `401` per un token non valido, `404` per una nota che non c'è o non è della coppia, `429` per il freno.

### Android (`us-widget-bridge`)

- **`UsNoteWidgetProvider`:** titolo; testo oppure fino a 6 voci, ognuna una riga cliccabile con il quadratino (`PendingIntent` verso un receiver interno, non esportato); «+3» se ce ne sono altre; «Bea · 20 min fa»; la matita. Funziona da Android 8 (minSdk 26), senza CheckBox di Android 12.
- **`UsNoteWidgetActionReceiver`:** spunta subito sulla copia (ottimistica), poi chiama il server. Se il server rifiuta, torna indietro e mostra «Non salvato» per qualche secondo.
- **`UsNoteEditActivity`** (tema dialogo): titolo, testo, voci (aggiungi, togli, spunta), «Salva» e «Annulla». Prima legge la nota dal server; se non c'è rete mostra la copia e salva quando si preme «Salva».
- **`UsNoteWidgetConfigureActivity`:** quando si mette il widget, l'elenco delle note dalla copia sul telefono. Se la copia non c'è: «Apri US per scegliere una nota». Un widget senza nota mostra «Tocca per scegliere una nota».
- **`UsWidgetCredentialStore`:** un posto per token e scope; per la nota anche l'indirizzo delle Edge.

### App (WebView)

- Se c'è almeno un widget Nota, l'app chiede il token `note:rw`, lo passa al telefono con l'indirizzo delle Edge e scrive la copia delle note (al cambio delle note, all'avvio, al ritorno in primo piano).
- Se non ce ne sono più, revoca il token.

## Test (prima i test, poi il codice)

- **PGlite (`tests/widget-note-v1-db.test.js`):**
  - token della coppia sì, altra coppia no;
  - token revocato, scaduto o con scope `think:send` no;
  - persona uscita dalla coppia no;
  - la spunta cambia una sola voce e lascia le altre;
  - `save` rispetta i limiti;
  - autore, ora e revisione dal server;
  - il freno;
  - funzione negata ad `anon` e `authenticated`.
- **Node:** contratto dell'Edge (forme, misure, errori), `widget-device-token` con `scope`, allow-list dell'indirizzo, cablaggio dell'app.
- **JVM:** modello del widget (voci visibili, «+3», «Bea · 20 min fa», stato in sospeso), convalida dell'indirizzo.
- Poi `npm test`, `npm run build:cloudflare-pages`, `git diff --check`, `:us-widget-bridge:testDebugUnitTest`.

## Prima della produzione

- Approvazioni separate del founder:
  - migrazione su staging, poi su produzione (`supabase-sql-apply.yml`);
  - Edge `widget-note` e `widget-device-token` su staging, poi su produzione.
- Privacy: il widget mostra il contenuto della nota sulla schermata Home. Lo si sceglie mettendolo; da scrivere nell'informativa.
- Sicurezza dei dati su Play: nessun dato nuovo raccolto (le note ci sono già); il token resta sul dispositivo.
