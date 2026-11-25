# US vi ricorda — la crescita della coppia (25 novembre 2026)

**Tipo:** progetto di prodotto, deciso; si costruisce a passi su staging (§8), prima la tavola.
**Fonte:** founder, 25/11/2026: «US deve essere un'app che cresce insieme alla coppia, quello è lo slogan, ma al momento come cresce?». Poi, scartata la metafora di un cielo che si riempie: «tutto quanto US pian piano ricorda… è come se l'applicazione conoscesse sempre di più la coppia e potesse riutilizzare degli elementi che la coppia inserisce… e facciamo parlare i personaggini, raramente». Sessione /grill-me, decisioni D1–D22 confermate con «Tutto okay possiamo partire», con il cambio di D22 su staging e produzione.
**Nome interno:** il motore è «Cupido», lo stesso progetto del 13/11 (`docs/product/2026-11-13-cupido.md`, commit c3997c98 sul ramo `claude/app-ai-differentiator-afc63c`, mai pushato), qui senza Compagni e senza Plus. Verso l'utente non ha un nome suo: parlano i vostri personaggi.

---

## 1. Che cosa vuol dire crescere

US vi conosce sempre di più: si ricorda le vostre cose e ve le restituisce raramente e al momento giusto, per bocca dei vostri personaggi. È il cuore di US ed è **gratis per tutti**.

La crescita si vede in due modi: i personaggi che ogni tanto vi dicono qualcosa di vostro, e la pagina «Cosa US sa di voi» che si riempie.

**A regole, senza AI.** Tutto quello che serve (date, un anno fa, giochi dai vostri dati, promemoria) si fa con regole e testi scritti a mano: i dati non escono da US, non costa niente, si prova bene e dice sempre cose giuste. L'AI (Claude Haiku, circa 0,03 $ a coppia al mese) si valuta solo dopo, sopra la stessa memoria, per leggere il testo libero e dare più varietà alla voce: richiede il sì di tutti e due, un nuovo fornitore nell'informativa e nella sezione Sicurezza dei dati di Play, e un accordo sul trattamento dei dati.

## 2. Chi parla e come

| # | Decisione |
|---|---|
| D1 | **Parla il tuo personaggio**, anche quando si parla di Bea («Tra 7 giorni è il compleanno di Bea»). Per le cose di coppia (anniversario, un anno fa) compaiono tutti e due. Il personaggio dell'altra persona non parla mai «per conto suo». |
| D2 | **Si parte dall'isola in app.** Le notifiche arrivano dopo (§8 passo 5), solo per compleanno, anniversario e «ti aspetta». |
| D11, D17 | **Il fumetto.** Quando c'è una battuta l'isola si allarga, i personaggi si affacciano e da quello che parla esce un fumetto sotto l'isola, con la punta verso di lui: la battuta, al massimo due righe (circa 90 caratteri). Se parlano tutti e due, il fumetto esce dal centro. Toccandolo si apre la scheda della battuta (frase intera, foto se c'è, il tasto del gesto, «Non ora»; «Non dirmelo più» tenendo premuto). Dopo 8 secondi fumetto e isola si richiudono; la battuta resta nella scheda Voi dell'angolo fino a sera. |
| D15 | **Il tono:** frasi brevi e affettuose, col tu, mai colpevolizzanti, niente emoji, al massimo un punto esclamativo. Almeno 5 varianti per tipo di battuta. Prima in italiano, l'inglese prima del rilascio. |

## 3. Quanto e quando

| # | Decisione |
|---|---|
| D3 | **Al massimo una battuta al giorno per persona**, solo quando c'è qualcosa di vero; nei giorni senza niente da dire stanno zitti. |
| D12 | **Dalle 9 alle 21, ora italiana**, come tutta l'app. Le battute legate a una data la mattina, i ricordi la sera. Il fuso personale si aggiunge quando servirà. |
| D13 | **Decide il server, ogni notte alle 4:** per ognuno la battuta del giorno dopo e il momento, scritta in una tabella; l'app la mostra all'apertura. «Ti aspetta» nasce in giornata: lo decide l'app al momento, con le stesse regole e lo stesso limite. |
| D20 | **Se ce n'è più di una vince**, nell'ordine: compleanno o anniversario; ti aspetta; un anno fa; traguardi; una domanda per conoscervi; la proposta del gioco. Le altre aspettano un giorno libero. «Un anno fa» va a uno solo dei due, a turno, così il gesto va dall'uno all'altra. |

## 4. Che cosa usa

| # | Decisione |
|---|---|
| D4 | **Solo quello che tutti e due già vedete in US:** ricordi, impegni (anche quelli personali, che il partner vede già), idee, giochi finiti, risposte rivelate e tenute, date. **Mai:** risposte non ancora rivelate, Lasciato per te, posizione, storico di Come stai. Una lista di parole delicate (medico, ospedale, analisi, terapia…) esclude un impegno da ogni battuta. |
| D5 | **Sorprese a senso unico.** Il compleanno di Bea lo ricorda solo a te; l'anniversario a tutti e due, ognuno per conto suo. Mai su superfici che vedete insieme (calendario di Noi, widget, storia condivisa). |

Fonti, tutte già nel database (inventario del 25/11): `couples.started_on` (anniversario, mesiversari, giorni tondi, `relationship_milestones`), `shared_events` con `recurs_yearly` (compleanni, salvati all'iscrizione come «Compleanno di …»), `moments` e `moment_photos` (data, luogo, didascalia, autore), `calendar_entries` (`ci_vediamo`), `bucket_items` vissuti, `game_sessions` e risposte, `daily_question_keepsakes`, stato della domanda e delle partite («ti aspetta»). Il ritorno che c'è già, «Un anno fa, oggi» in Ricordi (`ricordiPickRivivi`), e gli adattatori dei giochi (`private.game_v2_ctx_*`) sono la base.

## 5. Che cosa dice (prima versione)

| # | Decisione |
|---|---|
| D9 | Cinque tipi: **compleanni** (7 giorni prima, il giorno prima, il giorno stesso, all'altro); **anniversario, mesiversari e giorni tondi**; **un anno fa** (un ricordo, un «Ci vediamo», un'idea fatta); **ti aspetta** (l'altro ha risposto o giocato, tu no); **traguardi e prime volte** (centesimo ricordo, prima volta in una città). «Per l'altro» («domani Bea ha un impegno, mandale un Ti penso») arriva nella seconda versione. |
| D14 | **Coppie nuove:** US chiede per conoscervi, una cosa alla volta e mai due giorni di fila («Quando è il compleanno di Bea?», «Mettete il vostro primo ricordo», «Da quando state insieme?»). Ogni risposta entra in «Cosa US sa di voi». |
| D19 | La prima apertura dell'isola diventa una **presentazione** («Ciao! Da oggi ogni tanto vi ricordo le vostre cose»); il livello nuovo diventa una battuta dei traguardi, coi personaggi in festa. «Un anno fa, oggi» in Ricordi resta e usa la stessa scelta della battuta. |

## 6. Il gesto e il no

| # | Decisione |
|---|---|
| D7 | **Ogni battuta prepara il gesto, non lo fa mai al posto tuo:** «un anno fa» apre Lasciato per te con la foto dentro; il compleanno apre il calendario o un Ti penso; «Ti ricordi?» apre il gioco. Mandi tu. |
| D8 | «Fatto», «Non ora» (la ripropone più avanti), «Non dirmelo più» (spegne quel tipo solo per te; dopo 60 giorni chiede una volta se può ricominciare). |
| D22 | Un interruttore **«Le voci dei personaggi»** in Profilo › Notifiche, acceso di base. |

## 7. La crescita che si vede

| # | Decisione |
|---|---|
| D6, D18 | **«Cosa US sa di voi»** in cima alla scheda Voi dell'angolo: «US vi conosce da 4 mesi», poi le vostre date (compleanni, anniversario, prossimo mesiversario), i vostri luoghi (i 5 più ricorrenti, con quante volte), le prime volte, i numeri (giorni insieme, ricordi, partite, idee fatte), cosa vi piace (il gioco più giocato, il mese con più ricordi). Ogni fatto si corregge (una data apre l'evento) o si nasconde; nascondere non cancella niente. Il livello della Sintonia resta, più piccolo. |
| D10 | **Il gioco «Ti ricordi?»:** una famiglia nuova in Gioca, giocata in due come le altre e dentro le 3 partite al giorno. Cinque domande dai vostri dati: «Dove eravate?» (i vostri luoghi come risposte), «Quando era?», «Chi l'ha scattata?», «Chi ha risposto così?» (risposte tenute), «Quale di queste avete fatto?» (idee fatte). Compare con almeno 8 ricordi con data e luogo; il personaggio lo propone ogni tanto. |

## 8. Misura, passi, staging e produzione

| # | Decisione |
|---|---|
| D16 | Sul nostro server, senza servizi esterni: quante battute diventano un gesto entro 24 ore e quanti «Non dirmelo più». Solo numeri, niente testi. Obiettivo indicativo: oltre il 25% di gesti, meno del 10% di persone che le spengono. Va scritto chiaro nell'informativa. |
| D21 | **Passi**, ognuno col suo ramo e la sua unione a staging: 1. tavola; 2. motore a regole + fumetto nell'isola + scheda Voi (migrazione e lavoro notturno su staging, ognuno col sì del founder); 3. «Cosa US sa di voi»; 4. il gioco «Ti ricordi?»; 5. le notifiche dei personaggi (APK nuovo). |
| D22 | **Staging e produzione (cambiata dal founder):** su staging prova solo il founder, perché Bea non c'è; in produzione si va eventualmente direttamente con la seconda versione, visto che US è ancora in beta. Per ora si progetta per staging. |

## 9. Rischi aperti

- **Pochi dati su staging:** un anno fa e i luoghi si vedranno poco finché non ci sono ricordi con date e luoghi; servono dati di prova realistici sul solo account del founder.
- **Varianti scritte a mano:** almeno 5 per tipo, in due lingue prima del rilascio.
- **Parole delicate:** la lista va tenuta e provata su titoli veri prima della produzione.
- **Rumore:** con la domanda del giorno, le partite e la lavagna, una battuta in più al giorno può pesare; se D16 lo dice, si scende.
