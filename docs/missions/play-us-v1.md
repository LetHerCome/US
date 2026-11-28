# Play Us v1 — piano tecnico

Stato: **piano, da approvare** (28/11/2026). Decisioni: grill del founder del 28/11, D1–D22, tutte accettate; prototipo approvato: https://claude.ai/artifact/MhLJSTQ8n7XWGNuy14BpPq (labirinto reso più facile su richiesta). Il passo A del grill (quiz vivi) è in staging con la PR #323.

## Cosa costruiamo

Play Us (nome provvisorio) è l'unica modalità di Gioca che si gioca **insieme, nello stesso momento**. Uno invita, l'altro accetta entro 3 minuti, entrate in lobby e giocate 8 tappe in 5–7 minuti:

1. 3 domande lampo da 10 s, misuratore di intesa dal vivo
2. foto solo da fotocamera, 30 s (salta → all'altro arriva una vostra foto dai Ricordi)
3. ritocco della foto dell'altro, 40 s (adesivi a un tocco, pennarello, scritta), a sorpresa
4. 2 previsioni di «Quanto mi conosci»
5. vocale di 5 s oppure un gesto
6. labirinto 45 s: stesso campo su due schermi, punteggio dell'altro dal vivo
7. rivelazione insieme
8. ricordo in Ricordi, +30 al livello per tutti e due (provvisorio), pegno del vincitore come post-it sulla lavagna di Noi

Regole: **una partita al giorno per coppia** (mezzanotte di Roma), niente gettoni; la partita è «spesa» dalla tappa 4; con US Plus di più (per ora solo il richiamo «Avvisatemi»). Se uno cade, l'altro aspetta 60 s, poi si chiude e si salva quanto fatto.

## Cosa riusiamo (già nel codice)

| Serve | Esiste già |
|---|---|
| Aggiornamenti dal vivo | Realtime `postgres_changes` filtrato per coppia (`app.js` `startUsRealtime`), anche per la lavagna che si disegna dal vivo |
| Notifiche | `send-web-push` con `EVENT_TYPES` (si aggiunge `play_invite`), FCM e APNs già collegati |
| Fotocamera dal vivo e vocali | `left-for-you.js`: fotocamera con `getUserMedia` e input con `capture`, registrazione con `MediaRecorder` |
| Foto della coppia | deposito `us-media` con le sue regole per coppia; `moments` + `moment_photos` per i Ricordi |
| Post-it sulla lavagna | `couple_notes` (con `posto`) e la push `postit` |
| Punti del livello | `private.progression_award(couple, actor, kind, key, …)`, una volta per chiave |
| Domande | il catalogo dei giochi a turni (stesse domande di `start_game_round`, solo brevi e a scelta per la tappa 1) |
| Personaggi | `UsPersonaggi.character()` |

## Database (staging, con il via)

Una migrazione creata con la CLI di Supabase, provata prima sul database usa e getta dei test.

- **`play_us_sessions`**: `id`, `couple_id`, `day` (data di Roma), `invited_by`, `status` (`invited` · `lobby` · `playing` · `done` · `expired` · `abandoned`), `step` (1–8), `step_started_at`, `spent` (vero dalla tappa 4), `seed` (stesso labirinto e stesse domande per tutti e due), `items` (le domande scelte), `result` (jsonb), `created_at`, `invite_expires_at`.
- **`play_us_moves`**: una riga per persona, tappa e tipo (`answer`, `photo`, `edit`, `guess`, `voice`, `gesture`, `score`, `pegno`), con `payload` jsonb; unica su (sessione, persona, tappa, tipo).
- **Regole (RLS)**: si legge solo la propria coppia, non si scrive mai direttamente; tutto passa dalle funzioni qui sotto (`SECURITY DEFINER`, `search_path` fisso, permessi stretti), come per i giochi di adesso.
- **Funzioni**:
  - `play_us_today()`: partita di oggi già spesa?, invito aperto?, sessione in corso.
  - `play_us_invite()`: crea l'invito se oggi non c'è una partita spesa né un invito aperto; vale 3 minuti.
  - `play_us_answer(session, accept)`: accetta (→ lobby) o rifiuta.
  - `play_us_move(session, step, kind, payload)`: salva una mossa solo nella tappa giusta e nel suo tempo.
  - `play_us_advance(session)`: passa alla tappa dopo quando tutti e due hanno fatto o il tempo è scaduto; idempotente, la chiamano tutti e due; alla tappa 4 segna `spent`.
  - `play_us_finish(session)`: crea il ricordo in Ricordi, dà i +30 a tutti e due (`progression_award`, chiave = sessione) e scrive il pegno come post-it.
  - `play_us_abandon(session)`: dopo 60 s senza l'altro chiude la partita e salva quanto fatto.
- Limite: una partita spesa per coppia e giorno di Roma; la regola sta in una funzione sola, così US Plus potrà alzarla.

## Tempo reale

- **Stato della partita**: `postgres_changes` su `play_us_sessions` e `play_us_moves` filtrato per coppia, sul canale di sempre. Ogni telefono ridisegna dalla riga, il server decide le tappe.
- **Presenza** (pallino verde in Gioca, «Bea si è persa un attimo…»): Realtime Presence su un canale **privato** della coppia, con la regola su `realtime.messages`. Da verificare sulla documentazione attuale di Supabase prima di scriverla (regola del progetto); è la prima volta che US usa Presence.
- **Punteggio del labirinto dal vivo**: Broadcast sullo stesso canale privato (niente scritture nel database); il punteggio finale si salva come mossa `score`.

## Notifiche

- Nuovo tipo `play_invite`: «Francesco ti sfida a Play Us», scade dopo 3 minuti (TTL), apre Gioca sull'invito; testo anche in inglese.
- Dentro l'app: avviso in alto con Accetta / Non ora, anche senza push.
- Serve un **AAB** e una build **TestFlight**: le app di prima non conoscono `play_invite` e mostrerebbero l'avviso generico.

## Foto, ritocco, vocale

- Foto: la fotocamera dal vivo di Lasciato per te, 30 s; compressa (WebP, lato lungo 1080) e caricata in `us-media` sotto `{coppia}/play/{sessione}/`.
- Ritocco: canvas sul telefono; si carica il risultato. La foto dell'altro si vede solo alla tappa 7.
- Vocale: il registratore di Lasciato per te, fermo a 5 s; il gesto è una mossa senza file.

## Labirinto

Il motore del prototipo, portato in un file suo (`play-us-maze.js`): stesso labirinto dal `seed`, 2 nuvolette lente che vagano metà del tempo, 4 Ti penso, presa = −5. Gira tutto sul telefono; si mandano solo i punteggi.

## Interfaccia

- `play-us.js` e `play-us.css` nuovi; la carta in cima a Gioca la aggiunge `games.js` (`renderHub`).
- Testi e inglese in `i18n-en.js`; Riduci movimento rispettato; aree sicure del telefono.

## Fasi (ognuna su un ramo corto, unita in staging dopo la prova)

1. **Database e funzioni** con i test SQL — *serve il tuo via per la migrazione su staging*.
2. **Invito, lobby, presenza, push**: prova su due telefoni (tu e Bea).
3. **Tappe 1, 4, 5**: domande lampo, previsioni, vocale o gesto.
4. **Tappe 2, 3**: foto, ritocco, deposito.
5. **Tappa 6**: labirinto e punteggio dal vivo.
6. **Tappe 7, 8**: rivelazione, ricordo, punti, pegno, richiamo US Plus.
7. **Cadute e prova finale** a due telefoni su staging; nota della patch; AAB e TestFlight.

## Rischi

- Presence e canali privati sono nuovi per US: se le regole di Supabase non bastano, il pallino verde passa a un battito salvato nel database ogni 30 s.
- Le push su iPhone possono arrivare in ritardo: l'avviso dentro l'app copre chi ha US aperta.
- La fotocamera chiede il permesso: se negato, «Salta» e la foto dai Ricordi.
- Foto ogni giorno: compresse e una sola coppia per partita.
- «Spesa dalla tappa 4» si può aggirare uscendo prima: accettato tra voi due.

## Dopo Play Us

Il grande bilanciamento (D22): tutte le fonti di punti, sblocchi, gettoni e US Plus, con una coppia simulata a 7, 30 e 90 giorni e una tavola prima del codice.
