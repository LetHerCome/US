# Mission — Accoglienza V1 e widget «La domanda di oggi»

**Status:** IN BRANCH
**Branch:** `claude/accoglienza-widget` (da `main` dopo #224)
**Origine:** confronto con Paired del 22/10/2026 (accoglienza personalizzata, widget) e richiesta del founder del 25/10/2026: «facciamo domande accoglienza, i widget più ricco, lo snellimento di styles.css». Decisioni del founder dello stesso giorno: una sola domanda («vicini o a distanza») e un widget nuovo 4×2.

## 1. Accoglienza: una domanda per la coppia

- **La domanda:** «Come vi vedete?» con due risposte: **Ci vediamo spesso** (stessa casa o città) e **Viviamo lontani** (città diverse).
- **A cosa serve:** solo a scegliere le missioni della settimana. Le missioni hanno già un modo `any`, `near` o `far`: oggi lo decide la distanza tra le posizioni condivise; senza posizioni arrivavano solo quelle generiche. Ora, senza posizioni, decide la risposta. **Se condividete la posizione, decide la distanza vera.**
- **Dove:** una card su Oggi, una volta sola per persona («Una domanda per voi»), e una riga in Impostazioni › Voi («Come vi vedete»), per cambiarla quando volete. Raggiunge le coppie nuove e quelle che ci sono già, senza toccare la sequenza animata della creazione della coppia.
- **Dati:** una colonna di `public.couples`, `distance_mode` (`near` / `far`, vuota finché nessuno risponde), scritta da uno dei due come il nome e la data (permesso sulla colonna + la policy `couples_update_own`). Descrive la coppia, non una persona. `private.bond_mode_for_couple` la usa quando mancano le posizioni.
- **Non cambia** la domanda del giorno, che è la stessa per tutte le coppie: renderla diversa per coppia è un cambio grosso, fuori da questa missione.

## 2. Widget «La domanda di oggi» (Android, 4×2)

- **Cosa mostra:** la domanda di oggi (in serif, al massimo tre righe) e a chi tocca: «Rispondi quando vuoi», «Beatrice ha risposto. Tocca a te», «Hai risposto. Aspettiamo Beatrice», «Le vostre risposte sono pronte». **Mai le risposte.**
- **Un tocco** apre la domanda in US.
- **A mezzanotte** (Europe/Rome) il widget non sa la domanda nuova, perché non legge la rete: mostra «Apri US per la domanda nuova».
- **Come:** il campo `daily` dello snapshot (`date`, `question`, `state`), ricontrollato da `UsWidgetContract` come ogni altro campo; Oggi lo aggiorna quando disegna la domanda. Il widget sta anche nell'elenco dei widget dentro US.
- Il countdown aveva già il suo widget.

## 3. Snellimento di `styles.css`

~35 KB di regole per elementi che l'app non ha più (il vecchio hub di Noi, la vecchia lavagna e altri resti), tolte solo dove nessuna classe del selettore compare in HTML o JS. Stessi stili calcolati per ogni elemento delle schermate principali. Precache 2,9 → 2,77 MB, limite di nuovo a 2,8 MB.

## Acceptance

- Test SQL: solo `near`/`far`, solo i membri, la posizione condivisa vince, `any` senza niente.
- Test Java del widget: la domanda e lo stato passano, le risposte no; a mezzanotte a Roma diventa «apri US».
- Test client; `npm test`, `npm run build:cloudflare-pages`, `git diff --check`; prova nel browser.
- Produzione: la migrazione `20261025190000_couple_distance_v1` va applicata **prima** del merge, con l'OK del founder.
