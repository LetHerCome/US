# Prossima patch in produzione

## Dopo la 1.5.1 (in raccolta)

### Widget coi vostri personaggi davvero, e il personaggio dell'altra persona aggiornato (27/11)

**Stato:** ramo `claude/widget-personaggi-filtro`, verso staging. Trovato nel controllo generale del 27/11. Nessuna migrazione.

**Cosa cambia:**
- **Widget:** il ponte tra l'app e il telefono (`platform.js`) buttava via i personaggi e il secondo Post-it. Per questo i widget nuovi disegnavano sempre il personaggio di base del ruolo (tondo rosa o quadrato lilla) e il Post-it largo aveva una nota sola. Ora passano, controllati come fa il codice nativo.
- **Il personaggio dell'altra persona:** se Bea cambia forma, colore o accessori, sul tuo telefono arriva quando riapri US. Prima arrivava solo dopo aver chiuso del tutto l'app. Si rilegge solo quello, e il resto si aggiorna solo se qualcosa è cambiato. Così si aggiornano anche Oggi, l'angolo e i widget.
- **Colore:** cambiato nel Profilo o alla prima apertura, arriva subito anche alla scheda del Profilo, ai personaggi e ai widget. Prima il Profilo diceva ancora «Rosa». «Torna al colore di sempre» non compare più quando quel colore è dell'altra persona: prima vi ritrovavate tutti e due dello stesso colore.
### Oggi, personaggi e US vi ricorda: correzioni dal controllo (27/11)

**Stato:** ramo `claude/controllo-oggi-personaggi` (sopra `claude/intro-crea-personaggio`), verso staging. Nessuna migrazione: si riusano `set_my_battute_mute_v1` e la lettura di `us_battute_mute` che ci sono già.

- **«Non dirmelo più» si può davvero riaccendere.** In Profilo › Notifiche, sotto «Le voci dei personaggi», compare «Le voci che hai spento»: ogni tipo spento (compleanni, anniversari, un anno fa, quando tocca a te…) ha il suo interruttore per riaccenderlo. Se il salvataggio di «Non dirmelo più» non riesce, US lo dice e non fa finta di averlo spento.
- **L'interruttore «Le voci dei personaggi» mostra lo stato vero**, letto dal server prima di aprire la scheda, non quello che Oggi aveva caricato.
- **Dopo l'intro** tornano le cose che aveva trattenuto: il nuovo livello sull'isola e la frase dei personaggi.
- **Intro più solida:** se la domanda di oggi o l'isola non sono ancora sullo schermo quando parte, l'intro le aspetta un attimo; se non arrivano salta quella tappa, e l'ultima tappa mostrata dice sempre «Fine». Il colore dell'altra persona risulta già preso anche quando il suo profilo non è ancora arrivato.
- **Più facile da toccare:** i colori dell'intro sono alti 44 px e, sui telefoni stretti, vanno su due righe da quattro; l'isola chiusa, le schede del vostro angolo e «Non dirmelo più» arrivano a 44 px. La domanda di oggi già svelata ha un pulsante «Togli» visibile, oltre allo scorrere di lato. Nella prima apertura un colore preso dice di chi è.
- **Parole neutre:** via «Pronto?», «Siete arrivati», «vi siete visti», «tutti e due» (frasi dei personaggi, intro, colori e US Plus). Il nome all'inizio di una frase ha la maiuscola anche quando è «La tua persona».
- **Widget:** l'app passa sempre ai widget forma e colori di ciascun personaggio secondo il ruolo, come li disegna l'app (chi ha creato la coppia il tondo rosa, chi è entrato il quadrato lilla); il nastro delle polaroid, senza colore, usa quello del ruolo di chi ha messo la foto.
- **Guardaroba:** il ridisegno di ogni minuto non tocca più il vostro angolo aperto, e chi usa la tastiera non perde il punto in cui era.
- **Pulizia:** tolto codice che cercava pezzi di pagina spariti da tempo (ricordo in home, barra del legame, contatori, vecchi badge e pulsanti) e le regole CSS morte del vecchio Ti penso in alto e del vecchio calendario a tutto schermo. Una lettura in meno al server per i Ti penso del mese (non serviva più).
### Inglese completo (27/11)

**Stato:** ramo `claude/inglese-mancanti` (sopra `claude/intro-crea-personaggio`), verso staging.

- Con il telefono in inglese non restano più frasi in italiano nell'intro col personaggio (anche la nuova parte «crea»: forme, colori, «Gli accessori arrivano dopo…», «Eccomi!…»), nelle battute di US vi ricorda e nella loro scheda, nella bacheca tenuta da US, nei temi ed effetti di Oggi (nomi, descrizioni, cosa fa il dito), nei countdown, nel guardaroba e nell'angolo, nel widget Post-it e in Noi («Vi rivedete tra», «Oggi vi vedete», il giorno speciale). Circa 270 voci nuove nel dizionario inglese.
- In inglese le date delle battute escono in inglese («December 2»), e il testo già pronto di Lasciato per te e il titolo «Compleanno di…» arrivano tradotti.
- In italiano non cambia nulla: le frasi sono le stesse, solo scritte intere (con e senza nome, «un anno» e «N anni») perché il dizionario le trovi.
- Un test nuovo (`tests/i18n-coverage.test.js`) fallisce se in quei file compare una frase italiana senza la sua voce inglese. Lo script `scripts/i18n-extract.mjs` ora gira anche su Windows e vede anche le frasi con una parte che cambia.
- Il dizionario cresce di ~24 KB: il budget della precache (3,45 MB) si supera di ~21 KB finché non entra il ramo che toglie i file delle Stories.

### Intro: prima crei il tuo personaggio (27/11)

**Stato:** ramo `claude/intro-crea-personaggio`, verso staging. Chiesto dal founder dopo la prova dell'APK di staging: «aggiungi nell'intro una parte che … ti fa scegliere il personaggio prima del tutorial … senza il guardaroba che si sblocca dopo». Nessuna migrazione: usa `set_my_character_shape` e `set_my_color` che ci sono già.

- **Chi non ha mai fatto il suo personaggio** (chi ha già l'app e riceve l'aggiornamento, o chi nella prima apertura ha lasciato tutto com'era) prima del giro dell'intro lo crea: il personaggio spiega che è il suo e che lo segue in tutta l'app, anche nei widget. Si scelgono le cinque forme, ognuna col tuo personaggio dentro, e gli otto colori. Quello dell'altra persona è barrato. Il personaggio cambia subito mentre scegli.
- Niente guardaroba lì: una riga dice che gli accessori arrivano dopo e si sbloccano insieme nel vostro angolo.
- Poi «Eccomi!» e il giro di sempre (otto tappe). Chi ha già scelto forma o colore parte direttamente dal giro. «Rivedi l'intro» nel Profilo mostra anche la scelta, con quello che hai adesso.
- Se il salvataggio non riesce, torna la scelta di prima con un avviso. Il colore dell'altra persona non si può prendere, e quando US Plus sarà in vendita il colore chiederà Plus come nelle Impostazioni.
### Noi, Ricordi e Gioca: correzioni dal controllo (27/11)

**Stato:** ramo `claude/controllo-noi-ricordi-gioca`, verso staging. Una migrazione nuova, `20261127120000_us_battute_mute_bacheca.sql`, scritta ma non applicata (serve il sì, prima su staging).

- **Lavagna senza rete**: un tratto non sparisce più. Resta sulla lavagna, più chiaro, e parte da solo appena torna la connessione (o al tratto dopo, o quando riaprite US), in ordine. Mai doppio.
- **Bacheca**: se non si riesce a leggerla dice «La bacheca non risponde» con «Riprova», invece di sembrare vuota. Le risposte tenute mostrano la domanda e le risposte di tutti e due, ognuna col segno nel colore di chi l'ha scritta. Le cose appese si aprono anche con la tastiera e col lettore di schermo.
- **«L'avete fatto?»**: dopo il primo «Sì» la carta dice «Ora manca Bea» e non propone più la foto; la foto arriva solo quando l'idea è fatta davvero, coi sì di tutti e due. Anche la frase sotto lo spiega.
- **Post-it**: se la rete cade proprio mentre se ne salva uno nuovo, non nasce più una copia.
- **Tocchi più comodi** (44 punti): la casella piccola delle liste nei post-it, le frecce del mese nel calendario, la X delle idee e delle voci dei post-it, le schede Raccolta/Bacheca/Mappa.
- **Gioca**: con la tastiera o il lettore di schermo la carta di lato parte subito; col dito prima viene al centro, come prima. Testi: «Le cose che ancora non sapete di voi due», e senza il nome dell'altra persona «Aspetti la tua persona» (non più «Aspetti La tua persona»).
- **Date**: le partite finite dopo mezzanotte mostrano il giorno giusto (quello italiano). Il calendario di Noi e «oggi» per le foto contano il giorno come il resto di US (ora italiana), anche se il telefono ha un altro fuso.
- **Ricordi, la prima volta**: sotto «La vostra storia parte da qui» c'è «Aggiungi la prima foto», che apre la galleria come il +. Il riquadro vuoto non luccica più come se stesse caricando.
- **US vi ricorda**: anche il fumetto della Bacheca si può zittire tenendolo premuto («Non dirmelo più»); la migrazione fa ricordare la scelta al server.
- La foto di un Ricordo nuovo viene letta una volta sola per fare l'immagine e la miniatura (meno lavoro per il telefono). Tolti pezzi di codice e di stile rimasti dal redesign, senza cambiare nulla di visibile.

### Widget iPhone col redesign e blocca schermo (26/11)

**Stato:** in staging (#314, sopra Android #313). Stessa tavola approvata. Arriva solo con una build TestFlight nuova.

**Cosa cambia:**
- Su iPhone gli stessi nove widget di Android (prima c'erano solo Foto e Ti penso, nello stile vecchio), col foglio di giorno e il nero caldo di notte e i personaggi veri disegnati dall'estensione.
- **Blocca schermo:** Ti penso e Giorni in un cerchio, Come sta l'altra persona, la Distanza con l'anello della batteria, la busta; rettangoli per Voi due, La domanda, Lasciato per te e Distanza; una riga sopra l'ora (giorni insieme, «Bea ti pensa», «Bea ti ha lasciato una foto»). In una tinta sola, con le sagome dei personaggi.
- **Il Controllo «Ti penso»** (iOS 18): sul blocca schermo al posto della torcia, nel Centro di Controllo o sul tasto Azione, manda il cuore senza aprire US.

### Widget Android col redesign (26/11)

**Stato:** in staging (#313), provato sull'APK di staging 1795730573 (27/11: «va tutto quanto bene»). Tavola «US · Widget del redesign» (https://claude.ai/artifact/Hkj3ojVe3bwEHfg9XeJf6A) approvata: «Android ok», poi «tutte okay». Nessuna migrazione. Arriva solo con un AAB nuovo (codice nativo): il web da solo non basta.

**Cosa cambia:**
- I nove widget Android parlano come l'app: di giorno il foglio del Quaderno, di notte il nero caldo, col tema del telefono. Via le sfumature pastello, le illustrazioni e i cerchi con le emoji.
- **I personaggi veri** al posto delle foto tonde e delle emoji: la forma, il colore e gli accessori di ognuno, con la faccia del Come stai e addormentati dalle 22 alle 6. Se uno di voi cambia forma, colore o accessori, cambiano anche nei widget appena l'app si apre.
- **Ti penso**: il cuore dal tuo colore al suo (l'unico posto con i due colori insieme); quando arriva il suo pensiero, il suo personaggio innamorato e «Bea ti pensa». Nel medio voi due col cuore in mezzo.
- **Foto di Oggi** col velo come in Oggi e, dal medio, voi due piccoli nell'angolo. **La domanda di oggi** col tasto nei vostri due colori (ceralacca di giorno) e il suo personaggio che saluta quando ha risposto. **Come stai** diventa «Voi due». **Distanza**: «Tra voi», niente arco, nel medio un filo dritto fra i due personaggi.
- **Lasciato per te** è una busta di carta con la ceralacca, bordata nel colore di chi scrive. **Ricordi** sono polaroid col nastro di chi ha caricato la foto. **Post-it** di carta girati appena sulla carta del widget; **Lavagna** con la matita. Lavagna e Post-it arrivano anche in 4x2 (il Post-it medio mostra gli ultimi due, uno a testa).
- Anteprime nuove nella lista dei widget del telefono e tessere nuove in Impostazioni › Widget.
- iPhone e blocca schermo: stessa tavola approvata, ancora da fare (i dati dei personaggi arrivano già anche all'estensione iOS).
### Intro col personaggio e correzioni (26/11)

**Stato:** ramo `claude/premi-fase5-countdown-temi`, verso staging. Tavola «L'intro col tuo personaggio» (https://claude.ai/artifact/5bU5oAjgf9osRX8aumr1z4) approvata: «Sì, vai al codice». Nessuna migrazione.

**Cosa cambia:**
- **Intro**: subito dopo il primo «Entra in US», su Oggi, il tuo personaggio ti porta in giro in otto tappe (benvenuto, domanda di oggi, Ti penso, Noi, Ricordi, Gioca, Profilo e Impostazioni, il logo che si apre nella barra dei personaggi e nel vostro angolo). Illumina la cosa vera, una frase, Avanti; «Salta» sempre. Il personaggio dell'altra persona dice due battute. Una volta per persona su ogni telefono, non per chi rientra su un telefono nuovo. **Chi ha già l'app (i beta tester)** la vede una volta da sola col primo avvio dopo l'aggiornamento, su Oggi, quando siete in due e non c'è niente aperto (founder, 26/11). «Rivedi l'intro» nel Profilo. Mentre c'è, il fumetto di «US vi ricorda» aspetta.
- Chi crea la coppia e aspetta l'altra persona vede una riga del suo personaggio nella schermata del codice.
- **Premi**: le miniature dei temi di Oggi sono le anteprime vere (prima erano sfumature uguali).
- **Fluidità**: Pellicola e Ora d'oro senza fusione di colore sugli strati che si muovono (Pellicola con un effetto da ~48 a ~58 fps su un telefono modesto); gli alberi di Stagioni diventano un'immagine una volta sola.
- **Eventi di Noi**: l'ora si scrive come nel calendario (i due punti da soli, «2130» = 21:30); un'ora sbagliata viene detta.
- **Oggi senza foto sui telefoni bassi**: resta solo «Aggiungi un ricordo», non copre più countdown e domanda.
- «Torna a Oggi» di Foto a fuoco era invisibile ma raggiungibile da tastiera e lettore di schermo: ora è nascosto davvero.

### Premi, fase 5: temi di Oggi e countdown (26/11)

**Stato:** ramo `claude/premi-fase5-countdown-temi` (sopra le fasi 1–4). Tavola «Temi e countdown di Oggi» (https://claude.ai/artifact/Gh85EKBZ7bsKTJ72qNnZUY) approvata: «Sì, vai al codice». Migrazione `20261126020000_premi_temi_countdown.sql` solo su staging col sì; in produzione solo con un sì separato.

**Cosa cambia:**
- **Temi di Oggi**: Originale e **Pellicola** gratis (grana, una luce che entra di lato, la data di oggi stampata in arancione), **Ora d'oro** al livello 6 (luce calda e un riflesso di sole che si muove piano), **Stagioni** al 12 disegnata di nuovo: in primavera i ciliegi giapponesi in fiore dagli angoli in alto e i petali dietro la domanda di oggi, in estate il sole in alto a destra e il mare dietro la domanda, in autunno gli alberi rossi e oro, le castagne sui bordi e un letto di foglie, in inverno il vetro ghiacciato agli angoli e la neve. Non cade niente: quello lo fanno gli effetti.
- Escono **Romantico** e **Chiaro di luna**: chi li aveva torna su Originale.
- **Countdown**: Editoriale, Partenze e Vetro restano gratis. Escono Aurora, Orbita e Cromo; sugli stessi premi arrivano **Post-it** (livello 3: il tuo post-it attaccato con lo scotch, sotto quello dell'altra persona col cuoricino), **Biglietto** (9: un biglietto del treno, andata per due) e **Filo rosso** (18: i vostri due personaggi ai capi di un filo che si accorcia man mano che il giorno arriva). Tutti piccoli. Chi usava Aurora, Orbita o Cromo trova il nuovo disegno sullo stesso premio.
- Nei Premi l'anteprima dei tre countdown è quella vera.
- I widget del telefono (Android e iPhone) disegnano ancora gli stili vecchi per Post-it, Biglietto e Filo rosso: da rifare a parte.

### Premi, fase 3a e 4: Simbolo US e guardaroba (26/11)

**Stato:** rami `claude/premi-fase3-countdown-simbolo` e `claude/premi-fase4-guardaroba` (sopra le fasi 1–2). Migrazione `20261126010000_premi_simbolo.sql` solo su staging col sì.

**Cosa cambia:**
- **Simbolo US**: «Battito» (livello 2) batte due volte come un cuore con un alone nel tuo colore; «Due colori» (livello 8, nuovo) fa girare i vostri due colori dentro le lettere; «Costellazione» resta e passa al livello 17; «Riflesso» esce (il suo lampo usciva dal simbolo).
- **Guardaroba**: Gala diventa colletto e papillon vero con un luccichio, dalle Cuffie esce una nota, la Coroncina ha fiori più grandi che ondeggiano, la Corona ha le gemme che brillano; ritoccati Occhiali (montatura vera) e Sciarpina (nodo e code). Le animazioni solo dove il personaggio è grande.
- La sciarpina non esce più dal corpo quando un altro personaggio con la sciarpina è nascosto nella pagina.

### Premi, fase 2: Ti penso (26/11)

**Stato:** ramo `claude/premi-fase2-tipenso` (sopra la fase 1), verso il ramo fisso di staging. Solo app, niente SQL.

**Cosa cambia:**
- **Il premio del Ti penso si vede sempre**: parte quando apri il Ti penso, dopo la scena dei personaggi, anche se lo leggi più tardi (prima solo se arrivava con US aperta).
- **Cuori** (livello 5): escono dagli occhi a cuore di chi ti pensa, nei vostri due colori; toccandoli scoppiano.
- **Lettera** (livello 15): una busta vera nel colore di chi ti pensa, con l'interno a cuoricini e il sigillo di ceralacca col suo personaggio. Tocchi il sigillo: si spezza, il lembo si apre e il foglio viene avanti con «Ti penso» e il suo nome.

### Premi di Oggi, fase 1: effetti e temi (25/11)

**Stato:** ramo `claude/premi-fase1-effetti`, verso il ramo fisso di staging. Grill D1–D25 e tavola «Premi di Oggi» (https://claude.ai/artifact/M8dY8C3Rvu4Mwvb6Rnw362) approvata: «Approvo, vai». La migrazione `20261126000000_premi_oggi_effetti.sql` va applicata a US-STAGING col via del founder; in produzione solo con un sì separato.

**Cosa cambia:**
- **Effetti di Oggi nuovi, disegnati a mano nei vostri due colori**, di giorno e di notte. Subito e gratis: **Cuori** (coppie che si cercano salendo e si incontrano) e **Petali**. Poi **Soffioni** (livello 4), **Neve** (7), **Foglie** (10), **Stelle cadenti** (13), **Lanterne** (16) e in cima **Ricordi in volo** (20): piccole polaroid delle vostre foto vere che galleggiano su Oggi.
- **Gli effetti rispondono al dito** in Foto a fuoco: i cuori scoppiano, i petali e la neve volano via, le stelle e le lanterne partono dal dito, una polaroid apre il suo ricordo. Gli ultimi tre rispondono anche allo swipe. Con un effetto acceso si torna a Oggi con «Torna a Oggi».
- **L'effetto brilla di più** quando arriva un Ti penso, nei giorni speciali e quando salite di livello.
- **Escono** gli effetti Stelle luminose, Lucciole, Luci sfocate e Aurora, e i temi Cinema, Sogno pastello e Il vostro cielo: chi li aveva torna a «Nessuno» e «Originale».
- In Personalizza Oggi le etichette «In uso», «Incluso» e «Sbloccato» tornano piccole (erano diventate riquadri vuoti).

**In produzione:** migrazione del catalogo (col sì), sito e app (stessa versione su AAB e TestFlight).

### Gioca: gettoni e giostra dei giochi (25/11)

**Stato:** ramo `claude/gestioni-giochi-carosello-8d958b`, verso il ramo fisso di staging. Solo app (niente SQL).

**Cosa cambia:**
- **I gettoni scendono davvero:** quando parte una partita nuova il gettone vola e la scritta passa subito a «Ancora 2 su 3 oggi»; chiudendo la partita non torna più a 3. Riprendere una partita già aperta non costa niente e il gettone resta acceso.
- **Oggi per voi:** in cima ai giochi, tre carte grandi da scorrere col dito: Per voi, «Il gioco di oggi» (cambia ogni giorno) e Questo o quello. Ogni carta ha il disegno del gioco, due righe su cosa si fa, la durata e il tasto: «Gioca» col gettone che costa, «Continua», «Rispondi» o «Scopri» quando la partita è già aperta, «Domani» quando i gettoni sono finiti. La carta al centro è quella che parte.
- **Tutti i giochi:** sotto restano le schede di sempre, due per riga. Quando arriveranno altri giochi si divideranno da sole per genere (Per conoscervi, Per parlarvi, Per ridere, Per ricordare).
- **Di giorno** i gettoni spenti e il riquadro «Domani altre 3» ora si vedono.

**In produzione:** solo sito e app (stessa versione su AAB e TestFlight); nessuna migrazione.

### La vostra bacheca, tenuta da US (25/11) — fase 1

**Stato:** ramo `claude/bacheca-us`, verso il ramo fisso di staging. Grill-me D1–D27 e tavola «US · La vostra bacheca» (https://claude.ai/artifact/8LuLvzRzMcVTDmsHdKnUWG) approvata: «Approvo, vai». La migrazione `20261125230000_us_bacheca_v1.sql` va applicata a US-STAGING col via del founder. Fasi dopo: i vostri post-it, la ricerca in Ricordi (con «Appendi»), «Da appuntare» nella Mappa.

**Cosa cambia:**
- **La Bacheca in Ricordi** non è più la mappa dei posti disegnata a bacheca: è la vostra «anta del frigo», **tenuta da US**. Ci appende le vostre cose: ricordi, lettere tenute di Lasciato per te, risposte tenute della domanda di oggi, timbri dei traguardi.
- **La prima volta** la riempie con la vostra storia (fino a 8: il primo ricordo, le prime volte nei posti nuovi, un ricordo per alcuni mesi, il ricordo della settimana). Poi al massimo una cosa al giorno (un anno fa, l'anniversario, i ricordi tondi) e due il lunedì (il ricordo della settimana, una cosa tenuta). Mai una didascalia con parole delicate.
- **È uno spazio infinito**: un dito trascina, due dita (o la rotella) avvicinano, doppio tocco su una cosa la avvicina; «Adesso» porta alle cose più nuove, «Tutta la storia» allontana; la piccola mappa in basso dice dove sei. Il filo rosso è la strada della vostra storia, con gli anni scritti sul sughero.
- **Ogni cosa di US ha il suo post-it** che dice perché è lì («Un anno fa, a Padova», «Il ricordo della settimana»). Le puntine: gialle per US, nel tuo colore per le tue, nel colore dell'altra persona per le sue.
- **L'ultima parola è vostra**: toccando una cosa si apre il foglio con «Apri il ricordo», «Fissa» (US non la toglie più), «Stacca» (torna al suo posto, l'originale resta) e «Non appenderla più». Trascinandola la sposti, e diventa vostra.
- **12 cose gratis** (quelle di US e le vostre insieme); con US Plus senza limite. Quando la bacheca è piena, US fa posto solo togliendo una delle sue non fissate.
- **US lo dice col fumetto**: quando appende una cosa nuova, il fumetto dall'isola lo dice («Vi ho appeso una foto in bacheca: un anno fa eravate a Padova») e toccandolo si apre la bacheca. Conta come la battuta del giorno; le date importanti vengono prima.

**Server:** tabelle `us_bacheca_pins` (riferimento alla cosa, motivo, valori del post-it, fissata, posizione, chi l'ha spostata), `us_bacheca_bans`, `us_bacheca_planned`; regole in `private.us_bacheca_plan`; funzioni `get_bacheca_v1`, `bacheca_pin_action_v1`, `bacheca_pin_v1`. Il contenuto si legge sempre dal vivo: un ricordo cancellato esce dalla bacheca da solo. Nessuna AI.

### Lasciato per te nuovo (25/11)

**Stato:** ramo `claude/lasciato-nuovo`, verso il ramo fisso di staging. Tavola «US · Lasciato per te» (https://claude.ai/artifact/95kvj2AwMbwjXgRtiPbSmL) approvata: «perfetto puoi unire».

**Cosa cambia:**
- **Quando arriva qualcosa** si apre a schermo intero, come il Ti penso. In alto c'è il personaggio di chi l'ha lasciato e, sopra, «Lasciato per te · stamattina» (o oggi pomeriggio, stasera, ieri, una data).
- **La lettera** arriva in una busta del colore di chi la manda, chiusa da un sigillo con il suo personaggio. Si apre da sola dopo un attimo, o subito toccando il sigillo, e diventa un foglio di carta: «Da Beatrice · oggi alle 9:12», il testo scritto grande e la firma col suo personaggio.
- **La foto** diventa una polaroid con la didascalia scritta a mano; toccandola si vede grande come prima. **Il vocale** esce da un fumetto sopra il personaggio. **Video e musica** stanno in una cornice bianca, con le loro parole.
- **«Conserva» diventa «Tienila»** (per lettera e foto) o «Tienilo» (vocale, video, brano); poi «✓ Tenuta» e «Nei vostri Conservati.». Sotto: «Si apre una volta sola. Se vuoi, tienila.»
- **Per scrivere** c'è un foglio di carta che comincia col nome dell'altra persona e finisce con la tua firma. Sotto, «Aggiungi una cosa, se vuoi»: Foto, Vocale, Video, Musica, con le icone a un tono. Le parole scritte sul foglio viaggiano con la cosa aggiunta (al massimo 280 caratteri, 1000 per la lettera sola); toccando di nuovo la cosa scelta torna la lettera da sola.
- **Quando lasci qualcosa** il foglio si piega e il tuo personaggio porta la busta fino a quella in alto.
- Niente cambia sul server: stessi tipi, stessi limiti, stessa regola «si apre una volta».

### Icona dell'app e apertura nuove (25/11)

**Stato:** ramo `claude/icona-splash`, verso il ramo fisso di staging. Tavola «US · Icona e apertura» (https://claude.ai/artifact/JyMuw3y4fXnP3PCmQuxKbF): il founder ha scelto l'apertura «A».

**Cosa cambia:**
- **Icona Android:** torna quella della PWA di staging, il logo con la cornice su bianco, con la cornice sul bordo dell'icona (founder: «voglio il quadrato al confine dell'icona»). Sui telefoni con le icone tonde, che usano l'icona tonda dell'app, c'è il logo senza cornice («in quella tonda non si veda il quadrato esterno»). Le icone a scelta Notte, Oro e Neon non cambiano. Serve un APK nuovo; chi aggiorna vede l'icona nuova dopo l'aggiornamento.
- **Apertura (app installata, solo all'avvio):** parte dal colore e dal logo della splash di Android; da dietro il logo escono i vostri due personaggi, uno per lato, poi un cuoricino sopra e «il vostro spazio» sotto, e l'app si apre su Oggi. Circa due secondi (prima uno). I personaggi sono quelli dell'ultima volta, salvati sul telefono con forme e colori; alla primissima apertura, o dopo essere usciti dall'account, c'è solo il logo. Con «Riduci animazioni» non c'è.
- **Il primo istante** resta quello di Android (colore e logo con la cornice): Android non permette di disegnarci altro.

### Ti penso ricevuto coi personaggi (25/11)

**Stato:** ramo `claude/oggi-giu`, verso il ramo fisso di staging. Tavola «US · Ti penso ricevuto» (https://claude.ai/artifact/YQ12MPCHsZUiqiRd4ZXCUL) approvata dal founder il 25/11, icona dell'abbraccio «A».

**Cosa cambia:**
- **Quando arriva un Ti penso** e lo apri, il personaggio dell'altra persona scende dall'alto con gli occhi a cuore, ondeggia tra cuoricini che salgono e dice «Ti penso!» in un fumetto. Sotto: il nome e «ti pensa», e quando è arrivato.
- **Tre risposte** grandi, a un tono e col loro nome: «Un cuore», «Un abbraccio» (icona nuova: i vostri due personaggi guancia a guancia), «Anch'io» (la nuvola). Al posto di «Chiudi» c'è «Più tardi», e la X in alto.
- **Al tocco arriva il tuo personaggio** e risponde: col cuore gli manda un cuore che vola, con l'abbraccio vi stringete guancia a guancia con un cuore sopra (niente braccia, founder 25/11), con «Anch'io» sopra di voi sale una nuvoletta con un cuore. Poi la schermata si chiude da sola dopo circa due secondi.
- **Di giorno** usa la luce chiara come il resto dell'app. Con «Riduci animazioni» non c'è movimento.
- Le tre reazioni mandate al server sono le stesse di prima.

### Oggi più in basso, vicino alla barra (25/11)

**Stato:** ramo `claude/oggi-giu`, verso il ramo fisso di staging. Founder, 25/11, dall'APK: «la domanda del giorno e le altre barre sopra possono scendere un po' sotto vicino alla nav bar».

**Cosa cambia:**
- **Oggi:** la colonna in basso (la didascalia della foto, distanza e batteria, Come stai, la domanda di oggi) scende vicino alla barra, appena sopra il cuore. La striscia vuota che c'era sopra la barra era tenuta per Maudit, il gattino, che non c'è più dal redesign; la regola che doveva toglierla cercava un elemento sparito e non scattava mai. La foto resta più libera in alto.

### US vi ricorda: i personaggi parlano (25/11)

**Stato:** ramo `claude/us-ricorda`, verso il ramo fisso di staging; la migrazione va applicata a US-STAGING col via del founder. Su staging prova solo il founder; in produzione forse direttamente con la seconda versione (founder, 25/11). Progetto: `docs/product/2026-11-25-us-vi-ricorda.md`, tavola «US · US vi ricorda» (https://claude.ai/artifact/DTNvLPsQM8ZVATXuhxUUpv), approvata: «Approvo la tavola».

**Cosa cambia:**
- **US si ricorda le vostre cose e ogni tanto ve le dice**, al massimo una volta al giorno e solo quando c'è qualcosa di vero, dalle 9 alle 21 (i ricordi dalle 17):
  - il compleanno dell'altra persona, 7 giorni prima, il giorno prima e il giorno stesso, detto solo a te;
  - l'anniversario, una settimana prima a ognuno come sorpresa e il giorno stesso a tutti e due;
  - i mesiversari e i giorni tondi (100, 200…);
  - «un anno fa»: un ricordo (col luogo), un «Ci vediamo» o un'idea fatta, a uno dei due a turno;
  - le prime volte in un posto nuovo e i numeri tondi dei ricordi;
  - «ti aspetta», quando l'altro ha risposto o giocato e tu no;
  - una domanda per conoscervi quando manca qualcosa (il tuo compleanno, il primo ricordo), mai due giorni di fila.
- **Il fumetto:** quando c'è una battuta l'isola si apre da sola, i personaggi si affacciano e dal tuo esce un fumetto con la frase; per le cose di coppia parlano tutti e due. La prima volta si presentano. Il livello nuovo ora si dice anche lui col fumetto, coi personaggi in festa. Dopo 8 secondi si richiude.
- **La scheda:** toccando il fumetto si apre la scheda con la frase, la foto del ricordo se c'è, il tasto del gesto già pronto (Lasciato per te col testo o con la foto dentro, Ricordi, il calendario per il compleanno, la domanda, Gioca) e «Non ora». Si manda sempre da sé: US non manda niente per nessuno.
- **Dire di no:** tenendo premuto il fumetto, o dalla scheda, «Non dirmelo più» spegne quel tipo di battuta. In Profilo › Notifiche c'è «Le voci dei personaggi», acceso di base.
- **Nella scheda Voi** dell'angolo, «Oggi ti ho detto» tiene la battuta del giorno fino a sera.
- **Isola:** quando era aperta, un tocco sulla busta o sul profilo apriva l'angolo; ora lo apre solo il tocco sull'isola.
- **Le frasi** sono scritte a mano, 5 varianti per tipo, solo in italiano per ora.

**Server:** nuova migrazione `20261125200000_us_vi_ricorda_v1.sql`: le tabelle `us_battute` (la battuta del giorno di ognuno: tipo e pochi valori, mai il testo), `us_battute_planned` e `us_battute_mute`; le regole in `private.us_ricorda_plan_couple` (solo dati che entrambi vedono già, con una lista di parole delicate escluse); le funzioni `get_my_battuta_v1`, `mark_my_battuta_v1`, `set_my_battute_mute_v1`. La giornata della coppia si prepara alla prima apertura dell'app di quel giorno, senza lavori programmati. Nessuna AI: i dati non escono da US.

### Tocchi pronti dopo ogni foglio (25/11)

**Stato:** in staging il 25/11 (PR #303, merge 55c88bcf). Founder, 25/11: «i tap non sono reattivi sul calendario».

**Cosa cambia:**
- **La causa:** chiuso un foglio (il giorno di Noi, ma anche gli altri), l'app restava bloccata finché il foglio non finiva di sparire. Per il giorno di Noi, che non aveva una sua animazione d'uscita, il blocco durava un secondo intero: il tocco sul giorno dopo si perdeva.
- **Ora:** un foglio che sta uscendo conta già come chiuso, e la pagina sotto risponde subito, ovunque nell'app. Nel calendario ogni tocco apre il giorno in circa 25 millisecondi, anche subito dopo averne chiuso un altro.
- **Il giorno di Noi** sale e scende come gli altri fogli del calendario, con la maniglia in alto.

**Server:** niente.

### Icone a un tono e il giorno in un riquadro (25/11)

**Stato:** in staging il 25/11 (PR #302, merge afbe1ecc, sito …-safbe1ecc). Founder, 25/11: «togliamo ora il doppio colore dalle icone che non mi piace più», poi «premendo il giorno si apra una sorta di popup con scritto gli impegni di quel giorno, togliendo la barra di sotto inutile».

**Cosa cambia:**
- **Icone a un tono:** le icone tornano a un solo tratto nel loro colore. Esce il pieno nel colore dell'altra persona sotto il contorno (le «icone a due toni» del 24/11), anche nella barra in basso: la pagina aperta torna un'icona piena in un colore solo.
- **Il giorno in un riquadro:** in Noi la scheda del giorno scelto sotto il calendario esce. Toccando un giorno sale dal basso un riquadro con il giorno, i suoi ricordi, gli impegni, i giorni speciali coi personaggi e «Aggiungi a questo giorno». Si chiude con la X, toccando fuori o col tasto indietro. Quello che apri da lì (un impegno, un ricordo, il modulo per aggiungere) sale al posto del riquadro.
- **Noi** ora va dal prossimo incontro al calendario e poi alla lavagna.

**Server:** niente.

### L'isola e Il vostro angolo in tre parti (25/11)

**Stato:** in staging il 25/11 (PR #301, merge bc1a92cb, sito …-sbc1a92cb). Founder, 25/11, sulla tavola «US · Oggi e il vostro angolo» (https://claude.ai/artifact/QtAJmuJTt6cRvertx7ycJm): «Voi, guardaroba, premi mi piace perché divide il tutto», ma i personaggi grandi sulla foto «coprono la foto»; poi la sua idea dell'isola, provata sulla tavola: «Molto bello, proviamo come hai consigliato».

**Cosa cambia:**
- **L'isola:** il simbolo US in alto sta in una piccola capsula. Toccandolo, la capsula si allarga in «Il vostro angolo · Livello N · tocca qui» e i due personaggi si affacciano da dentro, uno dopo l'altro. Un secondo tocco apre l'angolo; se non la tocchi, dopo 6 secondi torna il simbolo. Il disegno del simbolo è lo stesso, e gli effetti del simbolo (premi della Sintonia) restano. Senza la coppia completa resta solo il simbolo.
- **Si apre da sola:** la prima volta in Oggi, coi personaggi che mandano un cuore, e ogni volta che arrivate a un livello nuovo, coi personaggi in festa. Ogni telefono se lo ricorda per conto suo.
- **Via i personaggi dalla foto:** il bottone dei personaggi sopra la data in Oggi esce, perché ora la strada è l'isola.
- **Il vostro angolo:** in cima i personaggi e il livello, poi tre schede.
  - **Voi:** «La vostra settimana», con un cuore per ogni giorno fatto insieme, l'iniziale del giorno e oggi cerchiato; senza giorni dice «Iniziate oggi: basta una risposta alla domanda». Poi «Per crescere insieme»: la domanda di oggi, Gioca, Ricordi e Ti penso, Le vostre idee, ognuna col tasto che porta lì. Poi gli ultimi progressi, aperti, e come cresce la Sintonia.
  - **Guardaroba:** forma, testa, viso, come prima. «Cambia look» dal Profilo apre direttamente questa scheda.
  - **Premi:** il prossimo sblocco e i vostri sblocchi.
- **Il ritmo** diventa «3 giorni di fila»; a zero giorni non mostra più «0 giorni».

**Server:** niente.

### Noi, Fase B.3: «Bea ti ha lasciato un post-it» (25/11)

**Stato:** in staging il 25/11 (PR #300, merge 6e0aa473); `send-web-push` pubblicata su staging (run 45569314713). Founder, 25/11: «Chiudiamo Noi come hai proposto». Decisione D15 del grill-me di Noi.

**Cosa cambia:**
- **L'avviso:** chi scrive un post-it nuovo, quando lo chiude con qualcosa scritto, fa arrivare alla sua persona «Bea ti ha lasciato un post-it». Toccato, apre la lavagna.
- **La stessa regola della lavagna:** stesso interruttore in Profilo › Notifiche, che ora dice «Quando la tua persona disegna o ti lascia un post-it». Al massimo un avviso ogni 2 ore, condiviso col disegno: se in un'ora disegni e lasci un post-it, arriva un avviso solo. Contano solo i post-it scritti da te negli ultimi 30 minuti.
- **Android:** il telefono scrive l'avviso da sé, dal tipo «postit». Le app installate prima di questa versione mostrano l'avviso generico di US finché non si aggiornano.

**Server:** la funzione `send-web-push` accetta il tipo `postit` (`dispatchPostitPush` in `_shared/lavagna-push-core.mjs`) e registra l'avviso come uno della lavagna. Nessuna migrazione.

### Noi, Fase B.2: le idee diventano impegni, «L'avete fatto?», le penne della coppia (25/11)

**Stato:** in staging il 25/11 (PR #299, merge fafe2b95, sito …-sfafe2b95). Founder, 25/11: «Push e unione poi andiamo avanti con il resto». Decisioni D12 e D13 del grill-me di Noi; tavola «US · Noi, il vostro tempo» (schermate Idee e Fatto).

**Cosa cambia:**
- **Le vostre idee:** in primo piano, ogni idea ha il pallino del colore di chi l'ha avuta. Accanto c'è «Scegli il giorno», che chiude il post-it e fa scegliere il giorno nel calendario di Noi (la stessa scelta del dettaglio dell'idea); poi l'idea diventa un impegno e mostra «Fissata» col suo giorno. Se la tua persona dice che l'avete fatta, c'è «Sì, fatto» per confermare. In fondo c'è il campo «Un'idea nuova» e quante ne avete già fatte. Esce la spunta «vissuta» sul post-it (D13).
- **«L'avete fatto?»:** il giorno dopo un impegno nato da un'idea (o dopo l'ultimo giorno, se durava di più), aprendo Noi sale un foglio coi due personaggi. «Sì, l'abbiamo fatto» segna l'idea come fatta, con la stessa regola in due di prima, e propone una foto in Ricordi. «Non ancora, scegliamo un altro giorno» apre l'impegno per spostarlo. Lo chiede una volta sola per idea e solo per la settimana dopo (D13).
- **Le penne della lavagna:** sono il tuo colore, quello della tua persona, quello di Noi e il bianco, nei colori scelti dalla coppia. L'ambra esce: i tratti già fatti in ambra prendono il colore di Noi, quelli in rosa e lilla il colore di Francesco e di Beatrice. Anche il widget della lavagna disegna coi colori della coppia (D12).

**Server:** niente. Le penne usano le stesse chiavi che il server già tiene (rosa, lilla, ambra, latte), con un significato nuovo.

### Noi, Fase B.1: La lavagna con i post-it sopra (25/11)

**Stato:** in staging il 25/11 (PR #298, merge a436904f, sito …-sa436904f); migrazione applicata a US-STAGING il 25/11 con «Supabase SQL (manual)» (run 45568004170), in produzione no. Founder, 25/11: «non abbiamo ancora inserito i post-it all'interno di lavagna», poi «si concordo» al piano (Fase B dopo gli interruttori). Decisioni D3–D5, D11, D12 del grill-me di Noi e tavola «US · Noi, il vostro tempo» (schermate Main e Lavagna).

**Cosa cambia:**
- **«La lavagna» al posto di «Bacheca»:** in Noi, sotto il giorno scelto, il disegno della lavagna più grande, con «+ Post-it» e «Apri». Sopra il disegno, i tre post-it più recenti e, nell'angolo in alto a destra, «Le vostre idee» con quante ne restano da vivere. Senza disegno e senza post-it, i due personaggi invitano a disegnare (D3, D5, D11).
- **La lavagna a schermo intero:** si chiama «La lavagna». Mostra i sei post-it più recenti sopra il disegno e il tasto «+ Post-it» sul tabellone. Ogni post-it si trascina con un dito e resta dove lo lasci, per tutti e due (D4). Quelli mai spostati prendono un posto libero, in due colonne.
- **Il post-it in primo piano:** toccato, un post-it viene davanti sopra un velo scuro, e lì si scrive, si spunta la lista e si stacca. Lo stesso vale per «Le vostre idee». Il tasto indietro e un tocco fuori lo chiudono salvando.
- **La carta di chi scrive:** il post-it ha il colore di chi l'ha scritto, tu o la tua persona. Esce la scelta della carta (giallo, rosa, azzurro, verde). In «Tutti i post-it» i filtri sono Tutti, Tuoi e quelli della tua persona (D12).
- **Non in questa fase:** «Scegli il giorno» per le idee, «L'avete fatto?», le penne tu/partner/Noi/bianco senza ambra e il widget (B.2); l'avviso «X ti ha lasciato un post-it» (B.3).

**Server:** nuova migrazione `20261125120000_couple_notes_posto.sql`, con le colonne `couple_notes.board_x` e `board_y` (da 0 a 1, vuote finché il post-it non si sposta) e un vincolo. Il controllo dei post-it (`private.couple_notes_guard`) fa crescere la revisione anche per uno spostamento, ma lascia com'erano chi l'ha cambiato e quando: il post-it continua a dire «Bea · ieri». Finché la migrazione non c'è, l'app legge i post-it senza posto e lo spostamento resta solo sul telefono. L'esportazione dei dati non cambia.

### Interruttori più chiari (25/11)

**Stato:** ramo `claude/interruttori`, verso il ramo fisso di staging. Founder, 25/11 (screenshot del nuovo impegno): «studia questi bottoni on/off, fai vedere meglio il bordo e quando sono accesi colorali».

**Cosa cambia:** gli interruttori hanno un bordo ben visibile da spenti e si colorano da accesi: di notte con la sfumatura dei vostri due colori, di giorno in ceralacca; il pallino è bianco con un'ombra. Vale per il nuovo impegno («Ci vediamo», «Ogni anno»), gli eventi, il Profilo e le sue finestre. Prima l'acceso restava scuro: una regola generale dei campi copriva il colore.

**Server:** niente.

### Oggi: il velo in fondo alla foto (25/11)

**Stato:** ramo `claude/oggi-velo`, verso il ramo fisso di staging. Founder, 25/11: «il velo è carino, lo farei un po' meno accentuato e lo metterei anche alla dark mode, ovviamente nera».

**Cosa cambia:** in Oggi la foto sfuma in fondo, sopra la barra, con la stessa forma di giorno e di notte: trasparente fino a metà, poi un velo che sale piano senza mai coprire del tutto. Di giorno è color carta e più leggero di prima; di notte è nero e sostituisce la fascia scura di prima, che diventava nero pieno. Anche nell'app nativa.

**Server:** niente.

### Transizioni: come in produzione, col colore sfumato (25/11)

**Stato:** ramo `claude/transizioni-ogni-tocco`, verso il ramo fisso di staging. Founder, 25/11: «se passo velocemente da una pagina all'altra non è reattivo, non rifà una nuova transizione», poi «vedi su produzione com'è reattivo, devi fare la stessa cosa qui in staging solo con il gradiente che abbiamo».

**Cosa cambia:**
- **La logica di produzione:** il colore copre in 260 ms; mentre sale, un tocco su un'altra scheda gli fa cambiare subito colore e pagina di arrivo (sulla scheda di partenza il colore torna indietro); a pagina cambiata, un tocco fa partire subito una transizione nuova. Prima ogni tocco a metà cambiava pagina di colpo.
- **Col colore sfumato:** il cerchio che copre ha il bordo morbido, e la pagina nuova si apre da un buco morbido che si allarga dal tasto (in produzione entrambi hanno il bordo netto). Sui telefoni che non sanno animare il buco, il colore si dissolve.
- **Giorno e Notte:** i colori delle schede si ricordano anche per tema; prima, dopo un cambio di Aspetto (o Automatico al tramonto), il colore tra le pagine restava quello del tema di prima.

**Server:** niente.

### Noi, Fase A: il vostro tempo insieme (24/11)

**Stato:** ramo `claude/revisione-temi-transizioni`, verso il ramo fisso di staging; la migrazione va applicata a US-STAGING col via del founder. Founder, 24/11: «noi è ancora uguale a prima»; decisioni del grill-me D1–D16 e tavola «US · Noi, il vostro tempo» (https://claude.ai/artifact/WZ1Q5PgRMq6VaJmuY9gpUh).

**Cosa cambia:**
- **Un calendario solo:** escono «Mese / Prossimi» e la vista «Prossimi». Il calendario del mese resta com'è (D1–D2).
- **«Vi rivedete tra»:** per le coppie a distanza (`couples.distance_mode = far`) una scheda in cima con i due personaggi ai lati e un timer in giorni, ore e minuti, verso il prossimo impegno con «Ci vediamo» acceso. Il giorno stesso dice «Oggi vi vedete» e i personaggi hanno il cuore (D6).
- **Un modulo solo:** «Che cosa», «Quando» (si può cambiare anche creando), «Ora · se c'è» (senza ora è tutto il giorno; con l'ora dura un'ora, o quanto durava se lo modifichi), «Solo mio / Nostro», gli interruttori «Ci vediamo» (lo rende Nostro) e «Ogni anno» (lo salva tra le date che tornano ogni anno, negli eventi). «Data speciale» non c'è più. Nel database impegni ed eventi restano separati (D7–D8).
- **Giorni speciali:** nel giorno scelto i due personaggi vestiti per l'occasione: compleanno (cappello da festa), mesiversario e cento giorni (festa), «Ci vediamo» (cuore). Il giorno dell'anno in US dice «il vostro anno è pronto da sfogliare» con «Apri Il vostro anno» (D10, D14).
- **Non in questa fase:** il promemoria nel modulo; la lavagna con post-it e idee, gli avvisi (Fase B); «Bacheca» di Noi resta col suo nome fino alla Fase B.

**Server:** nuova migrazione `20261124233000_calendario_ci_vediamo.sql`: colonna `calendar_entries.ci_vediamo boolean not null default false` e un indice parziale. Finché non c'è, l'app legge e scrive come prima (senza «Ci vediamo»).

### Revisione di transizioni e temi (24/11)

**Stato:** ramo `claude/revisione-temi-transizioni`, verso il ramo fisso di staging. Founder, 24/11: «le transizioni non vanno ancora bene e i temi light e dark hanno un po' di problemi».

**Cosa cambia:**
- **Transizioni:** il cerchio di colore è piccolo (480 px), disegnato una volta su un livello che resta sempre nella pagina, e la GPU lo ingrandisce: prima era un livello da circa 4000 px che il telefono ridisegnava a pezzi mentre cresceva. I colori delle schede si leggono in un momento quieto, così il primo tocco non paga un ricalcolo. I blocchi della pagina nuova entrano subito, 30 ms l'uno dall'altro.
- **Giorno:** scritte piccole e testo d'esempio nei campi più scuri; il titoletto sopra i fogli in ceralacca (prima era rosa pastello e non si leggeva); scritte nei colori della coppia più scure; verde più scuro. I visori delle foto e la fotocamera restano scuri, come la galleria del telefono.
- **Controllato:** contrasto di ogni scritta su 18 fogli, di giorno e di notte.

### Aspetto: Giorno e Notte (24/11)

**Stato:** in staging dal 24/11 (PR #293, merge `6e568df5`, sito `…-s6e568df5`). Founder, 24/11, dalla tavola «US · Quaderno, giorno e notte»: «Mi vanno bene i consigli sulle tre scelte, mi piace, applica il tema light e quello dark con la possibilità di scelta nelle impostazioni».

**Cosa cambia:**
- **Giorno, il Quaderno:** carta (`#f3ece1`) per le pagine, fogli (`#fbf7f0`) per le schede, inchiostro (`#231b1d`) per le parole, ceralacca (`#b8452f`) per i tasti, per la scheda aperta nella barra e per le scritte piccole sopra i titoli. I vostri colori sono gli stessi che avete scelto, più polverosi, perché sulla carta si leggano: personaggi, «chi l'ha messo», nastri.
- **Notte:** è la notte di adesso, identica.
- **Profilo › Aspetto:** Automatico (segue il tema chiaro o scuro del telefono), Giorno o Notte. Vale per quel telefono. Il tema si applica prima che la pagina si disegni, quindi niente lampo scuro.
- **Oggi:** la foto resta una foto. Scritte e icone sopra restano chiare, la foto sfuma nella carta, la scheda della domanda è di carta, «Come stai?» è un'etichetta di carta.
- **Polaroid e post-it:** restano di carta anche di notte, come prima.
- **Per ora sempre di notte:** accesso, primo avvio, il giro con i personaggi, l'attesa del partner e il blocco con l'impronta, che hanno un disegno notturno approvato.
- **Controllato:** il contrasto di ogni scritta visibile, di giorno e di notte, su Oggi, Noi, Ricordi, Gioca, Profilo e sui fogli (domanda, Come stai, countdown, angolo, nuovo impegno, Prossimi, nuovo ricordo, bacheca, Ti penso).
- **Da fare a parte:** su Android ora, batteria e notifiche in alto restano bianche anche di giorno (serve un plugin nativo e un APK nuovo); i widget e l'anteprima nel Profilo restano scuri; non ho ancora controllato tutti i fogli rari (giochi in corso, lettere, album, Il vostro anno).

**Server:** niente.

### Transizioni fluide (24/11)

**Stato:** in staging dal 24/11 (PR #291, merge `cb9d0c11`, sito `…-scb9d0c11`); la parte «reattiva» sul ramo `claude/transizioni-reattive`, verso il ramo fisso di staging. Founder, 24/11: le transizioni «al momento sono veloci ma se ci fai caso non fluide», poi, provate su staging: «se cambi velocemente le pagine non reagiscono, forse sono un po' lentine».

**Cosa cambia:**
- **Reattive:** un tocco sulla barra mentre il colore si muove cambia pagina subito (36–82 ms col telefono medio simulato) e il colore rimasto sfuma in 160 ms; prima ogni tocco aspettava la fine del cerchio e ne faceva partire un altro. Il cerchio è anche più corto: 460 ms, dissolvenza 300 (circa 0,8 secondi in tutto).
- **Cambio pagina dalla barra:** il colore che copre lo schermo ora è un disco che si allarga con una trasformazione, sulla GPU. Prima era un ritaglio (clip-path) ridisegnato a ogni frame dal processore, e si fermava quando il telefono era occupato. La pagina cambia appena il colore copre lo schermo, poi il colore si dissolve mentre salgono i blocchi della pagina nuova. Al posto del «buco» che si apriva dal tasto c'è la dissolvenza. **Niente bordo netto:** il cerchio è pieno fino a metà e poi sfuma, così nasce dal tasto come un bagliore e prende la pagina piano piano, poi si dissolve. Founder, 24/11: su una prima versione a 300 ms «non sono un po' troppo veloci?»; poi «volevo eliminare il bordo netto e fare sì che prendesse piano piano la pagina» (un'onda dal basso provata in mezzo è stata scartata).
- **Profilo:** stesso scorrimento di prima, con la curva più morbida.
- **Suoni:** la preparazione dell'audio (la prima volta costa un frame lungo) non cade più in mezzo a un cambio pagina.
- **Misurato:** il colore pieno resta 70–100 ms con la CPU normale e 115–150 ms con la CPU rallentata 4 volte (un telefono medio), il tempo di preparare la pagina sotto; la marea non si blocca più a metà.

**Server:** niente.

### Redesign: uno stile solo (24/11)

**Stato:** in staging dal 24/11 (PR #290, merge `449d3bda`). Founder, 24/11, dalla tavola «Una mano sola» (fogli «Gioca · com'è adesso», «Gioca · una mano sola», «Le regole di disegno»): «Concordo».

**Cosa cambia:**
- **Personaggi:** contorno sottile nel colore scuro della loro forma, mai nero, e niente più alone chiaro intorno (Oggi, angolo, Profilo, Gioca, intro). Le guance prendono lo stesso tono.
- **Icone dei giochi ridisegnate:** sono i due personaggi che giocano (Per voi, Scopritevi con la lente, Confrontatevi coi due fumetti, Ridete, Quanto mi conosci, Rivivete con la polaroid, Questo o quello con le due carte), solo nei vostri due colori più il chiaro della carta; esce l'ambra.
- **Via «Pronto»:** una casella pronta non ha etichetta; restano «Giocato» e «Domani».
- **Da decidere:** i temi e gli effetti di Oggi e i countdown oro e cromo hanno colori loro (ricolorarli coi vostri due, o tenerne pochi).

**Server:** niente.

### Redesign: icone a due toni e sfondo nero caldo (24/11)

**Stato:** icone in staging dal 24/11 (PR #288, merge `64660439`), nero caldo dal 24/11 (PR #289, merge `ed27d331`). Founder, 24/11, dalla tavola «US · icone e colori»: «Possiamo provare B e marea», poi, provati Marea, Due luci e Aurora: «Nero caldo».

**Cosa cambia:**
- **Icone a due toni:** sotto il contorno di ogni icona c'è la sua versione piena ufficiale di Phosphor nel colore dell'altra persona, a metà. Le icone senza versione piena (croce, più, frecce) restano a una linea; sui tasti colorati il riempimento non c'è. Anche la barra in basso: il riempimento dell'altra persona sotto ogni icona, più forte su quella aperta.
- **Sfondo nero caldo:** nessuno sfondo colorato e niente più luce colorata in alto: un nero appena caldo (`#120d11`) su tutte le pagine; il colore della coppia sta nelle cose (personaggi, icone, nastri, gettoni). Marea e le varianti per confrontarle (`?sfondo=…`) sono state tolte.
- 27 icone piene nuove in `assets/icons/phosphor/` (file ufficiali Phosphor, licenza MIT), in cache.

**Server:** niente.

### Redesign, fase 8: Ricordi a polaroid e la bacheca (24/11)

**Stato:** in staging dal 24/11 (PR #287, merge `19bddbbf`, sito `…-s19bddbbf`). Founder, 24/11: «Vai allora andiamo avanti». Missione: [redesign-definitivo.md](../missions/redesign-definitivo.md), D12; tavole «Ricordi», «Bacheca» e «Bacheca intera» approvate il 23/11.

**Cosa cambia:**
- **La Raccolta a polaroid:** due per riga, mese per mese, un po' storte, col nastro nel colore di chi ha messo la foto, la didascalia scritta sotto (in corsivo) e il giorno.
- **Raccolta · Bacheca · Mappa** in cima a Ricordi al posto del tasto «Mappa».
- **La bacheca da detective:** i posti sono cartellini appuntati, messi come su una cartina vera (nord in alto), con fino a tre polaroid intorno e «+N» se ce ne sono di più; un filo rosso unisce i posti nell'ordine in cui ci siete stati la prima volta. Il cartellino apre la mappa lì, la polaroid apre il Ricordo.
- **«Da appuntare»:** i Ricordi senza posto, con «Aggiungi il posto».
- Si dispone da sola con quello che la pagina ha già: nessun dato nuovo, nessuna lettura in più.

**Server:** niente. **Da sapere:** la didascalia è in Fraunces corsivo, perché l'app non ha un carattere scritto a mano (Caveat, nella tavola, andrebbe aggiunto). Il centraggio delle facce (#279) non c'è ancora: le polaroid tagliano la foto al centro.

### Redesign, fase 7: l'intro con i personaggi (24/11)

**Stato:** in staging dal 24/11 (PR #287, merge `19bddbbf`). Founder, 24/11: «Vai allora andiamo avanti». Missione: [redesign-definitivo.md](../missions/redesign-definitivo.md), D14; tavole dell'intro approvate il 23/11.

**Cosa cambia:**
- **Il giro prima dell'accesso** sono tre scene con i due personaggi (un tondo rosa e un quadrato lilla): uno accanto all'altro con «Un posto solo per voi due», un Ti penso che vola dall'uno all'altro (occhi a cuore), la festa dentro l'anello della Sintonia.
- **«Chi sei in US?»** al posto del passo coi cerchi: chi crea la coppia e chi entra scelgono la forma (Tondo, Quadrato, Triangolo, Goccia, Nuvola) e il colore, e vedono subito il loro personaggio. La forma si salva come nel guardaroba.
- **Nell'attesa** il tuo personaggio aspetta accanto al posto vuoto dell'altra persona, sopra il codice.
- **Quando l'altra persona entra**, chi aspettava vede «Ora siete in due» coi due personaggi che fanno festa.

**Server:** niente di nuovo (usa `set_my_character_shape`, già su US-STAGING con le migrazioni dei personaggi, non in produzione).

### Redesign, fase 6: Gioca con i gettoni (24/11)

**Stato:** in staging dal 24/11 (PR #287, merge `19bddbbf`). Founder, 24/11: «Vai allora andiamo avanti» (le fasi 6–8, poi un controllo insieme). Missione: [redesign-definitivo.md](../missions/redesign-definitivo.md), D10 e D11; tavole «Gioca» e «Gioca, gettoni finiti» approvate il 23/11.

**Cosa cambia:**
- **Tre gettoni grandi in cima a Gioca** al posto del contatore con i tre pallini: «Ancora 2 su 3 oggi · Ogni partita nuova usa un gettone». Il numero resta quello del server.
- **Il gettone vola nel gioco** quando parte una partita nuova, al posto della finestra «Userete 1 delle 3 partite di oggi» (anche quella per rigiocare un gioco della settimana). Con «Riduci movimento» il gettone si spegne e basta.
- **A zero gettoni:** «Domani altre 3» con l'ora del rinnovo («tra 6 ore e 12 minuti», mezzanotte di Roma) e, solo lì, la riga «Partite illimitate con US Plus · In arrivo» con «Avvisami».
- **«Vi aspetta» in alto:** le partite dove tocca a te o dove le risposte sono pronte, col personaggio dell'altra persona, il gioco, «Bea ha giocato, tocca a te» e un tasto («Gioca» o «Scopri»).
- **I vostri giochi:** Per voi è la prima casella (nel colore della pagina), poi i cinque giochi e Questo o quello in fondo. Ogni casella dice una cosa sola: **Pronto**, **Giocato** o **Domani**; sotto, il tipo di gioco o a che punto siete.
- **Esce la sfida della settimana** (D10): niente più scheda in Gioca né pallino su Gioca per la foto dell'altra persona. I dati restano, si nasconde soltanto.
- **Esce la striscia dei 7 giorni** in cima a Gioca: era legata alla domanda di oggi, che è già uscita da Gioca.
- Restano «La vostra domanda», «Da continuare» (solo per le partite che nessuna casella rappresenta) e «Partite completate».

**Server:** niente. **Da decidere:** le notifiche della sfida della settimana (lunedì e sabato) partono ancora dal server: vanno fermate prima della produzione, e su staging col via del founder.

### Redesign, fase 5: Oggi senza schede di suggerimento (24/11)

**Stato:** in staging dal 24/11 (PR #286, merge `48335bb5`, sito `…-s48335bb5`). Founder, 24/11: «Fase 5 vai». Missione: [redesign-definitivo.md](../missions/redesign-definitivo.md), D9.

**Cosa cambia:**
- **Via la zona delle schede su Oggi.** Sopra la barra restano la didascalia della foto, la riga (prossimo impegno, distanza, Come stai) e la domanda di oggi. Ogni avviso che passava di lì ha ora il suo posto.
- **Ti penso ricevuto:** un avviso breve in alto, «Bea ti pensa ♡» con «Apri» (le reazioni), una sola volta per ogni Ti penso su quel telefono: subito se US è aperta, altrimenti la prima volta che la apri entro un giorno. Restano gli occhi a cuore del tuo personaggio per 3 ore. Dalla notifica il foglio delle reazioni si apre da solo, senza avviso sopra.
- **Lasciato per te:** il pallino sulla busta, uno solo, nel colore di chi l'ha lasciato (prima erano due, rosa e lilla).
- **Tocca a te:** quando l'altra persona vi aspetta in una partita (o in «Per voi»), il pallino è su Gioca; quando ha già risposto alla domanda di oggi e tu no, resta su Oggi.
- **Risposte pronte:** lo dice la scheda della domanda («Risposte pronte · Scopri», i due personaggi vicini con il cuore) finché non le apri; prima era una scheda a parte, che si poteva nascondere scorrendo. La funzione del server che la nascondeva resta per le app già uscite.
- **Mesiversario, anniversario e ogni 100 giorni insieme:** la festa dei personaggi (per i 100 giorni è nuova; prima era una scheda).
- **Notifiche:** niente invito su Oggi. Le chiede l'iscrizione; dopo, Profilo › Notifiche mostra lo stato e le attiva. Sul telefono, se dopo «Attiva» la rete non risponde, lì si legge «In attivazione · Le attivo appena la rete risponde» con «Riprova» (prima lo diceva la scheda di Oggi).
- **«La cosa di oggi»:** via i passi della prima settimana (pallini, «Fatto ♡ · Domani: …», «Settimana finita»). Il server li conta ancora. Restano la serie, «Manda un Ti penso» e «Oggi c'eravate voi due ♡».
- **La domanda «Vi vedete spesso?»** non compare più su Oggi: si sceglie in Impostazioni › Voi.
- **La sfida della settimana** non è più su Oggi (D10). In Gioca resta fino alla fase 6, e la foto dell'altra persona accende ancora il pallino su Gioca.

**Server:** niente.

**Test:** `tests/oggi-pulita-fase5.test.js` e `tests/m12a-oggi-priority.test.js` (riscritto); aggiornati i test che descrivevano le schede.

### Redesign: il guardaroba sui livelli vuoti della Sintonia (24/11)

**Stato:** in staging dal 24/11 (PR #285, merge `58bac1b0`, sito `…-s58bac1b0`); migrazione applicata su US-STAGING il 24/11 (run 45288670020), non in produzione. Decisione del founder del 24/11 («proposta A», tenendo il Simbolo US).

**Cosa cambia:**
- Dopo l'uscita di Atmosfere, Colore di Noi, compagni e accessori, i livelli 8, 11, 14 e 19 non davano più niente. I primi cinque accessori del guardaroba restano dove sono (occhiali 150 punti, cappello 400, fiocco 700, sciarpina 1000, occhiali da sole 1350); gli ultimi quattro arrivano con quei livelli: gala al livello 8 (4550 punti), cuffie all'11 (8750), coroncina al 14 (14300), corona al 19 (26550). I momenti (macchinetta, fascia dei 100, cappello da festa) non cambiano.
- Il momento del nuovo livello nomina l'accessorio che arriva («Gala nel guardaroba») e, se non ci sono altri premi, il tasto «Prova il look» apre il guardaroba nell'angolo.
- Il Simbolo US resta tra i premi della Sintonia (livelli 6, 9 e 13), come prima.

**Server:** nuova migrazione `20261123231417_personaggi_scala_premi.sql` (dopo quella del guardaroba): cambia le soglie in `private.character_unlocks` e toglie a chi lo porta un accessorio che con la scala nuova non è più sbloccato. **Solo staging** finché il founder non dice altro; in produzione va con le altre due dei personaggi, prima del sito.

**Test:** `tests/personaggi-scala-premi-db.test.js` (database) e `tests/personaggi-scala-premi.test.js`.

### Redesign, fase 4: i personaggi al posto dei cerchi e il guardaroba (23/11)

**Stato:** in staging dal 23/11 (PR #284, merge `f0bc68fe`, sito `…-sf0bc68fe`). Missione: [redesign-definitivo.md](../missions/redesign-definitivo.md), D2 e D4.

**Cosa cambia:**
- **La domanda di oggi su Oggi:** al posto dei due cerchi, i due personaggi (il tuo a sinistra, il suo a destra). Il posto di chi non ha ancora risposto è tratteggiato; quando avete risposto tutti e due si avvicinano e tra loro sale un cuore. Se rispondi per secondo, li vedi avvicinarsi.
- **La Sintonia nell'angolo:** via i due cerchi; i due personaggi in cima all'angolo stanno più vicini quanto più siete vicini al livello successivo, e a un livello nuovo saltano insieme.
- **La scheda della coppia nel Profilo:** i due personaggi al posto dei cerchi con l'iniziale o la foto.
- **Le reazioni dei personaggi** (portate da staging): festa con i coriandoli nel giorno del mesiversario e dell'anniversario; occhi a cuore per 3 ore dopo un Ti penso ricevuto (il proprio personaggio); l'altro saluta con la mano quando ha già risposto alla domanda e tu no; assonnati dalle 22 alle 6. Senza animazioni con il movimento ridotto.
- **Il guardaroba nell'angolo** («Il tuo guardaroba»): la forma (tondo, quadrato, triangolo, goccia, nuvola), una cosa in testa e una sul viso o al collo, con le soglie già decise il 21/11 e controllate dal server (occhiali 150 punti, cappello 400, fiocco 700, sciarpina 1000, occhiali da sole 1350, gala 1700, cuffie 2100, coroncina 2550, corona 3000, poi spostate il 24/11, vedi sopra; macchinetta al primo Ricordo, fascia dei 100 a 100 giorni, cappello da festa al primo anno). Sotto, il prossimo da sbloccare con la barra. Nel Profilo, «Cambia look» porta lì.
- Il personaggio in alto a destra e quelli sulla foto mostrano subito il nuovo look.

**Server:** usa `set_my_character_look`, `set_my_character_shape` e `my_character_unlocks` delle migrazioni dei personaggi (già su US-STAGING; in produzione vanno prima del sito, vedi sotto).

**Non ancora:** la scala nuova dei premi della Sintonia (fatta il 24/11, vedi sopra). Il passo del colore all'iscrizione resta con i cerchi fino alla fase 7 (intro).

**Test:** `tests/personaggi-fase4.test.js` più i test aggiornati.

### Redesign: la domanda esce da Gioca, la Sintonia va in «Il vostro angolo» (23/11)

**Stato:** in staging dal 23/11 (PR #283, merge `cccc4c0d`, sito `…-scccc4c0d`). Founder, 23/11: «ricorda di togliere la domanda di oggi e di spostare sintonia come nel redesign». Missione: [redesign-definitivo.md](../missions/redesign-definitivo.md), D2, D3 e D11.

**Cosa cambia:**
- **Gioca senza la domanda di oggi:** la domanda resta solo su Oggi. In Gioca restano la settimana delle risposte e i giochi; gettoni, «Vi aspetta» e i tre stati arrivano con la fase 6.
- **Gioca senza le schede Giochi/Sintonia:** Gioca è solo i giochi.
- **I due personaggi sulla foto di Oggi** (sopra la riga della foto, a destra), nello stesso ordine sui due telefoni: chi ha creato la coppia, poi chi è entrato. Si vedono solo quando ci siete tutti e due.
- **«Il vostro angolo»:** toccando i personaggi si apre un foglio dal basso con i due personaggi e i loro nomi, poi la Sintonia di prima, uguale: livello, ritmo, prossimo sblocco, «I vostri sblocchi» (temi ed effetti di Oggi, stili del countdown, Ti penso, icona), ultimi progressi, «Come cresce la Sintonia». Si chiude con la X, toccando fuori, con Esc o con il tasto indietro di Android. Ha il colore di Noi, il punto di mezzo tra i vostri due.
- Si apre l'angolo anche dai collegamenti che portavano alla scheda Sintonia, e dopo una missione completata, sulla pagina dove sei.
- Restano per la fase 4: i cerchi del livello diventano i personaggi, il guardaroba, la scala nuova dei premi (numeri da mostrare prima).

**Test:** `tests/angolo.test.js`, un test nuovo in `tests/struttura-browser.test.js` (si apre dai personaggi, la Sintonia c'è e non esce dal foglio, Gioca senza domanda e senza schede).

### Redesign: via le mascotte (23/11)

**Stato:** in staging dal 23/11 (PR #283, merge `cccc4c0d`). Founder, 23/11: «ricorda di togliere le mascotte». Missione: [redesign-definitivo.md](../missions/redesign-definitivo.md), D5 (Compagni in pensione per tutti).

**Cosa cambia:**
- **Nessuno siede più sopra la barra:** Maudit, Milo, Bea e Firix non compaiono più, per nessuno. Tolti dall'app `pet.js`, `companions.js`, `pet.css`, `companions.css` (anche dai build e dalla cache offline).
- **Via** la riga «Compagni» dalle Impostazioni, l'avviso «È arrivato…» su Oggi, il gruppo «Compagni» e gli «Accessori» del compagno tra i premi della Sintonia (ritirati: le scelte salvate restano leggibili).
- **Restano:** la funzione del server `get_companions_v1` con i suoi dati, e le immagini approvate in `assets/derived/pet/` (1,1 MB, ancora copiate nel pacchetto: toglierle è un asset approvato, serve il sì del founder).
- Gli accessori già presi passeranno ai personaggi con il guardaroba (fase 4).

**Novità all'uscita (D5):** una riga del tipo «I compagni sono andati in pensione: al loro posto, accessori per i vostri personaggi». Va scritta solo quando il guardaroba dei personaggi è in staging.

**Test:** `tests/via-mascotte.test.js`; tolti i test che provavano solo le mascotte nel client (`pet-foundation`, `pet-foundation-browser`, `maudit-interaction`, `maudit-interaction-browser`, `companions-v1-client`, `pet-accessories`). Resta `companions-v1-db.test.js` per il server.

### Redesign, fase 3: i colori della coppia (23/11)

**Stato:** in staging dal 23/11 (PR #282, merge `7fa2ca82`, sito `…-s7fa2ca82`). Missione: [redesign-definitivo.md](../missions/redesign-definitivo.md), D7 e D8.

**Cosa cambia:**
- **Le quattro pagine sono quattro passi dal tuo colore a quello dell'altra persona:** Oggi è il tuo, Noi a un terzo, Ricordi a due terzi, Gioca il suo. Ogni telefono parte dal suo. I passi si mescolano in OKLCH (`person-colors.js`): anche tra due colori opposti, come blu e pesca, non passano dal grigio. Il colore di Noi (le cose di tutti e due) è il punto di mezzo.
- **Cosa prende il colore della pagina:** la barra (icona e sfondo della scheda aperta), il colore che riempie lo schermo cambiando pagina, il bagliore in cima alla notte, le scritte, le icone e i contorni dentro ogni pagina. Le regole di prima non sono state riscritte: corallo, orchidea, ambra e menta ora vogliono dire «il colore di questa pagina» (`colori.css`).
- **I tasti principali** sono la sfumatura dei due colori, invece del solo tuo.
- **Ciò che fa ognuno resta nel suo colore** (la tua risposta, la sua, il cuore del Ti penso).
- **Leggibilità:** ogni passo di ogni coppia della tavolozza ha almeno 7:1 di contrasto sulla notte e 6,8:1 sotto l'inchiostro scuro dei tasti. Per questo il colore stesso fa da colore delle scritte, senza una seconda versione.
- **Via le Atmosfere e il Colore di Noi:** non si vedono più tra i premi e non si dipingono. Le scelte salvate restano leggibili nel database. I livelli che davano un'Atmosfera o un Colore di Noi restano senza premio visibile finché non arriva la scala nuova (fase 4).
- Lo sfondo resta vino: cambia solo la luce in cima, nel colore della pagina.

**Prima della produzione:** niente di nuovo sul server. Con le migrazioni dei personaggi già annotate qui sotto, i colori scelti con US Plus si leggono nella tavolozza nuova.

**Test:** `tests/colori-coppia.test.js` (contrasto di tutte le coppie, niente grigio a metà, i passi sui due telefoni, Atmosfere e Colore di Noi ritirati) più i test aggiornati dei colori fissi e delle Atmosfere.

**Novità per Play:** da scrivere con l'uscita del redesign.

### Redesign, fase 2: la struttura (23/11)

**Stato:** in staging dal 23/11 (PR #281, merge `38ff0468`, sito `…-s38ff0468`). Tavola approvata dal founder il 23/11 («Concordo»). Missione: [redesign-definitivo.md](../missions/redesign-definitivo.md), D6.

**Cosa cambia:**
- **Ti penso al centro della barra:** un cuore rialzato con la sfumatura dal tuo colore a quello dell'altra persona. Un tocco lo fa scoppiare subito (disco nel tuo colore, anello nel suo, sette coppie di puntini) e manda il Ti penso. Con il movimento ridotto non c'è lo scoppio. Non c'è più in alto a sinistra su Oggi, e non sparisce più su Ricordi, Gioca e Impostazioni.
- **La busta di Lasciato per te** va in alto a sinistra, solo su Oggi.
- **Il tuo personaggio in alto a destra** su Oggi, Noi, Ricordi e Gioca (Gioca ha ora il titolo): apre il Profilo. Lo disegna il nuovo `personaggi.js` (forma, colore, accessori già indossati, faccia di Come stai), portato dai personaggi di staging senza reazioni né guardaroba (fase 4).
- **Le Impostazioni diventano il Profilo:** in cima la tua scheda (personaggio, nome, forma, colore, Come stai), poi le Impostazioni di prima. La scheda della coppia torna sotto «Voi due». La freccia torna alla pagina da cui l'hai aperto, e la barra la tiene segnata.
- **Via la rotella da Noi** (le due che c'erano).
- **Lettura dei personaggi:** `profiles` legge anche `character_shape`, `character_head`, `character_face`. Se il server non li ha (produzione senza le migrazioni dei personaggi), rilegge le colonne di prima: nessun errore, solo i personaggi predefiniti.

**Prima della produzione:** le migrazioni dei personaggi della sezione qui sotto. Senza, ognuno vede il tondo rosa o il quadrato lilla.

**Test:** `tests/struttura.test.js` più i test aggiornati della barra, della testata di Oggi e delle Impostazioni.

**Novità per Play:** da scrivere con l'uscita del redesign.

### Staging riparte da main (23/11)

**Stato:** ramo `claude/staging-da-main`, verso il ramo fisso di staging. Il diario pulito di staging (#255–#278) è archiviato nell'etichetta `archivio/staging-diario-pulito-20261123` (`6c7aa160`) e non andrà in produzione. Missione: [redesign-definitivo.md](../missions/redesign-definitivo.md).

**Cosa porta in produzione, quando uscirà il redesign:**
- **Migrazioni dei personaggi** `20261115183900_personaggi_forma_e_colori.sql`, `20261120232852_personaggi_guardaroba.sql` e `20261123231417_personaggi_scala_premi.sql`, in quest'ordine (su US-STAGING, non in produzione): vanno applicate **prima** del sito. La prima cambia la tavolozza delle persone (oro, cielo e rubino diventano pesca, blu e prugna): prima dell'uscita contare in sola lettura chi li ha scelti.
- **Tavolozza** in `person-colors.js`: rosa, lilla, blu, salvia, pesca, prugna, menta, perla; i nomi vecchi si leggono come il colore nuovo più vicino finché la migrazione non li sposta.
- **Testo grande del telefono:** Android `setTextZoom` in `UsWebView.java` (vale solo da un APK nuovo), iPhone `-webkit-text-size-adjust` in `platform.js` (da provare con TestFlight); `aria-description` tradotto.
- **Tastiera ed emoji:** i campi delle parole di conferma non vengono riscritti su Android; i titoli dei tipi del calendario si tagliano per carattere; il nome dello spazio accetta emoji e suggerimenti.
- **Solo staging:** la versione `<rilascio>-s<commit>` a ogni pubblicazione e la pagina segnaposto dei rami di prova (script di build, nessun effetto sulla produzione).

**Test:** `tests/staging-build-id.test.js`, `tests/s3-1-public-auth.test.js`, `tests/accessibilita.test.js`, `tests/keyboard-emoji.test.js`, `tests/person-colors-*.test.js`, `tests/content-1-0-catalog.test.js`.

**Novità per Play:** nessuna voce a sé finché non escono le fasi del redesign.

### Fogli con la tastiera su iPhone (17/11)

**Stato:** branch `claude/whatsapp-video-review-99dc83`, da `main`. Trovato da Bea su TestFlight (video del 17/11): rispondendo alla domanda del giorno, sotto «Invia la mia risposta» ricompariva la pagina Oggi con la card della domanda. Provato col test nel browser che simula la tastiera di iPhone; da riprovare su TestFlight. Non su staging né in produzione.

**Cosa cambia:** con la tastiera aperta iPhone sposta in giù la parte visibile; i fogli (domanda del giorno, conto alla rovescia, eventi, Lasciato per te…) ora partono da lì e la coprono tutta. Solo sito (`fix4.js`, `dc-popup.css`), niente SQL né parti native. Su staging c'è lo stesso difetto anche col diario pulito (`dc-popup.css`, `diario.css` `.dy-foglio`): va corretto anche lì.

**Test:** `tests/us-v6-daily-reveal-browser.test.js` («with the iOS keyboard…»).

**Novità per Play:** nessuna voce a sé («Piccole correzioni»).

## Patch 1.5.1: «La cosa di oggi» e la mascotte che non sparisce più (13/11/2026)

**In produzione il 14/11 col via del founder («puoi passarlo tutto su produzione»):** migrazioni `20261113202138_cosa_di_oggi_v1.sql` (run 43614053143) e `20261113232109_revisione_testi.sql` (run 43614166584), controllate in sola lettura (`cosa_di_oggi` solo per `authenticated`, `guided_week` dal 14/11 alle 16:11 UTC, le tre sfide da fare insieme in `near`); 10 funzioni delle notifiche (run 43614174829, senza `s3-staging-send-web-push`); sito con build `us-rilascio-20261114-109` e Novità id `1.5.1`; poi AAB 1.5.1. Su staging prima: migrazioni (run 43506086376, 43613038149) e 11 funzioni (run 43613057381, 43613066146), prova con US LIVE.

### La cosa di oggi: serie gentile, prima settimana, animazioni

**Stato:** branch `claude/cosa-di-oggi`. Migrazione applicata su US-STAGING il 13/11 (run 43506086376, approvata dal founder) e controllata in sola lettura: `cosa_di_oggi` solo per `authenticated`, `private.feature_launches` con RLS e chiusa. Provata nell'emulatore con US LIVE sull'account di prova: risposta dell'altro account → «tocca a te» in tempo reale → risposta dal telefono → «Manda un Ti penso a …» → tocco, Ti penso vero → «Oggi ci siete stati tutti e due ♡»; poi, con la data della coppia di prova spostata al 12/11 solo su staging (era il 22/10 alle 15:34:58 UTC), «La vostra prima settimana · Fatto ♡ · Domani: la prima partita» con 2 pallini su 7. In prova trovati e corretti due difetti del telefono: una lettura che non risponde all'avvio non blocca più le successive (tempo massimo), e il «rileggi subito» dopo un Ti penso non riceve più la risposta di prima. Sito di staging non aggiornato (prova fatta con US LIVE dal PC). Non in produzione. Decisione: [DECISIONS.md, 13/11, «La cosa di oggi»](../DECISIONS.md).

**Cosa cambia:** il riquadro della domanda su Oggi resta com'è fino alle risposte. Dopo, al posto di «Rivedi», propone «Manda un Ti penso a …» e poi «Oggi ci siete stati tutti e due ♡» con le due iniziali. La serie («♡ 12 giorni di fila») prende il posto di «Una domanda, due risposte». Per le coppie nuove, nei primi 21 giorni, dopo la domanda arriva il passo del giorno (primo Ti penso, prima partita, primo Ricordo, impegno nel calendario, Lasciato per te, widget sui telefoni Android), con 7 pallini e «Fatto ♡ · Domani: …». Alla fine «Settimana finita ♡» e 100 punti Sintonia, una volta sola. Animazioni: cuori e spunta, serie +1, le iniziali che si toccano, festa per settimana finita, nuovo record e traguardi (7, 14, 21, 30… giorni). Con «riduci animazioni» resta solo il riquadro della festa, senza movimento.

**Server:** migrazione `20261113202138_cosa_di_oggi_v1.sql`: `public.cosa_di_oggi(widget)` per chi chiama (solo `authenticated`), conta serie, record e passi dai dati che ci sono già (nessun dato nuovo, informativa invariata); `private.feature_launches` segna quando parte la settimana guidata (le coppie già formate non la vedono). I 100 punti passano da `private.progression_award` (traguardo `guided-week`, fuori dal Ritmo).

**Test:** `tests/cosa-di-oggi-db.test.js`, `tests/cosa-di-oggi-client.test.js`.

**Novità per Play (proposta):** IT «Su Oggi, dopo la domanda, US vi propone il gesto successivo e conta i giorni di fila insieme. Le coppie nuove hanno una prima settimana guidata.» EN «On Today, after the question, US suggests what to do next and counts your days in a row together. New couples get a guided first week.»

### Ritocchi visivi (revisione del 13/11)

**Stato:** branch `claude/ritocchi-visivi` (nato da `claude/cosa-di-oggi`, commit `6b6dec3c`), provati nell'emulatore con US LIVE e approvati dal founder («Sì, salvali»). Non in produzione.

**Cosa cambia:** Oggi leggibile anche su foto chiare (velo dietro i giorni insieme, ombra sui testi, pillole di vetro scuro; su Android la stessa ombreggiatura in basso del sito); la card della domanda in Gioca si chiama «La domanda di oggi»; calendario di Noi senza linee e con righe più basse, etichette dei giorni più grandi; etichetta delle schede di Oggi da 10 a 11 px. Solo CSS e due testi, niente SQL.

**Aperto:** su Android, scorrendo, il titolo della pagina traspare sotto l'orologio anche con la fascia quasi opaca (causa da capire).

### Revisione dei testi (14/11)

**Stato:** branch `claude/revisione-testi` (nato da `claude/ritocchi-visivi`). Rapporto approvato dal founder il 14/11 («Sì, come consigli»): [missione](../missions/revisione-testi.md). Test mirati verdi; non ancora su staging né in produzione.

**Cosa cambia:** circa 290 testi corretti in tutta l'app. Niente più genere indovinato («mandale», «vi siete messi insieme», «Siete vicini» → «Siete a meno di 3 km», «in amore» → «col cuore pieno»); un nome solo per la stessa cosa (punti e non XP, sfida e non missioni, «La domanda di oggi» anche nelle notifiche, «vissuto» per gli eventi); niente più «email e password» per chi entra con Google; «Avvisami» per US Plus; Impostazioni mostrano la versione vera dell'app («US 1.5.0») invece di «US 1.0»; i fogli Elimina account ed Esci dalla coppia hanno lo stesso elenco delle pagine legali. Pagine legali: elimina-account non dice più che non ci sono backup (la produzione ne fa uno al giorno), l'informativa dice che chi resta tiene lo spazio con i ricordi condivisi, i termini non parlano più di «versione 1.0»; date di aggiornamento al 14/11.

**Server:** migrazione `20261113232109_revisione_testi.sql`, solo `update`: 29 domande del giorno, 57 carte dei giochi (`version + 1`), 1 ricetta, 10 carte di Questo o quello, 17 sfide e missioni, 18 premi. Tre sfide da fare insieme (abbraccio, messaggio nascosto, giornata perfetta) passano da `any` a `near`: le coppie a distanza e quelle che non hanno risposto a «Vi vedete spesso?» non le ricevono più (le `any` scendono da 10 a 7). I giorni e le settimane già mostrati tengono il loro testo. Funzioni da ripubblicare per i testi delle notifiche (`notification-core.mjs` e promemoria del calendario): tutte quelle che importano `notification-core.mjs`, più `calendar-reminders-worker` e `us-widget-state`.

**Android (serve l'AAB):** titoli delle notifiche native (`UsPushNotices.java`), widget «Distanza e batteria» («< 3 km», descrizioni) e «Come stai» («col cuore pieno», «sui libri»).

**Test:** `tests/revisione-testi-db.test.js` più le asserzioni aggiornate nei test dei moduli toccati.

**Novità per Play:** nessuna voce a sé («Piccole correzioni»).

### Promemoria del calendario: ora di Roma e «domani» (14/11)

**Stato:** branch `claude/gallant-colden-6e4f75` (nato da `claude/revisione-testi`); test mirati verdi. Funzione non ancora pubblicata né su staging né in produzione.

**I due difetti (N4 e N5 della revisione dei testi):** le Edge Function girano in UTC e l'ora del promemoria si leggeva dall'orologio del server, quindi per una cena alle 20:30 la notifica diceva «alle 19:30» (d'estate «alle 18:30»). I promemoria «1 giorno prima» e quelli degli eventi di tutto il giorno arrivano la sera prima, ma il testo non diceva che l'evento è domani.

**Cosa cambia:** il testo si costruisce in `supabase/functions/_shared/calendar-reminder-copy.mjs`, con ora e giorno nel fuso di Roma. Per la tua persona: «Bea ti ricorda: Cena alle 20:30 ♡», e «Bea ti ricorda: Cena, domani alle 20:30 ♡» (o «…: Compleanno, domani ♡» per tutto il giorno) quando l'evento cade il giorno dopo. Per chi ha chiesto il promemoria: «Tra un’ora: Cena», «Domani alle 20:30: Cena», «Domani: Compleanno». Tolta `reminderCopy` da `calendar.js`, che serviva solo al vecchio test.

**Da pubblicare:** solo la funzione `calendar-reminders-worker` (porta con sé il modulo condiviso); niente SQL, niente AAB. Va insieme alla ripubblicazione della revisione dei testi.

**Test:** `tests/m6d-reminders.test.js` (girano in UTC come il server), `tests/f2c-edge-cron-source-truth.test.js` (il worker vero controlla l'ora di Roma).

### Livelli giusti per Orbita e Cromo (14/11)

**Stato:** branch `claude/livelli-countdown` (nato da `claude/revisione-testi`). Trovato dalla revisione dei testi. Test verdi; non ancora su staging né in produzione.

**Il bug:** il server sblocca gli stili del countdown Orbita al livello 8 e Cromo al 10 (`20261029031726_sintonia_rewards_v2_phase1.sql`), ma l'app li dichiarava al 9 e al 12. La tessera bloccata (nello stile del countdown e nella Collezione di Sintonia) diceva «Livello 9» o «Livello 12» mentre «Prossimo sblocco» diceva 8 o 10.

**Cosa cambia:** `countdown.js` ora dice 8 e 10, come il server; la Collezione legge da lì. Gli altri temi ed effetti di Oggi (`oggi-look.js`) erano già giusti. Solo il codice dell'app, niente SQL: va col sito e con l'AAB.

**Test:** `tests/livelli-premi-client-db.test.js` confronta il livello di ogni stile, tema ed effetto con premio con `progression_reward_catalog` costruito da tutte le migrazioni: se un giorno si separano, il test fallisce. In `tests/rewards-countdown-visual-pass.test.js` Cromo bloccato ora dice «Livello 10».

**Novità per Play:** nessuna voce a sé («Piccole correzioni»).

### La mascotte non sparisce più

**Stato:** commit della mascotte dentro lo stesso branch `claude/cosa-di-oggi` (nato da `claude/mascotte-visibile`), provata nell'emulatore di staging (US LIVE) il 13/11; non in produzione.

**Il bug (segnalato dal founder in produzione, 13/11):** in Ricordi e in Gioca la mascotte spariva. Dal 06/11, quando sotto di lei c'era un comando, si «faceva da parte» diventando invisibile; in quelle pagine c'è quasi sempre una tessera sotto, quindi restava sparita.

**Cosa cambia:** con un comando sotto, la mascotte resta al suo posto, normale (il founder non la vuole trasparente), e i tocchi le passano attraverso fino al comando (`pet.css`). Il problema del 06/11 (si prendeva il tocco dell'interruttore dell'impronta) resta risolto. Test: `tests/emulator-polish-20261106.test.js`. Nell'emulatore: Gioca scorsa su una tessera → `data-pet-aside`, visibile, tocco disattivato sulla mascotte (provata trasparente; poi tolta la trasparenza, cambia solo l'opacità).

**Novità per Play:** nessuna voce a sé; va con il prossimo AAB («Piccole correzioni»).

**Ordine in produzione (tutta la 1.5.1):** 1. database: `20261113202138_cosa_di_oggi_v1.sql`, poi `20261113232109_revisione_testi.sql` (workflow «Supabase SQL», target production, conferma PRODUZIONE); l'app già installata non chiama la prima e con la seconda vede solo testi nuovi. 2. Funzioni Supabase dei testi delle notifiche (revisione dei testi, sopra). 3. Sito: merge su `main` con build id di produzione e Novità id `1.5.1`. 4. Android: AAB nuovo (il web dell'app è dentro il pacchetto).

## Patch 1.5: versione pubblica, tre partite al giorno e «US Plus, in arrivo» (13/11/2026)

**Stato:** provata il 13/11 nell'emulatore di staging (build `us-staging-20261113-107`, migrazioni su US-STAGING run 43456669485 e 43456698374: contatore «3 su 3», «Avvisatemi» salvato davvero). Uscita in produzione col via del founder («Sì, vai in prod», 13/11): build `us-rilascio-20261113-108`, Novità id `1.5`. Decisione: [DECISIONS.md, 13/11](../DECISIONS.md).

**Novità per Play**
- IT: «Ora le partite di Gioca sono 3 al giorno, e un contatore vi dice quante ne restano. Mentre aspetti la tua persona puoi già rispondere alla domanda di oggi. In arrivo: US Plus.»
- EN: «You now get 3 games a day in Play, and a counter shows how many are left. While you wait for your person you can already answer today's question. Coming soon: US Plus.»

**Cosa cambia**
- **Gioca, tre partite al giorno:** migrazione `20261113153748_gioca_tre_al_giorno_v1.sql`, che ridefinisce solo `private.game_v2_week_limits` (`day` da 1 a 3). Stesse chiavi e stessi messaggi d'errore: l'app già installata continua a funzionare e dice già «2 partite da giocare oggi». Nell'app nuova il contatore con i pallini sotto «I vostri giochi» e, a partite finite, la riga «Partite illimitate con US Plus · In arrivo» (`games.js`, `dc-gioca.css`).
- **US Plus, in arrivo:** gruppo «US Plus» in Impostazioni e schermata con cosa sblocca e «Avvisatemi quando arriva» / «Non avvisarmi più» (`index.html`, `settings.js`, `dc-settings.css`, `i18n-en.js`). Server: migrazione `20261113153750_plus_waitlist_v1.sql`, tabella `private.plus_waitlist` (solo account e data, RLS senza regole, via con l'account) e `public.plus_waitlist(join)` solo per chi chiama. Conteggio: `select count(*) from private.plus_waitlist;`.
- **Informativa IT/EN (13/11):** la riga di «Avvisatemi» (consenso, revocabile dall'app). Lavagna e foto della sfida c'erano già dal 09/11.
- **Test:** `tests/gioca-daily-limit-v1-db.test.js` (ora tre al giorno), `tests/plus-waitlist-db.test.js`, `tests/gioca-tiles.test.js`.

**Ordine in produzione** (insieme alla 1.4.2 qui sotto, che non è ancora uscita)
1. **Database**, una migrazione per volta (workflow «Supabase SQL», target production, conferma PRODUZIONE): `20261109183329_client_errors_v1.sql`, `20261113153748_gioca_tre_al_giorno_v1.sql`, `20261113153750_plus_waitlist_v1.sql`. Dalla seconda in poi anche l'app vecchia permette 3 partite.
2. **Play Console, Sicurezza dei dati, prima dell'AAB:** i log degli arresti anomali e la diagnostica della 1.4.2; per «Avvisatemi» niente di nuovo da dichiarare oltre all'«ID utente» già dichiarato [da verificare nella Console].
3. **Sito:** merge su `main` con build id di produzione.
4. **Android:** AAB 1.5.0 con la nota qui sopra.

**Restano al founder:** protezione dalle password già rubate in Supabase; richiesta dell'accesso alla produzione su Play; pulizia degli 8 account anonimi (dati di produzione, passo a parte).

## Patch 1.4.2: errori dell'app e domanda di oggi mentre si aspetta il partner (09/11/2026)

**Stato:** su staging dal 09/11 (commit `3b5667f0` nel branch di staging, build `us-staging-20261109-106`), non in produzione. Migrazione `client_errors_v1` applicata su US-STAGING col workflow «Supabase SQL», approvata dal founder (run 42679596506), e controllata in sola lettura: tabella con RLS, `report_client_errors` per `authenticated` e non per `anon`, nessuna lettura dall'app, pulizia notturna. Sul sito di staging: il modulo degli errori è il primo script differito, la chiamata senza account è rifiutata (401, 42501) e senza sessione l'app non manda niente; nessun errore all'avvio. Il salvataggio con un account e la schermata d'attesa sono provati nei test e nel browser locale col finto Supabase, non ancora con un account vero su staging. Nasce dall'ispezione del 09/11 verso l'uscita pubblica: l'uso dei tester cala (Ti penso da 32 a 16 a settimana; 5 persone su 14 ancora attive dopo 7 giorni di coppia), nessuno vede gli errori sui telefoni, e chi aspetta il partner trova solo il codice.

**Novità per Play** (se esce con un AAB)
- IT: «Mentre aspetti la tua persona puoi già rispondere alla domanda di oggi: l'invito le dice che ti aspetta la tua risposta.»
- EN: «While you wait for your person you can already answer today's question: the invite tells them your answer is waiting.»

**Cosa cambia**
- **Errori dell'app:** gli errori JavaScript che nessuno intercetta e le promesse rifiutate arrivano su Supabase, nel nostro database, senza servizi esterni (`client-errors.js`, primo script differito di `index.html`). Solo dati tecnici: messaggio ripulito (senza indirizzi web, email, numeri lunghi, token e testi tra virgolette), file e riga, build, piattaforma. Al massimo 20 per apertura, lo stesso errore una volta con il conto; solo con un account (prima aspettano in memoria); se la chiamata fallisce si buttano. Server: migrazione `20261109183329_client_errors_v1.sql`: tabella `private.client_errors` (nessuno la legge dall'API), `public.report_client_errors()` solo per chi ha un account, 20 righe per chiamata e 50 al giorno per account, via con l'account, cancellate dopo 30 giorni dalla pulizia notturna già attiva in produzione (`us-operational-retention-daily`). Si leggono con `docs/store/US_ERRORI_APP.sql`.
- **Chi aspetta il partner:** sotto l'invito la scheda «Intanto, la domanda di oggi» con la domanda, il campo e «Rispondi». Stessa RPC (`get_or_create_daily_question`) e stessa riga di `daily_answers` di Oggi: quando la tua persona entra e risponde, vede la tua risposta come sempre. Se hai risposto, «Condividi» aggiunge «Ho già risposto alla domanda di oggi: rispondi anche tu per vedere la mia.». Se qualcosa non va la scheda non compare: l'invito resta com'era (`index.html`, `onboarding.js`, `app.js`, `dc-primo.css`, `i18n-en.js`).
- **Numeri della settimana:** `docs/store/US_NUMERI_DELLA_SETTIMANA.sql`, solo lettura e solo conteggi, dai dati che l'app salva già: percorso di chi si iscrive (profilo, coppia, coppia completa, prima risposta, ancora attivi dopo 7 giorni), coppie in attesa, coppie e persone attive, gesti per tipo, questa settimana contro la precedente.
- **Informativa IT/EN (09/11):** gli errori tecnici (cosa, perché, 30 giorni, via con l'account) e, dal punto 17 dell'audit, i disegni della lavagna e le foto della sfida. Le bozze `docs/store/play/PRIVACY_POLICY_DRAFT*.md` erano già indietro (senza batteria e «Come stai»): le pagine pubblicate restano il riferimento.
- **Test:** `tests/client-errors-v1-db.test.js`, `tests/client-errors-client.test.js`, `tests/waiting-today-question.test.js`.

**Non in questa patch:** il promemoria a chi aspetta da 1 e 3 giorni. Chi aspetta di solito non ha ancora le notifiche (si attivano dopo, nell'app), quindi servirebbe una mail: è un passo a parte, da decidere.

**Ordine in produzione (dopo la prova su staging)**
1. **Database prima del sito:** `20261109183329_client_errors_v1.sql` (workflow «Supabase SQL», target production, conferma PRODUZIONE). Senza la tabella l'app funziona lo stesso: gli errori si buttano.
2. **Play Console, Sicurezza dei dati, prima dell'AAB:** aggiungere «Informazioni e prestazioni dell'app › Log degli arresti anomali» e «Diagnostica»: raccolti, non condivisi, obbligatori, scopo funzionalità dell'app (`docs/store/play/PLAY_DECLARATIONS_DRAFT.md`).
3. **Sito:** merge su `main` con build id di produzione; esce anche l'informativa nuova.
4. **Android:** AAB nuovo (la schermata d'attesa e gli errori sono nel pacchetto dell'app).

## Patch 1.4.1: correzioni dell'audit della produzione (preparata il 05/11/2026)

**Uscita in produzione (06/11, col via del founder):** migrazioni applicate in produzione col workflow «Supabase SQL» dal commit di staging `0aa0fe96` (`couple_sync_v1` run 42295652661, controllata in sola lettura: tabella, 8 trigger, Realtime, RLS; `calendar_reminders_insert_rule` run 42296054838, regola riletta; `rls_initplan_fk_indexes` run 42296229168, 50 indici presenti e l'advisor non segnala più `auth_rls_initplan` né `unindexed_foreign_keys`); sito dal branch `claude/rilascio-1-4-1` con la build `us-rilascio-20261106-105` (test 2567 passati, 0 falliti; build di produzione minificata). Novità alla prima apertura: resta l'id `1.4`, è una patch di correzioni.

**Stato precedente:** su staging dal 05/11, non in produzione. Unita nel branch di staging (merge `ff5e3159`, build `us-staging-20261105-102`); le tre migrazioni applicate su US-STAGING col workflow «Supabase SQL», approvate dal founder (run 42023293693, 42023355477, 42023675730). Sito di staging controllato: build nuova, minificato, integrità di supabase-js, nessun errore all'avvio. In produzione solo col via del founder. Rapporto: [`docs/audit/2026-11-05-audit-produzione.md`](../audit/2026-11-05-audit-produzione.md).

**Controllo del 05/11:** `npm test` 2687 test, 0 falliti; `npm run build:cloudflare-pages` con la minificazione ok. Test nel browser, sul codice e sul sito minificato: gli stessi fallimenti che ha già `main` (test rimasti indietro), più due che cedono solo sotto carico (attese di 30 s) e passano se lanciati da soli. Integrità di supabase-js e MapLibre provata dal vivo sul CDN.

**Novità per Play**
- IT: «Piccole correzioni: se l'altra persona elimina un ricordo, un post-it o un impegno, lo vedi sparire subito; il calendario si aggiorna da solo; «Scollega questo telefono» scollega solo questo telefono.»
- EN: «Small fixes: when your person deletes a memory, a sticky note or a plan, it disappears for you right away; the calendar updates by itself; “Disconnect this phone” only disconnects this phone.»

**Cosa cambia**
- **Uscita:** «Scollega questo telefono» chiudeva le sessioni dell'account su tutti i dispositivi (`signOut()` di supabase-js è globale). Ora solo questo telefono, anche nell'uscita dall'onboarding; il testo non parla più del «codice privato» (`settings.js`, `app.js`, `i18n-en.js`).
- **Cancellazioni e calendario in tempo reale:** tabella `public.couple_sync` e trigger sulle cancellazioni di Ricordi, foto, post-it, eventi e storie, e su ogni cambio del calendario; l'app la ascolta su un canale Realtime suo, così se la migrazione mancasse fallirebbe solo quel canale e non Ti penso e il resto (`app.js`, `couple-notes.js`, `stories.js`). Se l'altra persona stacca il post-it aperto, compare di nuovo l'avviso.
- **Codice esterno con controllo di integrità:** supabase-js (sito) e MapLibre (sito e app) da jsDelivr con `integrity`; la build Android sostituisce il tag intero con la copia locale (`index.html`, `ricordi-place.js`, `scripts/build-capacitor-web.mjs`).
- **Anteprime dei link:** Open Graph e descrizione su `index.html` e `invito.html`, indirizzo canonico `www`, font della prima schermata precaricati.
- **Sito minificato:** ultimo passo delle build web (`scripts/minify-web.mjs`, `package.json`): JS e CSS da 2,7 MB a 1,9 MB (compressi da 639 a 465 KB). Lo staging minifica dopo le sue sostituzioni. L'app Android resta com'è.
- **Database:** regola di inserimento dei promemoria riscritta (non era sfruttabile); 81 regole RLS calcolano `auth.uid()` e la coppia una volta per richiesta; 50 indici sulle chiavi esterne.
- **Pulizia (05/11, nessun cambio visibile):** tolti circa 400 righe di CSS mai usato (soprattutto la vecchia Quest e Noi hub), 7 funzioni JS senza chiamate, 18 icone e il wordmark non usati, 3 workflow morti; il service worker non mette più in cache le due icone del profilo tolte. Elenco e motivi: [`docs/milestones/pulizia-20261105.md`](../milestones/pulizia-20261105.md). Niente SQL né Edge. Su staging con la build `us-staging-20261105-103`.
- **Ritocchi dalla prova nell'emulatore (06/11):** scorrendo, una fascia del colore del tema sotto la barra di stato tiene leggibile l'orologio (`styles.css`, `ui-foundation.js`); il gattino si fa da parte quando sotto c'è un comando, per esempio l'interruttore dell'impronta in Impostazioni, che prima copriva e gli rubava il tocco (`pet.js`, `pet.css`); in inglese «Voi» delle Impostazioni diventa «You two» (in italiano «Voi due») e la lavagna «Blackboard», non più «Board» come la bacheca (`index.html`, `i18n-en.js`). Test: `tests/emulator-polish-20261106.test.js`. Su staging con la build `us-staging-20261106-104`.
- **Test:** `tests/sri-third-party.test.js`, `tests/link-preview-meta.test.js`, `tests/couple-sync-v1-db.test.js`, `tests/couple-sync-client.test.js`, `tests/calendar-reminders-insert-rule-db.test.js`, `tests/rls-initplan-fk-indexes-db.test.js`; i test nel browser servono la pagina senza il pin di integrità (il finto supabase-js non può avere quell'impronta) e con `US_TEST_WEB_ROOT=dist/cloudflare-pages` girano anche sul sito minificato.

**Ordine in produzione (dopo la prova su staging)**
1. **Database prima del sito**, una migrazione per volta (workflow «Supabase SQL», target production, conferma PRODUZIONE): `20261105110941_couple_sync_v1.sql`, `20261105111516_calendar_reminders_insert_rule.sql`, `20261105112050_rls_initplan_fk_indexes.sql`.
2. **Sito:** merge su `main`; Cloudflare pubblica con `npm run build:cloudflare-pages`, che ora minifica. Prima del merge, build id nuovo.
3. **Android:** AAB nuovo (MapLibre con integrità, uscita solo da questo telefono, segnale delle cancellazioni). Nessun dato nuovo per la Sicurezza dei dati.

**Non in questa patch, da decidere o da fare a mano** (dettagli nel rapporto):
- protezione dalle password già rubate (Authentication, impostazione del founder);
- reindirizzamento 301 da `uscouple.app` e `us-a33.pages.dev` verso `www` (Cloudflare);
- widget Scriptable di Bea: ancora servito dalla produzione con codice che non è più nel repo, da tenere fino all'app iPhone o da spegnere;
- registro delle migrazioni di produzione (9 su 41) da riallineare con `supabase migration repair`;
- `supabase/config.toml` con il Site URL vecchio;
- account anonimi rimasti, schermi da 320 px, test nel browser vecchi.

## 1.4: l'uscita in produzione del 04/11/2026 (fatta)

Controllo prima dell'uscita (04/11): revisione del codice main…staging (3 correzioni fatte, nessun errore aperto); suite completa 2537 passati e 0 falliti; test nel browser vero con gli stessi 15 fallimenti che ha già main (test vecchi, non errori nuovi); APK firmato costruito e widget provati sull'emulatore.

1. **Database di produzione**, una migrazione per volta, in quest'ordine (workflow «Supabase SQL», target production, conferma PRODUZIONE):
   1. `20261031120000_ortografia_domande.sql`
   2. `20261031132258_couple_notes_v1.sql`
   3. `20261031134410_couple_battery_v1.sql`
   4. `20261102170000_member_status_v1.sql`
   5. `20261103010817_s32_export_notes_battery_status.sql`
   6. `20261103204751_couple_notes_color.sql`
   7. `20261103205050_lavagna_v1.sql`
   8. `20261103205157_weekly_challenge_v1.sql`
2. **Funzioni del server in produzione:** `send-web-push` (lavagna, foto della sfida) e `weekly-challenge-job` (nuova). La funzione della sfida va **prima** della sua pianificazione.
3. **Database, ultime due:** `20261103205200_weekly_challenge_job_cron.sql` (in produzione il cron parte davvero: primo invio il lunedì alle 9) e `20261104140000_atmosfere_gradienti.sql`.
4. **Sito:** PR da staging a main e merge; Cloudflare pubblica la produzione da main. Prima del merge: build id di produzione al posto di quello di staging.
5. **Android:** AAB nuovo su Play (test interno, poi chiuso), con versione più alta; poi Sicurezza dei dati su Play Console (il widget Post-it mostra il testo dei post-it sulla Home; nessun tipo di dato nuovo).
6. **Dopo l'uscita:** staging riparte da main (nuovo branch di staging) e il branch lungo `mission/us-store-s3-1-public-auth-staging-20261011` si archivia.

Note: `export-my-data` resta spenta (D-7), quindi le modifiche a `s3-2-export-core.mjs` non si distribuiscono. `notification-core.mjs` cambia solo con voci nuove: `calendar-reminders-worker` e `monthiversary-job` non vanno ridistribuite.

## iOS Store V1: l'app per iPhone (05/11/2026)

**Stato:** solo sul branch `claude/ios-store-v1-127e94`, non su staging (non esiste un'app iOS di staging) e non in produzione. Missione: `docs/missions/ios-store-v1.md`; lista per l'acquisto dell'account Apple: `docs/store/ios/GIORNO_ACQUISTO.md`.

Quasi tutto sta in `ios/` e `native-plugins/us-app-icon/ios`, che Android e il sito non usano. Con il merge cambiano anche, per tutti:
- **`app-update.js`:** se lo Store non risponde, la versione installata si legge dall'app (`App.getInfo`), così la versione minima vale lo stesso; «Aggiorna» passa l'ID dell'App Store, che Android ignora. Su Android cambia solo un caso: un'app non installata da Play e sotto la versione minima ora vede «Aggiorna US» (oggi le build fuori da Play hanno codici più alti del minimo, quindi niente di visibile).
- **`cloudflare/_headers`:** una regola per `/.well-known/apple-app-site-association` (tipo JSON). Il file si pubblica solo quando c'è il Team ID.
- **`capacitor.config.json`:** solo la voce `ios` (colore prima del primo disegno `#26142E`).
- **Accedi con Apple (scelta del founder del 05/11):** i pulsanti «Continua con Apple» sono nella pagina ma restano nascosti su Android e sul sito (compaiono solo dove c'è il plugin, cioè sull'iPhone); `elimina-account.html` dice «con Google o con Apple»; per gli account Apple, Impostazioni chiede la conferma con Apple. Prima della produzione: provider Apple e client iOS di Google su Supabase (staging, poi produzione) e la revoca del token Apple (vedi la missione, §3.1).

Ordine: merge su `main` con il via del founder, poi il primo TestFlight dal workflow `ios-testflight.yml` (ambiente `ios-deploy`, approvazione del founder). Nessun SQL e nessuna Edge Function; i secret APNs in produzione sono un passo a parte, col suo via.

## Lavagna in Noi e widget «Lavagna» (03/11/2026, fase 2 della Noi nuova)

**Stato:** su staging dal 03/11 (SQL e `send-web-push` applicati con il via del founder), non in produzione. Va in produzione insieme a tutta la Noi nuova, solo con il via del founder. Missione: `docs/missions/lavagna-v1.md`.

- **Lavagna:** in cima alla bacheca di Noi una tessera con l'ultimo disegno («Lavagna · Bea, 5 min fa», «Disegna»); toccandola si apre la lavagna a tutto schermo. Si disegna col dito in due: quattro colori, due spessori, gomma, «Annulla» dell'ultimo tratto proprio, «Pulisci» con conferma per tutti e due. Ogni tratto si salva quando si alza il dito; l'altra persona lo vede in un paio di secondi.
- **Notifica:** «Bea ha disegnato sulla lavagna», al massimo una volta ogni 2 ore per chi la riceve; si spegne in Impostazioni › Notifiche › Lavagna.
- **Widget Android «Lavagna» 2×2:** l'ultimo disegno, Pastello con il tema chiaro e Midnight con quello scuro; toccandolo apre US sulla lavagna. Si aggiorna quando US è aperta (come «Ricordi a pila»).
- **Database:** migrazione `20261103205050_lavagna_v1.sql` (tabelle `lavagna_strokes` e `lavagna_boards`, RLS di coppia, tempo reale, export dei dati, autori staccati quando qualcuno lascia la coppia o elimina l'account, preferenza `lavagna`). Ordine: SQL, poi Edge `send-web-push` ed `export-my-data`, poi web, poi APK/AAB.
- **Privacy:** i disegni sono contenuto della coppia come le note; entrano nell'export dei dati. Nessun nuovo tipo di dato per Google Play.

## Note condivise in Noi (31/10/2026)

**Stato:** su staging, non in produzione. **Branch:** `claude/note-condivise`. **Build:** `us-note-condivise-20261031-76`. Missione: `docs/missions/note-condivise-v1.md`.

- In Noi, sotto il calendario, un quarto collegamento **Note** apre un Foglio con le note della coppia come **quadratini**: si leggono senza aprirle, le voci si spuntano sul quadratino e toccandolo ci si scrive sopra (si allarga sul posto). Titolo, testo e lista a spunta, di tutti e due. Si salvano da sole; se l'altra persona salva la nota aperta compare un avviso.
- **Database:** migrazione `20261031132258_couple_notes_v1.sql` (tabella `couple_notes`, RLS di coppia, tempo reale, export dei dati, autori staccati quando qualcuno lascia la coppia o elimina l'account). Su staging e poi in produzione solo con il workflow «Supabase SQL (manual)» e il via del founder.
- **Privacy:** le note sono contenuto della coppia come le Idee; entrano nell'export dei dati. Nessun nuovo tipo di dato per Google Play.

## Dopo la 1.3.0 (fix dalle prove in produzione, 30/10/2026)

**Stato:** su staging, non ancora in produzione. **Branch:** `claude/fix-prod-1-3-1`. **Build:** `us-fix-20261030-75`.

- **Mappa dei Ricordi:** «Aggiungi il posto» ora sta nella foto a schermo intero, sotto la nota. Prima, sui ricordi caricati prima della 1.3, finiva sotto lo schermo e non si poteva toccare (`dc-ricordi.css`, test in `tests/ricordi-place-client.test.js`).
- **Mappa dei Ricordi, salvataggio del posto:** scegliere il posto di un ricordo già caricato non salvava niente: `ricordi-place.js` cercava il client in `window.sb`, che non esiste (in `app.js` `sb` è una costante). Ora usa `sb` come gli altri moduli. Trovato dalla sessione dei widget il 31/10; test in `tests/ricordi-place-client.test.js`.
- **Controllo ortografico di tutte le domande (31/10):** migrazione `20261031120000_ortografia_domande.sql` (solo testi, test in `tests/ortografia-domande-db.test.js`). Su staging serve il run del workflow «Supabase SQL (manual)» con l'approvazione del founder; in produzione lo stesso file, con il suo via.
- **Oggi, riga di distanza (e su staging batteria e «Come stai»):** con la scheda «Tocca a te» o l'avviso delle notifiche la riga spariva del tutto, per la regola del mockup di ottobre in `dc-oggi.css`. Ora resta sempre (founder, 03/11, dalla revisione di staging; test in `tests/oggi-riga-sempre-visibile.test.js`).
- **Oggi, domanda del giorno sui telefoni bassi:** sotto i 700 px d'altezza restava una riga sola («Quale canzone ti mette di…»), sotto i 600 px spariva. Ora due righe in tutti e due i casi.
- **Revisione di staging, problemi minori (03/11):**
  - **Mappa dei Ricordi:** i nomi dei posti arrivano sempre in italiano, anche con il telefono in inglese (prima «Lake Garda»); con un posto solo la mappa apre su città e dintorni (zoom 9), non su una strada al buio; se la mappa si apre prima dei ricordi, poi si sposta su di loro (prima restava sull'Italia); le scritte della mappa in italiano («Monaco di Baviera», non «MUNICH»); niente più avvisi per le icone che mancano allo stile scuro (`ricordi-place.js`, test in `tests/ricordi-place-client.test.js`).
  - **Gattino:** mentre una pagina scorre si fa quasi trasparente e lascia leggere il testo, poi torna (`pet.js`, `pet.css`).
  - **Avvio:** la barra in alto (cuore, logo, busta) non compare più da sola prima della presentazione (`top-chrome.css`); «Notifiche disattivate» non lampeggia più in Oggi, perché aspetta il primo caricamento delle schede in attesa (`app.js`).
  - **Impostazioni:** sotto «US 1.0» si vede la build, per sapere quale versione c'è sul telefono.
- **Emoji di Gboard nella risposta alla domanda del giorno:** ancora aperto. Il campo non ha `autocomplete="off"` (la causa trovata il 29/10 per gli altri campi), quindi la causa è un'altra. Il 31/10, nell'emulatore con Gboard e un APK di debug, il campo passa a Gboard testo normale a più righe (`inputType=0x2c001`): tastiera completa, tasto emoji e pannello emoji funzionanti. Serve una registrazione dal telefono del founder per vedere quando cambia la tastiera.

## Patch 1.3.0 (in produzione dal 30/10/2026)

Quello che segue è la storia della patch 1.3.0, già in produzione.

**Stato:** in prova su staging (https://us-staging-s31.pages.dev). Niente è in produzione. Ogni passo qui sotto ha il via separato del founder (regola «prove solo su staging», `docs/DECISIONS.md`, 28/10/2026).
**Build:** `us-fix-apk-20261029-66`.
**Build della Mappa dei Ricordi:** `us-mappa-ricordi-20261030-73` (con il dominio www.uscouple.app da `claude/sintonia-premi-v2`; branch `claude/mappa-ricordi`, PR #242).
**Branch:** `claude/gioca-una-al-giorno` (PR #232), sopra `claude/fix-amici-beta` (PR #233) poi `claude/traguardi-giorni` (PR #234) poi `claude/invito-app-links` (PR #235) poi `claude/aggiornamento-app` (PR #236) poi `claude/colori-plus` (PR #237) poi `claude/emoji-tastiera` (PR #238) poi `claude/app-ariosa` (PR #239) poi `claude/icona-senza-cornice` (PR #240) e infine `claude/fix-prova-apk`.
**Patch unica (founder, 29/10):** tutte queste PR più i fix dei tester che arrivano nel frattempo, in produzione insieme e solo con il via del founder.

## Testo «Novità» per Google Play

Italiano (massimo 500 caratteri):

> Gioca: una partita al giorno, con il conto di quelle rimaste.
> Invito: un link che apre US con il codice pronto.
> Registrazione: password visibile, Google anche in «Crea un account», accesso automatico dopo la verifica.
> «Insieme dal» con giorno, mese e anno.
> Google: niente più schermate sovrapposte.
> Traguardi ogni 100 giorni insieme.
> US si aggiorna da sola.
> Emoji in ogni campo dove scrivete.
> App più ariosa, il tuo colore già all'inizio.
> Rivivi nel giorno esatto di un ricordo.

English (500 characters max):

> Play: one game a day, with a count of what is left.
> Invites: a link that opens US with the code ready.
> Sign-up: show your password, Google in “Create an account” too, automatic sign-in after verification.
> “Together since” with day, month and year.
> Google: no more overlapping screens.
> Milestones every 100 days together: 1000 is worth the most.
> US now updates itself.
> Emoji in every field where you write.
> Airier screens, your colour from the start.
> Relive on the exact day of a memory.

## Cosa cambia

### Gioca: una partita al giorno (D4, PR #232)

- **Server:** la migrazione `20261028201759_gioca_daily_limit_v1.sql` concede una nuova partita per giorno di Roma, di qualsiasi tipo; prima erano 1 «Per voi» più 2 libere a settimana. Le partite aperte si riprendono senza consumare; al massimo 3 restano aperte.
- **App:** «Da domani», «Nuovi giochi domani», «Per oggi avete giocato».
- **Contatore:** sotto «I vostri giochi» si legge «1 partita da giocare oggi» oppure «Domani un'altra partita».

### Fix dal test chiuso (amici del founder, 28/10)

- **Password:** un pulsante con l'occhio la mostra o la nasconde, in accesso, registrazione e nuova password. Torna nascosta quando cambia schermata. Icone Phosphor 2.1.1 `Eye` ed `EyeSlash`.
- **Google anche nella registrazione:** «Continua con Google» c'è anche in «Crea il tuo account». Il passaggio dei Termini resta quello di prima.
- **Google, schermate sovrapposte:** dopo «Prima di entrare» (i Termini di Google), «Iniziamo da te» si apriva sotto i Termini, che restavano a schermo. Ora la configurazione prende il posto di ogni schermata d'accesso.
- **Invito con un link:**
  - «Condividi» manda «Ti aspetto su US ♡ / Apri il mio invito: / https://us-a33.pages.dev/invito#CODICE», senza la scadenza: la scadenza la dice chi invita, che la vede in US.
  - La pagina `/invito` mostra il codice da solo, con «Copia codice», «Usa US dal browser» e «Scarica US da Google Play».
  - Il codice sta dopo `#`, quindi non arriva nei log del server.
- **Codice incollato:** nel campo del codice si può incollare tutto il messaggio di WhatsApp, anche quello vecchio, oppure il link. US trova da solo il codice.
- **Il link apre l'app Android (App Links, 29/10):**
  - con US installata, `https://us-a33.pages.dev/invito#CODICE` apre l'app e non il browser;
  - il codice resta pronto per «Ho un codice d'invito»: se sei su «Voi», US ci va da sola;
  - il sito lo dimostra ad Android con `/.well-known/assetlinks.json` (pacchetto `com.usapp.us` e impronta SHA-256 della chiave di firma di Play);
  - nel manifest c'è un intent-filter `autoVerify` su `/invito`; l'app di staging usa `us-staging-s31.pages.dev`.
- **App web aperta dal link:** se l'invito apre US dal browser, il codice è già compilato in «Ho un codice d'invito».
- **«Insieme dal»:** tre tendine, giorno, mese e anno (dal più recente al 1900), al posto del calendario.
- **Dopo la mail di verifica:**
  - tornando in US, la schermata «Verifica la tua email» prova da sola ad accedere, al massimo una volta ogni 15 secondi e 12 volte in tutto, per restare lontani dal limite di Supabase (circa 30 accessi ogni 5 minuti);
  - la password resta solo in memoria, mai salvata, e si dimentica appena si lascia quella schermata;
  - il testo ora dice «Poi torna qui: l'accesso è automatico.».

### Traguardi dei giorni insieme (founder, 29/10)

- **Quando:** ogni 100 giorni da «Insieme dal», contati in giorni di calendario come il contatore di Oggi. Il giorno di «Insieme dal» non conta.
- **Punti Sintonia:** 80 per ogni centinaio; 300 per 1000, 2000, … (più dei 200 dell'anniversario).
- **Server:**
  - la migrazione `20261028232743_days_together_milestones_v1.sql` aggiunge il tipo `days` e la colonna `days_together` a `relationship_milestones`;
  - `award_relationship_days_milestone` è solo per service_role e ricontrolla che i giorni corrispondano a «Insieme dal».
- **Funzione oraria** `monthiversary-job`, alle 9 di Roma:
  - assegna il traguardo dei giorni accanto al mesiversario, e se cadono lo stesso giorno contano tutti e due;
  - manda una sola notifica a testa, sul traguardo dei giorni: «US. · 100 giorni ♡ / Oggi sono 100 giorni insieme»; per i 1000, «US. · Mille giorni ♡».
- **App:**
  - in Oggi, il giorno stesso, «Oggi sono mille giorni ♡ · Un traguardo tutto vostro» (per gli altri centinaia, «Oggi sono 300 giorni ♡ · Un traguardo insieme»), al posto del mesiversario;
  - in Eventi e nel calendario di Noi, il prossimo traguardo con il conto alla rovescia;
  - in Rivivi, il traguardo festeggiato.
- **Nessun arretrato:** chi ha già passato un traguardo vede il prossimo.

### Aggiornamento dell'app (founder, 29/10)

- **Dentro l'app (Google Play In-app updates):** plugin `@capawesome/capacitor-app-update` 8.1.0 (MIT), nuovo modulo `app-update.js`. All'avvio e a ogni ritorno nell'app, al massimo ogni 6 ore, US chiede a Play se c'è una versione nuova:
  - **normale** (priorità 0–3): Play la scarica in sottofondo, poi compare «Aggiornamento pronto · Riavvia». La richiesta di Play di scaricarla compare al massimo una volta al giorno per versione;
  - **urgente** (priorità 4–5): la schermata di aggiornamento di Play a tutto schermo, che si può rimandare.
- **Versione minima dal server:**
  - la migrazione `20261029012149_app_min_version_v1.sql` crea la tabella `app_min_version` (android e ios, partono da 0) e la funzione `get_app_min_version`, leggibile solo dopo l'accesso (regola F1B: nessuna funzione per `anon`); se non si legge, l'app riprova al ritorno successivo;
  - sotto la versione minima, US mostra «Aggiorna US» e non si apre finché non è aggiornata: con l'aggiornamento di Play se Play ha la versione nuova, altrimenti apre la pagina dello Store.
- **Workflow «Android Play bundle»:** nuova scelta `update_priority` (0–5) quando carica l'AAB.
- **Come si usa:**
  - di norma non si fa niente: con priorità 0 l'aggiornamento arriva da solo;
  - per un rilascio che rompe le versioni vecchie, **dopo** che il nuovo AAB è su Play, una SQL approvata: `update public.app_min_version set min_version_code = <versionCode>, updated_at = now() where platform = 'android';`
- **Attenzione:** funziona dalla versione che contiene il plugin. Chi ha la 1.2.4 deve aggiornare a mano un'ultima volta.

### Colori a scelta con US Plus (founder, 29/10)

- **Decisione:** `docs/DECISIONS.md` del 29/10. Modifica «Due colori, un Noi» del 14/10.
- **Cosa:** ognuno sceglie il proprio colore tra 8 (Rosa, Lilla, Cielo, Salvia, Oro, Pesca, Rubino, Perla) in Impostazioni › Profilo › «Il tuo colore». Lo vedete tutti e due, e i due colori della coppia sono sempre diversi. «Torna al colore di sempre» rimette rosa (chi ha creato lo spazio) o lilla (chi è entrato). Il colore di Noi non cambia.
- **Solo con US Plus:** il colore si cambia solo se almeno uno dei due ha Plus, e quello scelto resta anche dopo la fine di Plus.
- **Senza Plus la voce si vede, bloccata:** lucchetto e «US Plus»; toccandola si vedono gli 8 colori, più chiari e senza cerchietti di scelta, e «Si sblocca con US Plus». Toccare un colore mostra l'avviso «Si sblocca con US Plus». Nessun acquisto, prezzo o abbonamento finché Plus non è in vendita.
- **Server:** migrazione `20261029014653_person_colors_plus_v1.sql`:
  - `plus_entitlements`: la base dell'accesso Plus (missione `plus-v1-staging.md` §2, sola lettura). Una riga per persona e fonte (play, beta, manuale); la scrive solo il server; ognuno legge la propria;
  - `get_couple_plus()`: «la coppia ha Plus?» e grazie a chi;
  - colonna `profiles.person_color` e `set_my_color()`, che ricontrolla Plus, gli 8 colori e il colore del partner.
- **App:** nuovo `person-colors.js`. I colori arrivano dal profilo all'avvio e al ritorno nell'app; tutta l'interfaccia legge `--us-rosa` e `--us-lilla`, quindi cambia insieme.
- **Restano uguali:** logo, icona, splash, animazione d'apertura e, per ora, **i widget Android** (oggi «io» è sempre lilla e il partner rosa). Collegarli ai colori scelti è un passo a parte, nativo.
- **In beta i colori sono gratis per tutti** (fix dalla prova dell'APK, sotto): la voce bloccata si vedrà solo il giorno in cui Plus va in vendita.

### Emoji sulla tastiera (founder, 29/10)

- **Problema:** nell'APK la tastiera a volte offriva le emoji e a volte no.
- **Causa:** alcuni campi avevano `autocomplete="off"`. Il WebView di Android lo passa alla tastiera come «niente suggerimenti», e lì Gboard toglie le emoji. Il founder ha confermato sul telefono: le emoji mancavano proprio in quei campi.
- **Correzione:** il segno è tolto dai campi dove si scrive:
  - titolo del calendario («Che cosa fai?»);
  - nome del conto alla rovescia («Il nostro viaggio»);
  - didascalie di foto e vocali in Lasciato per te.
- **Resta** dove le emoji non servono: codice d'invito, parole di conferma («ELIMINA», uscita dalla coppia), orari del calendario, ricerca del brano e nomi dell'iscrizione.
- **Test:** `tests/keyboard-emoji.test.js` tiene l'elenco dei soli campi che possono avere il segno.
- **Da provare sull'APK:** serve un APK nuovo, perché le schermate sono dentro l'app.

### App più ariosa (founder, 29/10)

- **Perché:** confrontata con Couple Joy, US sembrava «tutto più grande». Il testo normale era già uguale; erano i titoli e le parti in evidenza a riempire lo schermo. Misure prese dagli screenshot del founder (Couple Joy: titoli di pagina 19–21, di scheda circa 17).
- **Cosa cambia** (nei file di design `dc-*.css`, `countdown.css`, `due-colori.css`; niente regole aggiunte sopra):
  - titoli di pagina («Noi», «Ricordi», «Impostazioni»): da 40–46 a 26–28;
  - titoli di sezione (mesi, «I vostri giochi», «I vostri sblocchi», «Tu», il giorno in Noi): circa 20;
  - titoli delle schede: giochi 17, Sfida di oggi 20, didascalie dei Ricordi 15–18, nomi della coppia 18;
  - Oggi: numero dei giorni da 92 a 64, titolo del ricordo da 30 a 22, domanda di oggi 18 / 16 / 15 secondo la lunghezza, pulsanti in alto da 46 a 40;
  - Noi: righe del calendario da 46 a 40, pulsanti del mese un po' più piccoli;
  - barra in basso da 70 a 58, icone 21, etichette 11.
- **La mascotte** segue l'altezza della barra (`--us-nav-height`), quindi resta appoggiata sul bordo.
- **Restano uguali:** testo normale, bersagli da toccare (almeno 40), illustrazioni approvate.
- **Test:** due test aggiornati alle misure nuove. I test nel browser che di solito vengono saltati (Playwright) danno gli stessi 16 errori di prima, con gli stessi messaggi: non dipendono da questo cambio.

### Icona dell'app: resta quella di sempre (founder, 30/10)

- **Decisione:** l'icona senza cornice (PR #240) **non** entra nella patch: in produzione resta l'icona di sempre, con la cornice. Chi vuole un'altra icona la sblocca in Sintonia (US, Notte, Oro, Neon).
- **Codice:** `ic_launcher*.xml`, `mipmap-*/ic_launcher*.png`, `scripts/build-android-brand-assets.ps1`, `android/brand-assets-manifest.json` e il loro test tornano come in produzione (byte per byte); via `us_adaptive_foreground_v2`. Il logo senza cornice (`us-launcher-symbol-v2`) resta solo come base delle icone premio.

### Fix dalla prova dell'APK (founder, 29/10)

- **«Compagni»:** in Impostazioni la voce «Maudit» diventa «Compagni» (acceso o spento), con «Il vostro Compagno sopra la barra».
- **Tema ed Effetto solo in Sintonia:** via da Impostazioni il blocco «Personalizza Oggi». In Sintonia i gruppi Tema ed Effetto hanno «Apri la galleria con le anteprime»; il cielo della vostra prima sera apre la sua pagina.
- **Il tuo colore alla prima apertura:**
  - chi crea la coppia lo sceglie nel passo del colore, chi entra con il codice nel passo «Scegli il tuo colore» della configurazione;
  - 8 cerchi, quello del partner (scelto o di sempre) non si può prendere; la scelta colora subito i cerchi.
- **Colori gratis in beta:** finché US Plus non è in vendita il colore si sceglie e si cambia senza Plus, anche in Impostazioni.
  - Server: migrazione `20261029203000_colors_free_in_beta.sql`. Nuova tabella `app_flags` (solo il server la legge), con `plus_on_sale` spento; `set_my_color()` chiede Plus solo quando è acceso; `get_couple_plus()` dice all'app `colors_free`.
  - Il giorno in cui Plus va in vendita, il founder la accende nell'SQL Editor: `update public.app_flags set enabled = true, updated_at = now() where key = 'plus_on_sale';`. Da lì cambiare colore richiede Plus; il colore già scelto resta.
- **Rivivi solo nel giorno giusto:** in Ricordi «Rivivi» compare solo se oggi è lo stesso giorno di un ricordo passato: «Un anno fa, oggi» (o «N anni fa») nello stesso giorno e mese, altrimenti «N mesi fa, oggi» nello stesso giorno del mese. Gli anni vincono sui mesi. Negli altri giorni non c'è.
- **«Il vostro anno su US»:** in Noi la riga compare solo quando la coppia compie un anno su US (dal giorno in cui l'ha creata nell'app, ora di Roma), per 30 giorni, ogni anno. Negli altri giorni non c'è. La scheda di Oggi per l'anniversario della relazione apre Eventi, come i mesiversari. Il contenuto del recap resta quello di oggi: il mega recap e i recap dei mesiversari sono un passo a parte.
- **Il cuore nuovo:** il cuore sulla risposta del partner in Oggi, quello per rispondere a un Ti penso e il Ti penso in alto a sinistra (al posto delle due scintille) hanno un'animazione sola, veloce e senza coriandoli: al tocco il cuore si schiaccia e scatta oltre la sua misura, mentre un'onda dal rosa al lilla (i vostri colori, anche quelli scelti) si apre attorno e sfuma (circa 0,4 s). **Ogni 3 cuori** che una persona mette, quello grande: scatto più alto, vibrazione più forte e una seconda onda più ampia. Il conto è di ciascuno, sul suo telefono. Togliere il cuore non anima; con «riduci movimento» resta solo la vibrazione. Codice nostro (`ui-foundation.js` `heart()`).

### Novità alla prima apertura (founder, 30/10)

- Dopo l'aggiornamento, alla prima apertura, chi usava già US su quel telefono vede una volta il foglio «Novità · US si è aggiornata» con 8 righe su cosa è cambiato, e «Ho capito». Chi installa per la prima volta non lo vede.
- Codice: `US_WHATS_NEW` e `usShowWhatsNew()` in `app.js` (id `1.3`: per il prossimo rilascio basta cambiare id e righe); `releaseNotesDue()` e l'elenco nel foglio informativo in `ui-foundation.js`.

## Ordine in produzione (ognuno con il suo via)

0. **Mail di conferma** (founder, in Supabase produzione: Authentication › Emails › Templates › Confirm signup): la riga «Poi torna in US e accedi con email e password.» diventa «Poi torna in US: l'accesso è automatico.».
1. **SQL** con il workflow «Supabase SQL (manual)», target `production` e conferma `PRODUZIONE`, nell'ordine: Gioca (`20261028201759_gioca_daily_limit_v1.sql`), traguardi (`20261028232743_days_together_milestones_v1.sql`), versione minima (`20261029012149_app_min_version_v1.sql`), colori e Plus (`20261029014653_person_colors_plus_v1.sql`), colori gratis in beta (`20261029203000_colors_free_in_beta.sql`). Prima serve un token Supabase che includa il progetto di produzione: quello attuale vale solo per staging.
1b. **Edge Function** `monthiversary-job` con il workflow «Supabase Edge deploy», target `production`, dopo l'SQL dei traguardi: usa la nuova funzione del database. Con lo stesso workflow `delete-account`, `leave-couple` e `account-deletion-worker`, perché accettino anche `www.uscouple.app`.
2. **Sito web** (Cloudflare Pages `us-a33`): porta `/invito`, `/.well-known/assetlinks.json` e l'app web nuova. Va pubblicato prima dell'AAB: il link condiviso dall'app punta a `us-a33.pages.dev/invito`, e Android verifica il file quando installa l'app.
3. **AAB** sul test chiuso «Alpha» di Play, con il testo «Novità» qui sopra.

Tra il passo 1 e il passo 3 l'app vecchia dice ancora «lunedì» per una partita che torna domani: sono sbagliate solo le scritte, i limiti funzionano.

## Da sapere

- **App Links e build installate a mano:** il file dichiara solo la chiave di firma di Play. Un APK installato a mano (staging o interno) apre il link nel browser.
- **Google Play dalla pagina d'invito:** durante il test chiuso la scheda dello store si apre solo per i tester.
- **Staging:** i cron sono spenti, quindi i traguardi non arrivano da soli alle 9. Plus si dà a tutti gli account con `docs/store/US_STAGING_PLUS_PER_TUTTI.sql`, e tutta la Sintonia si sblocca con `docs/store/US_STAGING_SINTONIA_TUTTA.sql`. Sono dati di prova: **non fanno parte della patch** e non vanno mai eseguiti in produzione.
- **Dominio e mail (già fatti dal founder in produzione, 29–30/10):**
  - dominio `uscouple.app` (Cloudflare): `uscouple.app` e `www.uscouple.app` servono già il sito di produzione (progetto Pages `us`, alias `us-a33.pages.dev`). Indirizzo principale scelto: **www.uscouple.app**;
  - Resend: dominio `uscouple.app` verificato (DKIM, SPF) e DMARC `v=DMARC1; p=none;`;
  - Supabase produzione: SMTP personalizzato attivo con Resend, mittente «US <noreply@uscouple.app>», provato dal founder (mail arrivata). Per tornare indietro: spegnere «Enable custom SMTP». Limite iniziale circa 30 mail/ora (Authentication › Rate Limits). Staging resta con la mail di Supabase (scelta del founder);
  - nella patch (codice, 30/10): l'indirizzo principale è `www.uscouple.app`:
    - il link d'invito è `https://www.uscouple.app/invito#CODICE`, anche dall'app e dal vecchio indirizzo; i link vecchi `us-a33.pages.dev/invito` funzionano ancora;
    - App Links: l'app Android si apre da `www.uscouple.app/invito` e da `us-a33.pages.dev/invito` (due host nello stesso intent-filter; lo stesso `assetlinks.json` vale per tutti gli indirizzi del progetto Pages);
    - privacy, termini (nel box di registrazione e in Impostazioni) e il link a «elimina account» nelle pagine privacy puntano a `www.uscouple.app`;
    - la pagina «elimina account» funziona anche su `uscouple.app` e `www`; le Edge Function `delete-account`, `leave-couple` e `account-deletion-worker` accettano anche le origini `https://www.uscouple.app` e `https://uscouple.app`;
  - ancora da fare a mano: Redirect URLs di produzione con `https://uscouple.app/**` e `https://www.uscouple.app/**` (prima della patch); dopo la patch Site URL di Supabase `https://www.uscouple.app` e URL privacy in Play Console `https://www.uscouple.app/privacy`.
- **App di staging:** dall'APK di staging il link d'invito punta comunque al sito di produzione. Sul web di staging punta a staging.

## Dopo la patch unica: Premi Sintonia V2 (non incluso)

Decisa il 29/10 (`docs/DECISIONS.md`, «Nuova scala dei premi Sintonia»; missione `docs/missions/sintonia-premi-v2.md`). Va in una patch successiva, in due fasi, ognuna con il via del founder.

- **Fase 1, server** (branch `claude/sintonia-premi-v2`):
  - la migrazione `20261029031726_sintonia_rewards_v2_phase1.sql` sposta i 21 premi di oggi ai livelli 2–12, segna i premi principali e aggiunge Ti penso animato (5), Tema delle stagioni (10, l'ex «Autunno»), Il vostro cielo (20) e Aurora (4, extra Plus);
  - i premi Plus si sbloccano con il livello e Plus, e restano;
  - `get_progression_v1` dà anche il prossimo premio principale con i punti che mancano e i punti delle ultime 2 settimane;
  - chi è già a un livello riceve i premi nuovi, già segnati come visti.
- **Fase 1, app:**
  - in Noi, «Prossimo sblocco» mostra il prossimo premio principale (o il Compagno se arriva prima), con «mancano X XP · circa N giorni» sul ritmo delle ultime 2 settimane;
  - gli extra Plus bloccati dicono «Livello N · US Plus», nella collezione e nella galleria di Oggi;
  - **Aurora** (extra Plus, livello 4): bande di luce verdi, azzurre e viola che si muovono sopra la foto di Oggi;
  - **Stagioni** (livello 10, ex «Autunno»): Oggi cambia da solo con la stagione di Roma, con fiori in primavera, sole d'estate, foglie d'autunno e neve d'inverno;
  - i livelli di riserva di temi ed effetti nell'app seguono la scala nuova;
  - **Ti penso animato** (livello 5):
    - nella collezione della Sintonia c'è il gruppo «Ti penso», con «Classico» gratis e «Cuori»;
    - chi ha scelto «Cuori» sul suo telefono, quando riceve un Ti penso, vede salire una pioggia di cuori nei colori della coppia;
    - niente animazione con «riduci animazioni».
  - **«Il vostro cielo»** (livello 20, un tema di Oggi):
    - le stelle vere di «Insieme dal», sopra la città della coppia, scelta da una lista di 45 città italiane («Dove eravate quella sera?»), all'ora che dicono loro («A che ora vi siete messi insieme?», le 22 se non la cambiano). L'ora conta più della città: il cielo gira di circa 15° ogni ora, mentre tra due città italiane cambia di una decina di gradi;
    - su Oggi le stelle stanno **sopra la foto**, che resta visibile e solo più scura in alto (founder, 29/10: niente disco che la copre); il disco con N, E, S, O resta solo nell'immagine da salvare;
    - le stelle più luminose hanno un alone;
    - dopo il livello 20, una stella d'oro in più a ogni livello;
    - «Salva l'immagine» crea un PNG con titolo, data, città e ora.
    - **Dati:** le 904 stelle fino alla magnitudine 4,5 del catalogo Yale Bright Star (NASA ADC / CDS V/50), in `assets/data/stars-bsc5-v1.json`, 24 KB, caricate solo quando il cielo si vede.
    - **Server:** colonne `couples.sky_city` e `couples.sky_minutes` (minuti dopo mezzanotte, vuoto = 22:00) e `set_sky(città, minuti)` nella stessa migrazione della Fase 1, che si può rieseguire. La prima versione `set_sky_city()`, solo su staging, viene tolta.
  - **Peso dell'app:** il limite sale da 2,85 a 2,9 MB.
  - **Galleria di Oggi, anteprima nel dettaglio:** era vuota per tutti i temi e gli effetti (altezza in percentuale risolta a 0, dal 9/10); ora ha un'altezza esplicita.
  - **Da provare sul telefono:**
    - «Salva l'immagine» nell'app Android installata: il WebView potrebbe non scaricare il file;
    - i cuori quando arriva un Ti penso vero.
- **Fase 2, server:** la migrazione `20261029161354_sintonia_rewards_v2_phase2.sql` aggiunge i premi con le immagini approvate dal founder il 29/10:
  - accessori dei Compagni: sciarpina (9), «Gala» (Plus, 10), coroncina di fiori (12), corona (19);
  - Ti penso «lettera» (15);
  - icone dell'app «Notte» (13), d'oro (18), «Neon» (Plus, 7);
  - chi ha già passato quei livelli li riceve già visti;
  - la Fase 1 accetta anche le due categorie nuove, così le due migrazioni si possono rieseguire in qualsiasi ordine.
- **Fase 2, app:**
  - **Accessori** (nuovo gruppo nella collezione, scelto su questo telefono, «Niente» di partenza): ogni accessorio è **disegnato addosso** a ognuno dei quattro Compagni, nelle tre pose, dai fogli che il founder ha generato con ChatGPT (gli adesivi sopra il disegno erano «messi malissimo», 29/10). Le parti che si muovono (orecchie, ali, coda) restano quelle di sempre, così il Compagno continua a muoverle e il drago a volare.
    - Maudit e il drago sono maschi: sciarpina blu notte, coroncina d'alloro, colletto con papillon; la capra e il gufo: sciarpina rosa, coroncina di fiori, collana di perle.
    - Corona da re per Maudit e il drago, da regina per la capra e il gufo.
    - Le immagini indossate sono 24 px più alte del riquadro (una corona sta sopra la testa): l'app le alza della stessa misura, così le parti che si muovono restano allineate.
    - 64 immagini, scaricate solo quando un Compagno le indossa.
  - **Ti penso «lettera»:** chi l'ha scelta, quando riceve un Ti penso, vede una busta che sale al centro e si apre sul sigillo a cuore. Niente animazione con «riduci animazioni».
  - Le immagini (`assets/derived/rewards`, 17–27 KB l'una) si scaricano solo quando servono: non pesano sull'avvio.
  - **Icone dell'app** (nuovo gruppo «Icona dell'app», scelto su questo telefono): US, Notte, Oro, Neon.
    - Android: ogni icona è un ingresso del launcher (`activity-alias`), uno solo acceso; il plugin `native-plugins/us-app-icon` accende il nuovo prima di spegnere gli altri. L'app cambia icona solo quando cambia davvero.
    - La schermata vera si chiama ora `UsActivity`; l'ingresso di sempre tiene il nome `.MainActivity`, così l'icona già sulla schermata home resta dopo l'aggiornamento.
    - Quando si cambia icona, molti telefoni tolgono quella vecchia dalla schermata home e mettono la nuova nell'elenco delle app: va detto nell'app.
    - Il controllo del bundle per Play accetta solo la schermata di US e i quattro ingressi delle icone.
  - **Prova tecnica della Mappa dei Ricordi:** sostituita dalla Mappa dei Ricordi vera (sezione qui sotto); il toast di staging non c'è più.
  - **Da provare sul telefono:** gli accessori sul Compagno sopra la barra e la lettera quando arriva un Ti penso vero.

## 2026-10-29 — Mappa dei Ricordi

**Fonte:** founder, 29/10/2026: grill «Mappa dei Ricordi» (D1–D7) e risposte del giro successivo («concordo con tutto»).

**Su staging (30/10/2026, con il via del founder):** SQL `20261029222210_ricordi_place_v1.sql` applicato con il workflow «Supabase SQL (manual)» (run 40968815705, HTTP 201); web `us-mappa-ricordi-20261029-71` su us-staging-s31; APK di staging dal run 40968819284 (plugin `us-photo-place` compilato). Non ancora provato sul telefono. Decisione in `docs/DECISIONS.md`. **Branch:** `claude/mappa-ricordi`, sopra `claude/sintonia-premi-v2`.

- **Server:** la migrazione `20261029222210_ricordi_place_v1.sql` aggiunge ai Ricordi `place_lat`, `place_lon` (tre decimali, circa 100 m, li arrotonda la colonna stessa), `place_label` (nome breve, 1–120 caratteri) e `place_source` (`photo` o `search`), più `set_moment_place()` per tutti e due i membri della coppia. Il posto lo legge solo la coppia (RLS dei Ricordi) ed entra nell'export dei dati.
  - **Ordine:** prima l'SQL, poi il web. Senza le colonne Ricordi si legge come prima, ma **salvare un Ricordo con un posto fallisce**.
- **App:**
  - **«Dove · facoltativo»** nel composer, sotto la data: il posto della foto compare da solo con la ✕ per toglierlo, oppure «Aggiungi il posto» apre la ricerca. Il nome è il posto o la via senza numero civico, poi la città.
  - **Nell'album del Ricordo** la riga «Dove» aggiunge, cambia o toglie il posto, anche sui Ricordi vecchi e su quelli caricati dall'altra persona.
  - **Mappa:** in Ricordi l'interruttore «Mappa» accanto a «Mese per mese». Ogni Ricordo è la sua foto in un piccolo riquadro; avvicinando la mappa compare sotto, in piccolo, la nota del Ricordo (o il posto se non c'è nota). I vicini si raggruppano con una foto e il numero; un tocco apre il Ricordo.
  - **Consenso:** la prima volta US spiega a cosa serve il posto delle foto («Continua» / «Non ora»), poi Android chiede il permesso.
- **Android, posizione dalla foto:** nuovo plugin `native-plugins/us-photo-place`. «Aggiungi un ricordo» apre il **selettore documenti di sistema** (`ACTION_OPEN_DOCUMENT`) al posto della galleria; con `ACCESS_MEDIA_LOCATION` legge il GPS dell'originale (`MediaStore.getMediaUri` + `setRequireOriginal`) e lo arrotonda prima di passarlo all'app. Niente `READ_MEDIA_IMAGES`. Se qualcosa non va, il posto resta vuoto e la foto entra lo stesso.
- **Servizi esterni nuovi (senza chiave né account):**
  - **Photon** (komoot, Germania) per la ricerca e per il nome del posto delle foto: riceve il testo cercato e le coordinate già arrotondate. Fair use, nessuna garanzia di servizio.
  - **OpenFreeMap** per le tile della mappa (stile «dark»): riceve la zona guardata.
  - **MapLibre GL JS 5.24.0** da jsdelivr, caricata solo quando si apre la mappa.
- **Peso dell'app:** il limite sale da 2,9 a 2,95 MB (`ricordi-place.js` e `.css`, circa 28 KB).
- **Export dei dati:** il posto entra nell'export (`s3-2-export-core.mjs`). La Edge function dell'export va pubblicata **dopo** l'SQL, altrimenti chiede colonne che non esistono.
- **Prima della produzione:**
  - aggiornare l'informativa privacy (Photon e OpenFreeMap come destinatari; posizione delle foto);
  - Sicurezza dei dati su Play: «Posizione approssimativa» anche per le foto (`ACCESS_MEDIA_LOCATION`), condivisa con nessuno, facoltativa;
  - Play Console: controllare che `ACCESS_MEDIA_LOCATION` non chieda una dichiarazione (dalle pagine di Play non risulta tra i permessi limitati);
  - testo «Novità»: aggiungere la Mappa dei Ricordi (va accorciato il resto per stare nei 500 caratteri).
- **Da provare sul telefono (APK di staging):**
  - il selettore documenti mostra le foto della fotocamera e ne fa scegliere più di una;
  - la spiegazione di US e poi la richiesta di Android;
  - una foto nuova con «Salva posizione» attivo nella fotocamera dello Xiaomi: «Dove» si riempie da solo;
  - una foto senza posizione: «Dove» resta vuoto e si cerca a mano;
  - la mappa: segnaposti, gruppi, tocco che apre il Ricordo, ritorno a «Mese per mese».

## 2026-10-31 — Batteria del partner

**Fonte:** founder, grill del 31/10/2026 (dopo lo studio di Love8: posizione rispettosa, niente tracciamento continuo). **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; niente su staging né in produzione.

- **Cosa fa:** quando US è aperta (all'avvio e al ritorno in primo piano) il telefono manda il proprio livello di batteria e se è in carica, al massimo ogni 15 minuti. Niente lavori in background, nessuna notifica. L'altra persona vede l'ultimo livello e da quanto tempo; dopo un giorno non si vede più. Senza dato non compare niente.
- **Oggi (scelta del founder del 31/10, in `DECISIONS.md`):** nella pillola della distanza, dopo i chilometri, l'icona Phosphor della batteria (bassa, media, alta, in carica) e la percentuale: «12 km · 🔋 18%». Sotto il 20% e non in carica l'icona è corallo. Si vede solo accanto a una distanza (anche l'ultima nota): con «Attiva posizione» o «In attesa» non compare. Si aggiorna col tempo reale, dal canale unico dell'app (`startUsRealtime`), come le Note: niente canali paralleli. Per questo l'SQL va su prima del web.
- **Scheda «Distanza»** (tocco sulla pillola): sotto la distanza la riga «Bea · 18% · 2 ore fa» (con «in carica» se serve). Per questa riga la scheda di conferma (`UsUiFoundation.notice`) ha una nuova opzione `note`.
- **Noi:** invariato, nessuna riga della batteria.
- **Widget Android «Noi»:** accanto a «NOI», in alto a destra, l'icona e la percentuale. Dopo un'ora più tenue, dopo un giorno sparisce (il widget si ridisegna da solo a quelle ore). La riga in corsivo sotto la distanza resta libera per «a casa / fuori» (lavoro successivo, con i recinti).
- **Database:** migrazione `20261031134410_couple_battery_v1.sql`: tabella `couple_batteries` (una riga per persona, FK verso `profiles` con cascade), RLS «stessa coppia» finché il proprietario ne fa parte, scrittura solo con `report_battery(p_level, p_charging)` (orario del server; lo stesso invio entro un minuto non scrive niente), pubblicazione `supabase_realtime`. Test: `tests/couple-battery-v1-db.test.js`.
  - **Ordine:** prima l'SQL, poi il web. La tabella è nel canale Realtime unico dell'app, quindi un web arrivato prima dell'SQL potrebbe fermare il tempo reale di tutta l'app finché la tabella non c'è (vale anche per le Note). Le letture della batteria invece, senza tabella, smettono di chiedere da sole.
  - **Export dei dati:** la batteria entra nell'export (`s3-2-export-core.mjs`); la Edge `export-my-data` va pubblicata **dopo** l'SQL.
- **Android:** nuovo metodo `getBatteryStatus` nel plugin `us-widget-bridge` (`BatteryManager`, nessun permesso). Serve un APK nuovo; l'APK vecchio usa la Battery API del WebView, se c'è. Sul web vale la Battery API del browser (Chrome sì; Safari e Firefox no: lì non si manda niente). Un computer senza batteria non manda niente.
- **Icone:** Phosphor `battery-low`, `battery-medium`, `battery-high`, `battery-charging` (regular, `@phosphor-icons/core` 2.1.1), registrate in `assets/ICON_REGISTRY.json`; nel widget gli stessi tracciati come vector drawable.
- **Privacy:** `privacy.html` e `privacy-en.html` aggiornate al 31/10 (tabella dei dati, «Batteria», chi vede, conservazione, eliminazione).
- **Prima della produzione:**
  - Sicurezza dei dati su Play: decidere se dichiarare il livello della batteria (la voce più vicina è «Informazioni e prestazioni dell'app › Diagnostica», che cita la durata della batteria), raccolto per «Funzionalità dell'app»;
  - non c'è un interruttore per non condividere la batteria: da decidere se serve prima della produzione;
  - testo «Novità»: «Oggi: la batteria di chi ami accanto alla distanza, anche nel widget.» / «Today: your partner's battery beside the distance, in the widget too.»;
  - senza posizione condivisa la batteria si vede solo nel widget: da decidere se serve anche su Oggi senza distanza.
- **Da provare dall'APK di staging (dopo SQL e web su staging):**
  - sui due telefoni, con la posizione condivisa: aprire US, poi su Oggi la pillola dice «12 km · 🔋 18%» con la batteria dell'altro; il tocco apre la scheda «Distanza» con «Bea · 18% · proprio ora»;
  - un telefono senza posizione condivisa: la pillola dice «Attiva posizione» senza batteria;
  - mettere in carica un telefono, chiudere e riaprire US dopo 15 minuti: sull'altro compare l'icona col fulmine senza ricaricare la pagina (tempo reale);
  - riaprire US entro 15 minuti: non manda niente di nuovo (l'orario non cambia);
  - widget «Noi» sulla schermata Home: icona e percentuale accanto a «NOI»; dopo un'ora più tenue; il tocco apre Noi;
  - un telefono sotto il 20%: icona corallo nella pillola e nel widget;
  - Noi: nessuna riga della batteria.

## 2026-10-31 — Widget «Noi» stile mappa (solo Android)

**Fonte:** founder, 31/10/2026 (tre modelli da un'app di riferimento più il widget delle note; questo è il primo). **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; serve un APK nuovo.

- **Cosa cambia:** da 4×2 in su il widget «Noi» mostra:
  - le due foto rotonde ai lati, io a sinistra e il partner a destra, con gli anelli rosa e lilla di sempre;
  - in mezzo la distanza su una linea tratteggiata, con «tra voi» o «ultima nota»;
  - sopra ogni foto una nuvoletta con l'ultimo Ti penso di quella persona: «ti ha pensato · 10 min fa» sopra il partner, «hai pensato a Bea · 2 ore fa» sopra di me. Nella prima ora va a passi di 5 minuti, poi a ore e a giorni; dopo una settimana la nuvoletta sparisce;
  - sotto la foto del partner, piccola, la sua batteria.
  Più avanti nella nuvoletta andrà lo stato con emoji.
- **Il 2×1 già messo** resta la scheda di prima (foto in coppia, distanza, batteria accanto a «NOI»). Android 12+ sceglie da solo la vista in base alla misura; sui telefoni più vecchi decide la misura che il launcher comunica. Un widget nuovo parte da 4×2.
- **Sfondo (founder: «Vera, ma solo sfondo»):** un pezzo fisso di mappa scura, Torino col Po, sempre lo stesso.
  - Disegnata una volta con lo stile scuro di OpenFreeMap della Mappa dei Ricordi, senza scritte, e inclusa nell'app (`drawable-nodpi/us_widget_noi_map_v1.webp`, 1600×800, 85 KB). Il widget non si collega a nessun servizio di mappe e non mostra mai dove siete.
  - È **candidata**: `DRAFT` in `assets/ASSET_MANIFEST.json`, la approva il founder dall'APK di staging.
  - Attribuzione «© OpenStreetMap contributors» (ODbL) e OpenFreeMap / OpenMapTiles nella privacy, italiano e inglese.
  - Da Android 12 la mappa resta dentro gli angoli arrotondati della scheda. Su Android 11 e precedenti gli angoli della mappa restano squadrati, quasi invisibili sul nero.
- **Dati:** nessun dato nuovo. Le nuvolette usano gli orari di Ti penso che il widget già riceveva; le foto rotonde le prepara l'app quando è aperta (come la foto in coppia), con gli stessi anelli. Il widget non va in rete.
- **Anteprima nel selettore dei widget** (Android 12+): la vista a mappa, generica, senza volti né nomi. L'immagine PNG per Android 11 e precedenti è ancora quella del 2×1.
- **Da provare dall'APK di staging:**
  - mettere il widget «Noi»: deve partire grande (4×2) con la mappa scura dietro, le due foto, la distanza sulla linea tratteggiata e la batteria del partner;
  - dire se la mappa va bene (è candidata);
  - mandarsi un Ti penso: dopo aver aperto US, la nuvoletta sopra il partner dice «ti ha pensato · proprio ora», poi «5 min fa», «10 min fa»;
  - mandare un Ti penso dal widget Ti penso: la nuvoletta sopra di me cambia subito;
  - rimpicciolire il widget a 2×1: torna la scheda di prima;
  - il tocco apre Noi.

## 2026-10-31 — Widget «Messaggio» (solo Android)

**Fonte:** founder, 31/10/2026 (secondo dei widget scelti). **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; serve un APK nuovo.

- **Cosa fa:** widget 2×2.
  - In alto la foto rotonda del partner.
  - Sotto, in una nuvoletta chiara con un piccolo cuore rosa, il messaggio più recente tra il suo ultimo Ti penso («Ti ha pensato · 10 min fa») e il suo Lasciato per te ancora chiuso («Ti ha lasciato una foto · 5 min fa»; anche messaggio, vocale, video, canzone).
  - Senza niente di recente: «Il suo prossimo pensiero arriverà qui», con il cuore vuoto. Un Ti penso più vecchio di una settimana non è più una novità; una busta chiusa resta finché non si apre.
- **Il tocco** apre quel messaggio nell'app, per la stessa strada delle notifiche: Ti penso apre il foglio per ricambiare, la busta apre Lasciato per te. Sul freddo aspetta l'accesso.
- **Privacy (founder: «Solo tipo e ora»):** del Lasciato per te il widget conosce solo il tipo e l'ora, mai le parole, la foto o il link. Così la sorpresa resta nell'app, sulla schermata Home non compare il contenuto, e niente sopravvive alla pulizia dei Lasciato per te.
- **Corretto per strada (stesso contratto dei widget):** l'app non passava mai al widget «La domanda di oggi» la domanda (`platform.js` scartava il blocco `daily`), e quel widget non si poteva aggiungere dalla galleria di Impostazioni (mancava nell'elenco dei tipi). Ora passano tutti e due.
- **Galleria in Impostazioni:** nuova voce «Messaggio» (inglese «Message»), con la sua anteprima.
- **Da provare dall'APK di staging:**
  - aggiungere «Messaggio» da Impostazioni › Widget;
  - farsi mandare un Ti penso e aprire US: «Ti ha pensato · proprio ora»; il tocco apre il foglio per ricambiare;
  - farsi lasciare una foto in Lasciato per te: «Ti ha lasciato una foto»; il tocco apre la busta; aperta la busta, torna il Ti penso;
  - «La domanda di oggi»: ora mostra la domanda del giorno e si aggiunge da Impostazioni.

## 2026-10-31 — Widget «Giorni insieme» (solo Android)

**Fonte:** founder, 31/10/2026 (terzo dei widget scelti). **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; serve un APK nuovo.

- **Cosa fa:** widget 2×2 con le due foto rotonde vicine e un cuore rosa in mezzo. Sotto, grande in serif, il numero dei giorni insieme, con «giorni insieme» («193 giorni insieme»). Cambia a mezzanotte di Roma. Il tocco apre Noi.
- **Dati:** nessuno nuovo. La data d'inizio della coppia arrivava già ai widget per «Foto & Noi» e per il Countdown «Insieme da». I giorni si contano come nell'app (`countdown.js`: il primo giorno è 0). Le foto rotonde sono le stesse del widget «Noi» stile mappa.
- **Verifica chiesta dal founder:** il Countdown «Insieme da» e «Foto & Noi» mostravano già i giorni, ma senza le due foto e il cuore. Questo widget li mette insieme e non tocca gli altri.
- **Senza data:** «I vostri giorni insieme», senza numero.
- **Galleria in Impostazioni:** nuova voce «Giorni insieme».
- **Da provare dall'APK di staging:**
  - aggiungere «Giorni insieme» da Impostazioni › Widget;
  - il numero è lo stesso dell'app su Oggi («Insieme da»);
  - il giorno dopo, a mezzanotte, cresce di uno senza aprire US;
  - il tocco apre Noi.

## 2026-10-31 — Ti penso dal widget: al server giusto anche da staging (solo Android)

**Fonte:** trovato durante il widget «Nota»; il founder: «correggilo come la Nota». **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; serve un APK nuovo.

- **Prima:** il widget Ti penso mandava sempre all'Edge di produzione (indirizzo fisso in `UsWidgetActionClient.java`). Nell'APK di staging il cuore del widget non partiva: la produzione rifiutava il token di staging, e il widget chiedeva di aprire US.
- **Ora:**
  - insieme al token l'app passa al telefono l'indirizzo delle sue Edge (`SB_URL` + `/functions/v1`, quindi staging nell'APK di staging);
  - il codice nativo accetta solo i due progetti US in https (`UsWidgetEndpoints`), così il token non può andare su un altro server;
  - niente redirect.
- **Chi ha già il widget in produzione:** la credenziale salvata prima non ha l'indirizzo, quindi va alla produzione come oggi. Non serve fare niente.
- **Test:** `UsWidgetEndpointsTest` (JVM), `tests/w1-3-silent-send.test.js`, `tests/widget-system.test.js`.
- **Da provare dall'APK di staging:** il cuore del widget Ti penso manda davvero il pensiero; l'altro telefono lo riceve.

## 2026-11-02 — Widget «Pastello» (solo Android)

**Fonte:** founder, 02/11/2026, tavola approvata (`docs/DECISIONS.md`, «Widget: la famiglia Pastello»). **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; serve un APK nuovo. Il widget «Nota» è tolto (revert di `1e0d8e9a`): niente migrazione `widget_note_v1` né Edge `widget-note`.

- **2 · Ti penso:**
  - nuova carta chiara, Fraunces e Figtree, avatar con la foto o l'iniziale e il colore della persona;
  - «Bea ti ha pensato · 2 min fa» e «Ricambia»;
  - al tocco il widget passa subito a «Ricambiato · adesso» (o «Inviato» se non era una risposta) e invia in sottofondo; «Ancora» manda di nuovo. Se non parte: «Non è partito · Riprova»;
  - il cuore fa la stessa animazione dell'app (1→0,72→1,3→0,96→1 in 440 ms, onda da rosa a lilla), in una finestrella trasparente di un attimo sopra la Home (`UsThinkHeartActivity`, non esportata); con le animazioni spente invia e basta;
  - nel medio (4×2): «12 volte che vi siete pensati oggi», i Ti penso di tutti e due di oggi (giorno di Roma), contati dall'app più quelli mandati dal widget dopo.
  - **Font:** Fraunces e Figtree dell'app, decompressi da WOFF2 a TTF (`res/font`, circa 290 KB).
  - **Da provare:** il cuore sul widget, che diventa subito rosa con «Ricambiato · adesso» e fa l'animazione dell'app; il medio con il contatore; la foto dell'altro nell'avatar, o la sua iniziale sul suo colore.
- **1 · Foto & giorni** (rifà «Foto & Noi»; «Giorni insieme» confluisce qui):
  - **Giorni insieme** non c'è più: chi l'aveva sulla Home vede Foto & Noi (stessa classe, nascosta dalla lista dei widget, col nome Foto & Noi).
  - **Dopo la prova dell'APK (founder, 02/11):** torna lo **stile di prima** e il nome «Foto & Noi» (foto a tutto riquadro, velo scuro in basso, giorni in serif, un solo layout per ogni misura). Resta la foto che cambia ogni ora; via trattini, foto rotonde e riga del posto del Pastello.
  - la foto di Oggi di quest'ora e quelle delle due ore successive, scelte con lo stesso calcolo di Oggi (`homeRotationPick`). Il widget le cambia da solo ogni ora anche a US chiusa, e i tre trattini in alto dicono quale delle tre è; dopo la terza resta sull'ultima finché US non si riapre;
  - sotto, i giorni insieme in Fraunces («195 giorni insieme»); nel 4×2 anche le vostre due foto e «dal 21 aprile · Lisbona, 12 ottobre» (da quando, e il posto o la didascalia e la data della foto);
  - sul telefono restano al massimo tre foto, solo quelle che il widget nomina; le altre si cancellano;
  - i widget «Giorni insieme» già messi mostrano Foto & giorni, che in Impostazioni non c'è più come voce a sé.
  - **Da provare:** mettere Foto & giorni, chiudere US e tornare dopo un'ora: la foto è cambiata ed è la stessa di Oggi; il 4×2 con le due foto e la riga del posto.
- **3 · La domanda di oggi:** carta lilla-pesca; l'etichetta bianca «Oggi» (nel 4×2 «La domanda di oggi»); la domanda in Figtree extra grassetto; chi ha risposto, con il pallino del suo colore. Nel 4×2 anche le vostre due foto con un cuore e una barretta a testa, che si colora quando quella persona ha risposto, e «Bea ha risposto · **tocca a te**». Mai le risposte.
  - **Colori:** ora il widget conosce il colore che ognuno mostra nell'app (rosa, lilla o quello scelto), per pallini, barrette e avatar senza foto.
  - **Da provare:** rispondere da un telefono: sull'altro, aperta US, il widget dice «Bea ha risposto · tocca a te» e colora la barretta di Bea.
- **4 · Distanza e batteria** (sostituisce «Noi» e la sua mappa): carta pesca-rosa-lilla; le vostre due foto; la distanza in Fraunces («12 km», «vicini» o «Distanza non nota») e la batteria di chi ami. Nel 4×2 «Tu» a sinistra e il partner a destra con la sua batteria, un arco a puntini con il cuore in mezzo, e sotto la distanza «aggiornato 10 min fa» (dopo una settimana sparisce). Il «Noi» già messo come 2×1 diventa una riga sola con le stesse cose.
  - **Niente mappa:** tolti lo sfondo `us_widget_noi_map_v1.webp` (era `DRAFT`, non più nel manifest), le nuvolette dei Ti penso e la doppia foto del vecchio 2×1. Nella privacy resta l'attribuzione di OpenStreetMap per la Mappa dei Ricordi; via la frase sullo sfondo del widget, e il widget si chiama «Distanza e batteria» (italiano e inglese).
  - **Dati:** nessuno nuovo. Al widget arrivano anche «vicini» (prima si perdeva) e l'ora della lettura più vecchia delle due, già calcolate dall'app; mai le coordinate.
  - **Da provare:** mettere il widget nel 2×2 e nel 4×2; con la posizione condivisa la distanza e «aggiornato …», vicini sotto i 3 km; la batteria del partner; il tocco apre Noi.
- **9 · Countdown** (sostituisce l'attuale): lo stesso Countdown scelto su Oggi.
  - 2×2: carta azzurro-lilla-rosa, l'etichetta bianca «Mancano» («Ci siamo» il giorno stesso, «Insieme da» per i giorni insieme), il numero in Fraunces prugna, «giorni · Lisbona» in corsivo e la barra rosa-lilla;
  - 4×2: un cielo con la sera a sinistra, «Lisbona · 14 novembre», il numero con «giorni» e le ore («4 ore»), 14 tacche;
  - barra e tacche sono le ultime due settimane: a 12 giorni se ne accendono 2, il giorno stesso tutte. Per «Insieme da» l'anno verso il prossimo anniversario;
  - l'ultimo giorno di un Countdown con l'ora il numero diventa il conto alla rovescia che va da solo, come prima;
  - **differenze dalla tavola:** le ore senza i minuti («4 ore», non «4 ore · 21 minuti»), così il widget si ridisegna una volta all'ora e non ogni minuto; la riga «giorni a Lisbona» diventa «giorni · Lisbona» perché il titolo è libero («giorni a Il nostro momento» non va). Gli stili premio del Countdown (Aurora, Chrome, Orbit…) restano nell'app ma non cambiano più l'aspetto del widget.
  - **Da provare:** un Countdown a una data e uno con l'ora, nel 2×2 e nel 4×2; l'ultimo giorno il conto alla rovescia; «Insieme da».
- **7 · Lasciato per te** (sostituisce «Messaggio», che in Impostazioni ora si chiama così): carta lilla-rosa, la foto di chi ami (o la sua iniziale sul suo colore), una nuvoletta bianca «Ti ha lasciato una foto», sotto «10 min fa» e la busta rosa. Nel 4×2 anche «la scopri solo dentro US», «Bea · 10 min fa» e la pillola rosa «Apri». Il tocco apre il Lasciato per te.
  - **Solo tipo e ora** (founder, 31/10): mai le parole, la foto o il link.
  - **Cambia:** mostra solo il Lasciato per te ancora chiuso, non più l'ultimo Ti penso (per quello c'è il widget Ti penso). Senza niente da aprire: «Il prossimo Lasciato per te arriverà qui».
  - **Da provare:** lasciare una foto da un telefono: sull'altro, aperta US, il widget dice «Ti ha lasciato una foto · ora»; aprirla: il widget torna vuoto; il 4×2 con «Apri».
- **6 · Ricordi a pila** (widget nuovo): carta crema-lilla con una pila di tre foto, quelle dietro girate, quella sopra col bordo bianco. Sotto il posto in Fraunces e il giorno («Lisbona · 12 ott»); nel 4×2 a destra «Un anno fa», il posto, «12 ottobre · 8 foto» e un trattino per ogni foto della pila.
  - **Quali foto:** le foto di questo giorno in un anno passato («Un anno fa», «2 anni fa»: vince l'anno più lontano, come Rivivi); altrimenti le tre più recenti, con «I più recenti». «Un anno fa» vale solo quel giorno: a mezzanotte l'etichetta sparisce, la pila resta finché US non si riapre.
  - **Come:** la pila la disegna US mentre è aperta (all'avvio, ogni 6 ore, quando cambia Ricordi), dalle anteprime che Ricordi già usa, e passa al widget due immagini (2×2 e 4×2). Nella fotografia del widget c'è solo quale ricordo è, mai un percorso o un link. Le immagini stanno nella memoria privata del widget e si cancellano con l'account.
  - **Dati:** nessuno nuovo; legge i Ricordi come la pagina Ricordi. Il tocco apre Ricordi.
  - **Da provare:** mettere il widget; con una foto di oggi un anno fa compare «Un anno fa»; senza, le tre più recenti; aggiungere una foto in Ricordi: la pila cambia.
- **Anteprime Pastello:** nella lista dei widget del telefono ogni widget ha la sua carta Pastello, sia come layout (Android 12+) sia come immagine PNG, che molti launcher (Xiaomi compreso) mostrano al posto del layout. In Impostazioni › Widget ogni tessera è la carta del suo widget. «Giorni insieme» non compare più nella lista (è dentro Foto & giorni); quelli già sulla Home continuano a funzionare.
  - **Dopo un aggiornamento** i widget già sulla Home si ridisegnano da soli col layout nuovo (`MY_PACKAGE_REPLACED`, c'era già dalla V1; ora ha un test). Su Xiaomi, se l'avvio automatico di US è spento, il sistema può bloccare questo segnale: allora si ridisegnano alla prima apertura di US o al giro dell'ora.
  - **Da provare:** aprire la lista dei widget del telefono: tutte carte chiare, nessuna scura; Impostazioni › Widget in US.
- **Correzioni dopo la prova dell'APK (founder, 02/11):**
  - **Ti penso e la Domanda «non si vedevano»:** il launcher scriveva «Impossibile caricare il widget» per un elemento (`Space`) che i widget Android non accettano. Tolto ovunque; un test ora accetta solo gli elementi ammessi. Visti sull'emulatore uno per uno, in chiaro e in scuro.
  - **Ti penso:** il cuore usciva dal bordo, ora sta dentro. **Distanza e batteria:** senza distanza «Distanza non nota» copriva le foto, ora è piccola.
  - **Tema del telefono:** chiaro = Pastello, scuro = «Midnight» (i colori notte di US); cambia da solo appena cambia il tema, anteprime comprese. Su Android 11 e precedenti i colori del cuore e della batteria si aggiornano al giro successivo.
  - **Da provare:** cambiare il tema del telefono con i widget sulla Home.
  - **Limite noto:** i launcher non applicano i caratteri Fraunces e Figtree nei widget: si vede il carattere del sistema.
- **5 · Come stai** (funzione nuova, app e widget; `docs/missions/widget-come-stai-v1.md`):
  - **In Oggi** una pillola accanto alla distanza: l'emoji di chi ami e la tua, o «Come stai?». Il tocco apre i 12 stati (🥰 😊 😴 😔 😤 🤒 🥳 💼 📚 🏋️ 🚗 🍝); un tocco salva, «Togli» lo toglie. Dura 12 ore. Niente notifica.
  - **In Impostazioni › Tu › «Come stai»** ognuno sceglie le sue parole al maschile o al femminile; senza scelta, parole che non cambiano («in amore», «senza energie»).
  - **Widget** (Android): 2×2 con lo stato di chi ami («innamorata · da 1 ora»); 4×2 con te su metà rosa e chi ami su metà lilla, il cuore nel mezzo. Il tocco apre i 12 stati in Oggi; il widget non scrive mai.
  - **SQL:** `20261102170000_member_status_v1.sql` (tabella `member_status`, RLS di coppia, ore del server, Realtime). Va su staging **prima** del web, col workflow «Supabase SQL (manual)» approvato dal founder; senza tabella l'app non mostra la pillola.
  - **Privacy:** aggiunte la riga dei dati e una frase («Come stai»), italiano e inglese.
  - **Da provare:** scegliere uno stato su un telefono: sull'altro compare subito in Oggi e nel widget; cambiare la forma in Impostazioni; dopo 12 ore sparisce.

## 2026-11-02 — Widget «Foto protagonista» (solo Android)

**Fonte:** founder, 02/11/2026 (`docs/DECISIONS.md`, «Widget: "Foto protagonista"»). **Branch:** `claude/gallant-ardinghelli-bb2acf`. **Stato:** solo nel branch; serve un APK nuovo. Nessun SQL, nessun dato nuovo.

- **Base comune:** 17 illustrazioni morbide (chiaro e scuro, WebP, circa 180 KB in tutto) e una grana leggera; i titoli e i numeri in Fraunces disegnati dal widget, perché il launcher non usa i caratteri dell'app; le iniziali su un fondo sfumato al posto dei dischi di colore.
- **Ti penso:** illustrazione col cuore disegnato, la foto di chi ami piccola e tonda (o l'iniziale), «Bea ti ha pensato» in Fraunces, solo il cuore di vetro: niente «Ricambia», anche nel 4×2. Nel 4×2 «12 volte oggi» in rosa accanto al cuore. Non collegato: «Apri US» e sotto «per riattivare l'invio» (prima «Apri US per riattivare…» tagliato).
  - **Da provare:** il cuore diventa rosa al tocco; «Apri US» non si taglia; tema chiaro e scuro.
- **La domanda di oggi:** illustrazione con due nuvolette, l'etichetta di vetro «Domanda di oggi», la domanda in Fraunces; sotto la piccola foto di chi ha risposto e «ha risposto · tocca a te». Nel 4×2 le vostre due foto (quella di chi non ha ancora risposto più tenue) e «Bea ha risposto · **tocca a te**». Il vuoto sotto la domanda non c'è più. Via pallini e barrette colorate.
  - **Da provare:** rispondere da un telefono: sull'altro, aperta US, compare la foto di chi ha risposto; tema chiaro e scuro.
- **Distanza e batteria:** illustrazione col sentiero a puntini e il cuore, la distanza in Fraunces e «aggiornato 10 min fa»; le vostre foto piccole e tonde (nel 2×2 in basso accanto a «Tu» e a «Bea 78%», nel 4×2 negli angoli in alto); il 2×1 già messo con la stessa illustrazione.
  - **Da provare:** 2×1, 2×2 e 4×2; senza distanza «Distanza non ancora nota» piccola; tema chiaro e scuro.
- **Countdown:** sempre illustrato (il sole sull'orizzonte), l'etichetta di vetro «Mancano», il numero in Fraunces con «giorni / Lisbona» in corsivo, 14 tacche (rosa i giorni passati) anche nel 2×2 al posto della barra; nel 4×2 «Lisbona · 14 novembre · 4 ore» sotto le tacche. L'ultimo giorno resta il conto alla rovescia.
  - **Da provare:** un Countdown a una data e uno con l'ora, 2×2 e 4×2, tema chiaro e scuro.
- **Lasciato per te:** busta disegnata, la foto piccola di chi te l'ha lasciato, un bigliettino inclinato col sigillo rosa: «Ti ha lasciato una foto» in Fraunces e «da Bea · 10 min fa»; nel 4×2 sotto «la scopri solo dentro US». La sorpresa resta chiusa. Via la pillola «Apri» (apre il tocco su tutto il widget).
  - **Da provare:** lasciare una foto da un telefono e guardare l'altro; senza account «Apri US per collegarlo» non si taglia; tema chiaro e scuro.
- **Come stai:** fondo sfumato, la foto tonda di chi ami (o l'iniziale) con l'emoji come adesivo, il nome in Fraunces e «innamorata · da 1 ora»; nel 4×2 due metà sfumate, tu a sinistra e chi ami a destra, il cuore in mezzo. Via le metà di colore piatto.
  - **Da provare:** scegliere uno stato: compare sulla foto; senza foto l'iniziale; tema chiaro e scuro.
- **Foto & Noi** (foto a tutto widget, segue il tema): la foto di Oggi con la grana leggera che in basso sfuma nella carta del tema (crema col tema chiaro, notte col tema scuro, come prima), «195» in Fraunces e «giorni insieme» in corsivo. Senza foto: illustrazione col sole e la luna e «La foto di Oggi apparirà qui». Resta la foto che cambia ogni ora.
  - **Da provare:** con la foto, tema chiaro e scuro; senza foto.
- **Ricordi a pila** (foto a tutto widget): nel 2×2 il ricordo più recente riempie il widget e gli altri due spuntano dal bordo in alto; la data va su una riga sua («2 nov · un anno fa») e il titolo in Fraunces sotto, così «Weekend a Firenze» non si taglia più. Nel 4×2 un ventaglio di tre foto su un fondo sfumato, «Un anno fa», il titolo e «2 novembre · 8 foto». Senza ricordi: polaroid vuote disegnate. Le immagini le disegna US (`widgets.js`), quindi serve anche il web nuovo.
  - **Da provare:** con un ricordo di oggi un anno fa e senza; un titolo lungo.
- **Anteprime:** nella lista dei widget del telefono ogni widget ha la sua immagine Foto protagonista, generica (nessun nome, viso o foto vera), chiara col tema chiaro e scura col tema scuro, anche Foto & Noi; da Android 12 il layout d'anteprima mostra la stessa immagine. In Impostazioni › Widget le tessere hanno fondi sfumati al posto dei colori pieni.
  - **Da provare:** la lista dei widget del telefono in chiaro e in scuro; Impostazioni › Widget.

## 2026-11-03 — Copia dei dati: note, batteria e Come stai

- **Database:** migrazione `20261103010817_s32_export_notes_battery_status.sql`. Ridefinisce `s32_export_user_data`, la funzione che legge l'Edge `export-user-data` (la copia preparata dal supporto su richiesta, D-7). Aggiunge:
  - le note condivise scritte o modificate per ultima da quella persona;
  - la sua lettura della batteria;
  - il suo «Come stai».

  Gli id del partner restano esclusi, anche `updated_by`. Resta riservata a service_role. Test: `tests/s32-export-notes-battery-status-db.test.js`.
  - **Ordine:** dopo le migrazioni delle Note (`20261031132258`), della Batteria (`20261031134410`) e di Come stai (`20261102170000`), perché legge le loro tabelle. Su staging e poi in produzione solo con il workflow «Supabase SQL (manual)» e il via del founder.
- **Uscita dalla coppia:** batteria e Come stai di chi esce spariscono già. `s32_close_membership` cancella il suo profilo e le due tabelle vanno in cascata. Nessuna migrazione: lo copre `tests/leave-couple-personal-rows-db.test.js`.

## 2026-11-03 — La sfida della settimana al posto delle missioni (fase 3 della Noi nuova)

**Stato:** su staging dal 03/11 (due migrazioni e due Edge applicate con il via del founder), non in produzione. Missione: `docs/missions/sfida-settimana-v1.md`.

- **Una sfida a settimana per coppia**, scelta dal server secondo «Come vi vedete», con un solo cambio; in Gioca › Giochi sotto la domanda del giorno, su Oggi da venerdì se non è fatta.
- **Si chiude con una foto**, che diventa un Ricordo segnato «Sfida». Coppie a distanza: due foto affiancate, e con una sola a fine settimana valgono 30 punti invece di 60. Serie di settimane di fila: 100 punti in più ogni 4.
- **Notifiche:** lunedì alle 9 la sfida nuova, sabato alle 10 il promemoria se non è fatta, e «manca solo la tua foto» per chi è a distanza. Interruttore in Impostazioni › Notifiche › La sfida della settimana (colonna `bond` già esistente).
- **Missioni vecchie:** tabelle e storico restano; non si creano più bacheche settimanali.
- **Database:** `20261103205157_weekly_challenge_v1.sql` (catalogo, `couple_weekly_challenges`, `couple_weekly_challenge_photos`, RPC, export con anche i tratti della lavagna) e `20261103205200_weekly_challenge_job_cron.sql` (cron orario solo dove c'è `us_project_url`: su staging non pianifica nulla). Edge nuova `weekly-challenge-job`; `send-web-push` con `challenge_photo`.
- **Android:** tre tipi di notifica nuovi in `UsPushNotices.java`: serve l'APK nuovo.
- **Ordine in produzione:** le quattro migrazioni della Noi nuova in ordine di nome (`…204751_couple_notes_color`, `…205050_lavagna_v1`, `…205157_weekly_challenge_v1`, `…205200_weekly_challenge_job_cron`), poi le Edge `send-web-push` e `weekly-challenge-job`, poi web e AAB. Su produzione il cron parte davvero: controllare il primo lunedì.

## 2026-11-03 — Noi nuova, fase 1: calendario protagonista e bacheca

**Stato:** su staging dal 03/11 (migrazione applicata con il via del founder), non in produzione. Decisione in `docs/DECISIONS.md` («Noi nuova, lavagna e sfida della settimana»); tavole `Main.dc.html` e `Bacheca.dc.html` del canvas «Noi · rework». In produzione solo insieme alle fasi 2 e 3, con il via del founder.

- **Calendario:** caselle grandi, niente cerchi, pallini né legenda. Ogni impegno è un'etichetta col suo nome nel colore di chi l'ha messo (due al massimo, poi «+n»); un giorno con un Ricordo mostra la sua foto. Oggi in grassetto, il giorno scelto con una cornice. Sotto, l'agenda del giorno: il Ricordo (si apre nel suo album), gli impegni con orario e di chi, «Aggiungi a questo giorno» (l'editor che c'era). Viste «Mese» e «Prossimi»: da oggi a un anno, con compleanni, mesiversari, anniversario e traguardi dei giorni (al massimo 30 voci).
- **Via da Noi:** le tessere Lavagna, Missioni, Eventi e Note e il pulsante «Il nostro giorno» (la data resta in Impostazioni). Eventi e anniversari si aprono dalle loro date nel calendario. Il codice delle missioni resta: lo sostituisce la fase 3.
- **Bacheca:** sotto il calendario i post-it, scritti e spuntati sulla pagina, carta gialla, rosa, azzurra o verde, autore in basso. Su Noi al massimo 6; «Tutti i post-it (n)» apre la bacheca intera con i filtri per colore. In cima il post-it fisso «Da vivere» con le idee di prima: spuntarne una vuol dire «vissuta» (la prima persona propone, l'altra conferma, come prima). Sopra i post-it c'è il posto vuoto per la Lavagna (fase 2).
- **Database:** migrazione `20261103204751_couple_notes_color.sql`: colonna `color` in `couple_notes` (yellow, pink, blue, green; giallo di default; nessun dato cancellato). Stessa RLS e stessa guardia. L'export SQL la include già; l'Edge `export-user-data` la elenca (`s3-2-export-core.mjs`), quindi va ridistribuita **dopo** la migrazione. Ordine: SQL, poi Edge, poi sito/APK. Test: `tests/couple-notes-color-db.test.js`.
- **Privacy:** nessun dato nuovo oltre al colore del post-it.

## 2026-11-04 — Bacheca: un post-it non sparisce più da solo

**Stato:** su staging dal 04/11 (build 95), non in produzione. Va in produzione con la Noi nuova.

- **Post-it sicuri:** chiudere un post-it vuoto lo cancellava senza chiedere. Ora se ne va da solo solo un post-it nuovo mai riempito (non è mai arrivato al server); uno che è sulla bacheca, svuotato a mano, chiede sempre (anche se scritto un attimo prima) «Staccare il post-it?» («Stacca» o «Tienilo»: in quel caso resta com'era). Un evento Realtime che arriva senza il testo del post-it (Supabase toglie i valori oltre 64 byte quando una modifica è troppo grande) non lo svuota più: la bacheca si rilegge. Test: `tests/couple-notes-close.test.js` e `tests/couple-notes-close-browser.test.js` (tutti i modi di chiudere un post-it, nel browser).
- **Calendario:** nelle caselle le date di coppia dicono quanto, anche su due righe («34 mesi», «3 anni», «4100 giorni») invece di «Mesi…». In «Prossimi» e nell'agenda il traguardo dei cento giorni non ripete più il numero sotto il titolo.
- **Post-it storti:** inclinati tra 1° e 2°, a destra o a sinistra, come nella tavola (prima molti erano a 0° o mezzo grado e sembravano dritti).
- **Database:** niente.

## 2026-11-04 — Widget nuovi, sei Atmosfere, Ricordi come album, Prossimi senza trattini

**Stato:** su staging dal 04/11, non in produzione. Va in produzione con la Noi nuova, solo con il via del founder. Tavole nel canvas «Widget, sfondi e Ricordi» (https://claude.ai/artifact/PiHBn6bmN7G5JCYiTsQURg).

- **Widget Android:**
  - **Ti penso:** solo un cuore vuoto. Toccandolo si riempie con un pop sopra la Home e parte il Ti penso.
  - **Distanza e batteria:** solo l'altra persona (foto, nome, distanza, batteria). La tua foto e «Tu» non ci sono più.
  - **Come stai:** solo le due foto, ognuna con la sua faccina; niente nomi, righe e cuore in mezzo.
  - **La domanda di oggi:** la domanda in grande su uno sfondo calmo, il tasto «Rispondi» («Leggi» quando avete risposto tutti e due) che apre la domanda in US.
  - **Lasciato per te:** sfondo nuovo, una busta color crema con il sigillo; sopra «Ti ha lasciato una foto · da Bea · 10 min fa».
  - **Countdown tolto.** Al suo posto il widget **Post-it**: l'ultimo post-it della bacheca sulla sua carta, chi l'ha scritto e «+2» se ce ne sono altri. Toccandolo apre Noi. Si aggiorna quando US è aperta.
  - Anteprime nuove nel selettore dei widget. Serve l'APK nuovo.
- **Sfondi (Atmosfere):** US parte su **Vino**, un gradiente vino scuro che resta fermo mentre la pagina scorre (prima: nero pieno). Le Atmosfere di Sintonia diventano gradienti: **Prugna** (livello 3, era Rosé), **Notte blu** (5, era Mezzanotte), Pellicola (7), Ora blu (9), **Grafite** (12, grafite e argento con un riflesso). Chi le aveva già sbloccate le ritrova: stessi id e livelli.
- **Ricordi:** solo l'album. Le foto mese per mese, tre per riga, quadrate, senza scritte. Escono Conservati, i «Vissuto insieme» senza foto, le domande conservate, le idee e i capitoli per anno: i dati restano salvati, non si vedono più in Ricordi. Attenzione: Conservati (le cose tenute di Lasciato per te) ora non ha più un ingresso nell'app.
- **Noi, Prossimi e agenda:** niente più «—» al posto dell'ora. Un mesiversario o un traguardo ha un cuore dorato, un impegno senza ora il calendario; i riquadri non hanno più il bordo.
- **Database:** migrazione `20261104140000_atmosfere_gradienti.sql`, solo titoli e descrizioni di cinque premi (nessun dato cancellato). Ordine: SQL, poi web, poi APK/AAB.
- **Privacy:** il widget Post-it mostra sulla Home le parole dell'ultimo post-it della coppia (come la domanda del giorno). Nessun nuovo tipo di dato per Google Play.
- **Conservati in Lasciato per te** (founder, 04/11): la voce «Conservati» (con quante cose avete tenuto) è in fondo a Lasciato per te, sia quando lasci qualcosa sia quando apri; compare solo se avete conservato qualcosa e apre Conservati sopra. Il titolino in Conservati ora dice «LASCIATO PER TE».
- **Nuovo impegno** (founder, 04/11): accanto a Lavoro, Università e Uscita c'è un «+» per aggiungere un titolo rapido proprio (es. «Palestra»): resta tra i titoli, su questo telefono, per chi l'ha aggiunto (al massimo 8); una pressione lunga lo toglie, dopo aver chiesto. Inizio e Fine partono vuoti con «00:00» come suggerimento (prima 09:00 → 10:00) e i due punti compaiono da soli mentre scrivi («9» diventa «09:», «2.00» diventa «02:00»); la fine non si riempie più da sola un'ora dopo l'inizio.
- **Lavagna nera** (founder, 04/11): la lavagna nell'app e il widget «Lavagna» con il tema scuro sono neri, come una lavagna vera (prima prugna).
- **Icona dell'app senza riquadro** (founder, 04/11): l'icona sul telefono è «US» con la stellina, senza la cornice attorno (il logo approvato il 29/10). Sostituisce la scelta del 30/10 di tenere l'icona di sempre. Splash e notifiche non cambiano. Si vede solo con l'APK/AAB nuovo.
