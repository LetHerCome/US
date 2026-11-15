# Missione — «Il diario, ma pulito»

**Stato:** IN BRANCH (`claude/diario-pulito-c85387`, nato da `main` a4d6018e). Solo staging ed emulatore. La produzione non si tocca: niente merge su `main`, niente SQL o Edge di produzione, niente deploy del web di produzione.

**Fonte del design:** lo studio approvato dal founder il 15/11/2026, https://claude.ai/artifact/Phwo9n9Q8sZro7jX8HAN6Y («Il diario, ma pulito»). Il founder: «il mockup lo devi portare uguale altrimenti non ha senso». Il metodo viene da happn (base calda, poche tinte con un ruolo, misure fisse, una parola in corsivo nei titoli, illustrazioni solo nei momenti); font, colori e contenuti sono nostri.

## Decisioni del founder (15/11/2026)

- Via la polaroid e via i timbri. Il Ti penso resta il cuore di US (`assets/icons/think-on.svg`, rosa `#FF5477`).
- Sintonia esce da Gioca e va nei personaggi: toccandoli si apre «Voi due».
- Il gatto Maudit esce; i suoi premi non si mostrano. Al loro posto arriveranno **accessori dei personaggi** (occhiali, cappello, cuffie…): nella fase 1 solo l'anteprima in «Voi due», niente SQL.
- Ogni animazione ha un motivo, scritto nel mockup; niente loop; con «riduci movimento» si ferma tutto.
- Si parte da `main` (contiene tutto il branch di staging, fermo al 09/11, più 1.5 e 1.5.1). Si prova con US LIVE sui dati di staging.
- Le **Atmosfere** (`data-us-theme`: rose, midnight, graphite, film, blue_hour) e i temi di Oggi vanno **in pausa**: vale solo la carta. La scelta salvata resta nel database, non si vede; il selettore si nasconde. Chi le ha sbloccate non perde niente.

## Fase 1 (da mostrare per prima)

1. **Fondamenta, in un posto solo** (`ui-foundation.css`, `:root`):
   - carta `#FAF7F1`, beige `#F0EBE2`, scheda `#FFFDF9`;
   - inchiostro `#14120E` al 4, 8, 12, 40, 60, 80%;
   - rosso matita `#D3402A`, solo per gli scarabocchi;
   - colori della coppia da `person-colors.js` (`--us-rosa` chi ha creato, `--us-lilla` chi è entrato) con le versioni tenui; miele `#F3D27A` per le date, cielo `#B4D8F4` per la distanza;
   - Figtree per l'interfaccia (30, 20, 15, 13), Fraunces corsivo per una sola parola nei titoli, scrittura a mano solo per i testi della coppia;
   - bottoni alti 32, 44, 52, 64 con angoli 8, 12, 16; etichette 24, 28, 44; bottoni a icona quadrati da 44.
   I vecchi token scuri (`--us-color-*`) puntano ai nuovi: nessuno strato nuovo sopra.
2. **Barra:** l'icona fa un salto, sotto si disegna lo scarabocchio rosso, la pagina entra da destra o da sinistra secondo l'ordine delle schede (260 ms).
3. **Oggi:** cuore del Ti penso, «us», busta; «Domenica, *15 novembre*» e «Pagina N dei vostri giorni»; la foto del giorno piena da Ricordi con didascalia a mano e pallino del colore di chi l'ha caricata; la frase del giorno da dati veri con modelli scritti da noi (senza IA, senza confronti su chi fa di meno); i due personaggi sull'angolo della foto; la domanda di oggi con la risposta dell'altra persona sfocata finché non rispondi. Ti penso: il cuore pulsa, tre cuoricini, avviso, i personaggi saltano.
4. **«Voi due»:** foglio che si apre dai personaggi; è Sintonia (`progression.js`): i due cerchi che si avvicinano, la barra fino al livello, i giorni di fila, il prossimo premio. «+10 Sintonia» vola verso i personaggi dopo una risposta.
5. **Personaggi:** palla per chi ha creato la coppia, quadrato per chi è entrato, nel colore della persona, in SVG come nel mockup. Il gatto (`pet.js`) si nasconde.

## Fase 2

Noi (calendario con le stanghette per persona, «In arrivo» con etichette), Ricordi (il diario per giorni, numero in corsivo, foto arrotondate, filtri Tutti, Tue, Di <nome>), Gioca (la sfida e «Da giocare» con icone nere quadrate ed etichette di stato). Stesso metodo: screenshot affiancati al mockup e differenze scritte.

## Vincoli

- Mai dare per scontato il genere dei partner (`tests/content-1-0-catalog.test.js`).
- Budget della shell offline intorno a 3,2 MB (`tests/us-perf-1-0-precache.test.js`).
- CSS: token in un posto solo; il nuovo disegno sta in `diario.css` con classi sue, senza `!important` e senza ritoccare le vecchie regole dall'alto.
- SQL solo su staging e solo col via del founder.

## Fatto vuol dire

- La fase 1 gira su «US LIVE» nell'emulatore con i dati di staging.
- Screenshot affiancati al mockup, `npm test`, `npm run build:cloudflare-pages`, `git diff --check` verdi.
- L'elenco di cosa è diverso dal mockup e perché (in fondo a questo file).
- Commit sul branch; push solo col via del founder.

## Differenze dal mockup (fase 1)

Provato su «US LIVE» nell'emulatore con la coppia di prova di staging (15/11/2026).

**Dati, non disegno**
- Le foto sono quelle vere di Ricordi (su staging due immagini di prova, senza didascalia): la didascalia a mano compare solo quando c'è.
- «Pagina N» conta i giorni da «Insieme dal»: la coppia di prova ha una data del 2015, quindi «Pagina 4055».
- I personaggi hanno i colori scelti dalla coppia (su staging perla e oro), non rosa e lilla.
- Il telefono è largo 412 invece di 390: la foto si allarga, l'altezza resta 362.

**Scelte per far funzionare l'app vera**
- «Rispondi» apre il foglio della domanda che c'è già; nel mockup la risposta compariva subito.
- La risposta dell'altra persona sfocata è una riga finta: il server non manda le sue parole prima della tua risposta. Quando avete risposto tutti e due, finché non le hai lette compare «Leggi» (il foglio segna la lettura); al ritorno la risposta si mette a fuoco e sale «+10 Sintonia» (i 10 punti che il server dà quando rispondete tutti e due). Mentre aspetti: «Aspettiamo <nome>» e «Modifica».
- La frase del giorno usa solo modelli nostri: mesi o centinaia di giorni insieme entro una settimana, la distanza (con il prossimo impegno), il prossimo impegno, «Un anno fa, proprio oggi», l'età della foto, «Questa l'ha scelta <nome> per i Ricordi». Mancano «Terza volta questo mese che rispondete uguale» (non c'è un dato che lo dica) e «Bea ha scelto questa foto per oggi» (non esiste la scelta della foto del giorno). Toccando la foto cambiano foto e frase.
- Sotto la domanda restano gli avvisi che chiedono un gesto (Ti penso ricevuto, Lasciato per te, risposte pronte, sfida, turno di gioco) e l'invito alle notifiche, nello stesso stile delle schede.
- «Voi due» → «Gli ultimi punti» mostra sfide, eventi vissuti e mesiversari: sono le sole righe che l'app può leggere. Domande e partite non ci sono (servirebbe una lettura nuova sul server, solo su staging e col tuo via).
- «Al livello N: gli occhiali» è l'anteprima degli accessori dei personaggi (tua scelta del 15/11): non c'è ancora uno sblocco vero. In fondo al foglio «I premi che avete» apre la collezione di prima (in Gioca, senza più l'interruttore Sintonia) finché non arrivano gli accessori.
- I giorni di fila sono quelli della serie di «La cosa di oggi».

**Tolto da Oggi (da decidere con te)**
- Il countdown sulla foto, la pillola «Come stai», la pillola del prossimo impegno e quella della distanza (distanza e impegno vanno nella frase), i temi ed effetti di Oggi, la foto a tutto schermo, i passi della prima settimana di «La cosa di oggi» dopo le risposte.

**Asset e regole**
- In alto c'è «us» in Permanent Marker come nel mockup, al posto del logo US con la stellina; icona dell'app e apertura restano quelle approvate.
- La barra usa le icone a tratto del mockup, non Phosphor.
- Il corsivo è il Fraunces «Soft» che US ha già: lettere un po' più morbide del Fraunces del mockup.
- L'animazione d'apertura resta scura (vino): è un asset approvato.

**Resto dell'app**
- Noi, Ricordi, Gioca, Impostazioni e i fogli prendono la carta dai token ma non sono ancora ridisegnati (fase 2). Nei fogli vecchi i bottoni principali sono ancora nel colore della persona.
- Il gatto non si monta più; pet.js e pet.css non sono più nella shell. Le Atmosfere sono in pausa (la scelta resta salvata).
- Tolte circa 56 KB di regole CSS che colpivano solo pezzi non più montati (vecchio Oggi, vecchia barra, gatto): così la shell offline resta sotto i 3,2 MB.

## Differenze dal mockup (fase 2)

Il founder il 15/11 (via la sessione principale): «per ora tieni questo logo porta tutto su staging essendo tanto fedele al mockup poi ovviamente lo aggiustiamo piano piano». Fase 2 fatta con lo stesso metodo, provata su US LIVE.

**Noi**
- Titolo «I vostri *giorni*», «+» nero (nuovo impegno), interruttore Mese / Prossimi, il mese in una scheda con le stanghette per persona sotto i giorni (le cose condivise hanno tutte e due i colori), il cerchio rosso sulle vostre date, i giorni dei mesi vicini in grigio, «In arrivo» con le etichette (tu, <nome>, insieme; mesiversario, anniversario, traguardo, data speciale, l'ora).
- Accanto al «+» c'è l'ingranaggio delle Impostazioni: nel mockup non c'è, ma stava nella scheda della coppia in cima a Noi, che ora è nascosta.
- Toccando un giorno si apre il suo dettaglio sotto il mese (come prima); nel mockup un tocco non faceva niente.
- Le date vostre in «In arrivo» si chiamano «7 mesi insieme», «4100 giorni insieme».
- Sotto restano Bacheca e lavagna (non sono nel mockup, sono funzioni in uso), con i colori della carta ma non ridisegnate.
- «Prossimi» mostra fino a 30 righe dei prossimi dodici mesi; il mockup diceva «da qui a Natale».

**Ricordi**
- «Il vostro *diario*», mappa e «+», i filtri Tutti / Tue / Di <nome>, il diario per giorni con il numero in corsivo, foto arrotondate con il pallino di chi le ha messe, la didascalia a mano, la domanda del giorno con le due risposte, «Due/Tre… giorni tranquilli» tra due giorni vicini dello stesso mese.
- Mancano rispetto al mockup: il conto dei Ti penso sulla foto e la sfida della settimana come giorno del diario (non c'è un dato pronto per l'app); il riepilogo «Questo o quello: 6 scelte uguali su 8» sotto la domanda.
- Rivivi e l'album a griglia non si vedono più; toccare una foto apre l'album di prima.

**Gioca**
- «Giochi *a due*» con «N su 3 oggi» in miele, la sfida della settimana nel riquadro beige con le due foto (quella dell'altra persona con l'etichetta, la tua tratteggiata nel tuo colore), «Da giocare» con le icone nere quadrate e le etichette di stato (tocca a te, risposte pronte, aspetti <nome>, giocato, domani, da giocare).
- I giochi sono quelli veri (Per voi, Questo o quello, Scopritevi, Confrontatevi, Ridete, Quanto mi conosci?, Rivivete), non i quattro del mockup; le icone sono nello stesso tratto.
- La domanda di oggi non è più in Gioca (resta su Oggi), come nel mockup; la settimana a pallini e il contatore a pallini sono tolti. Sotto restano «La vostra domanda», «Da continuare» e le partite completate, non ancora ridisegnate.
- Nella sfida: sparita la fila dei bonus ogni quattro sfide e la regola lunga; resta una riga con scadenza e punti, e «Cambia».

## Differenze dal mockup (Impostazioni, v4.1)

Branch `claude/diario-impostazioni`. Provato nel browser col finto Supabase a 390×844, chiaro e scuro.

- Uguale al mockup: testata con «‹» verso Noi, scheda della coppia (i due personaggi, «<nome> *e* <nome>», «Insieme dal … · livello N», apre «Voi due»), i quattro gruppi Tu / Voi due / App / Aiuto e account, righe da 58 con filo, icone a tratto su 36, interruttori in inchiostro, Aspetto Automatico / Chiaro / Scuro (UsAspetto), Distanza in km / mi, US Plus «in arrivo» in miele, la distanza in cielo, «US · *fatto in due*».
- Tolte: «Compagni» (il gatto è in pausa) e «Foto Home».
- Righe in più rispetto al mockup, perché sono funzioni in uso: in Tu «Le tue parole» (Come stai al maschile o al femminile); in Voi due «Archivio Stories» (solo web, il build nativo la toglie); in App «Widget» (solo app) e «Ottimizza Ricordi» (solo app e solo se ci sono foto da alleggerire: è un'azione una tantum, quindi una riga con freccia e non un interruttore); in Aiuto e account «Sincronizzazione». Elimina account e la copia dei dati restano dentro «Privacy e dati». Lingua e Novità non esistono in Impostazioni.
- «La distanza» apre la domanda «Vi vedete spesso o vivete a distanza?» (distance.js); i km compaiono solo quando Oggi li conosce.
- Notifiche e Suoni e vibrazione: l'interruttore fa la cosa subito; toccando il testo si apre il foglio di prima (i tipi di notifica, la prova dei suoni). Posizione: l'interruttore passa dal foglio di prima (spiegazione prima del permesso, «Smetti e cancella» per spegnere). Quando il telefono blocca le notifiche, la seconda riga lo dice al posto di «Ti penso, risposte, turni di gioco».
- Il tuo personaggio: cinque forme nel tuo colore. Si salva con `set_my_character_shape`; finché la migrazione 20261115183900 non è applicata la scelta resta su questo telefono (`us:character-shape:<id>`), e UsDiario.shapeOf la legge solo per il tuo ruolo e solo se il server non ha una forma.
- Sotto «US · fatto in due» resta la riga piccola con la build (scelta del 03/11). Sul web la versione è solo «US» (la versione esiste solo nell'app installata).
- «Segnala un problema» come nel mockup; il foglio dice ancora «Segnala un problema o un contenuto» (Play).
- I fogli che si aprono dalle righe sono quelli di prima, con i colori della carta, non ridisegnati.

## Decisioni del founder sui punti aperti (15/11/2026, «concordo con tutto»)

- **D1 Countdown:** un countdown attivo verso una data è la frase del giorno sopra la foto, al posto delle altre («12 giorni · Padova»); «Insieme da» (quello di base) resta una delle frasi che girano. Si crea e si cambia da Noi: «Countdown» nel modulo del «+» e la riga «countdown» in cima a «In arrivo». Dopo il salvataggio: «Salvato». **Fatto.**
- **D2 Come stai:** nel foglio «Voi due», riga «Come stai» con il tuo personaggio, le parole e «Cambia» (apre il foglio dei dodici stati); la faccia dei personaggi segue l'umore (felice, cuore pieno, giù, stanco, teso) anche su Oggi. La batteria resta solo nel foglio della distanza. **Fatto.**
- **D3 Widget Android:** restano scuri; lavoro a parte dopo la prova su staging. **Non fatto (rimandato).**
- **D4 Noi:** `openCalendar({date})` apre anche il dettaglio del giorno; la cella di oggi dice se è il giorno scelto. **Fatto.**
- **D5 «Cambia» della sfida:** resta 32 px a vista, area di tocco 44 px (`.dy-hit`). **Fatto.**
- **D6 Gatto e Atmosfere:** vanno bene per staging; la nota per la produzione è in `docs/store/PROSSIMA_PATCH_PRODUZIONE.md`. **Fatto.**

## Verifiche (15/11/2026)

- `npm test` (dopo D1–D5): 2779 test, 16 rossi, tutti già rossi su `main` pulito (prove browser instabili o dell'ambiente); 80 saltati con motivo «Il diario, ma pulito (15/11/2026): …» dove proteggevano funzioni ritirate (gatto, Atmosfere, vecchio hero, barra a pillola).
- `npm run build:cloudflare-pages` e `git diff --check` puliti; shell offline sotto i 3,2 MB.
- Prova a vista su «US LIVE» nell'emulatore, dati di staging: Oggi, Ti penso, Voi due, Noi, Ricordi, Gioca, Impostazioni, foglio della domanda.

## Portarlo sul sito di staging (proposta, serve il via)

Il sito `us-staging-s31` si costruisce dal branch fisso di staging, non da questo. Proposta: unire `claude/diario-pulito-c85387` nel branch di staging con una PR verso di lui (mai verso `main`), poi lanciare la build di staging come per le patch precedenti. Per Android basta US LIVE; un APK di staging serve solo per i tester.

## L'entrata (mockup v4.1, 15/11/2026)

Branch `claude/diario-entrata`. Sei passi: Benvenuto (una schermata al posto delle tre schede), «Il tuo account», «Da dove partite?», «Iniziamo da te» (nome, cinque forme, otto colori, compleanno; il personaggio grande prende forma e colore subito e salta quando cambi forma), «Da quando state insieme?» (solo chi crea, con le etichette miele e il nome del diario facoltativo), «Il suo posto è pronto» (codice a gruppi di quattro, Condividi / Copia, poi «Codice mandato», «Ti avviso quando entra?» e la domanda di oggi) e l'arrivo «Ora siete in due» (chi arriva cade nel posto, chi aspettava salta). Provato nel browser col finto Supabase, chiaro e scuro.

**Spostato**
- Le notifiche si chiedono sull'invito, dopo che il codice è partito, con i flussi che ci sono già (notifications.js sull'app, la stessa iscrizione web e la stessa RPC sul sito). Chi aspetta la sua persona tiene le notifiche di questo telefono (prima tornando in US venivano tolte). Chi entra col codice trova l'invito alle notifiche su Oggi, come prima.
- La posizione non è più un passo: la chiede la distanza la prima volta che si apre (`openDistanceDetail` → `openLocationDisclosure`, già così) e Impostazioni › Posizione.
- Tolti i passi dopo l'abbinamento (Notifiche, Posizione, «Tutto pronto» con il widget Ti penso, che resta in Impostazioni › Widget) e l'animazione dei due cerchi. Le schermate cambiano subito: il mockup muove solo i personaggi.

**Diverso dal mockup, e perché**
- Chi entra col codice non vede il colore dell'altra persona già occupato: prima di entrare l'app non può leggerlo (servirebbe una lettura nuova sul server col codice, SQL solo col tuo via). Dopo l'ingresso, se il colore scelto è quello dell'altra persona, si salva il primo libero e l'arrivo dice i due colori.
- Chi entra col codice scrive prima il codice (una schermata «Il vostro codice», 1 di 2) e poi «Tu» (2 di 2), da cui entra; il mockup disegna solo il percorso di chi crea.
- Il compleanno sono due menu (giorno, mese) e c'è «Conferma password»: controlli che c'erano già. Google e Apple compaiono solo dove sono attivi (Apple solo sull'iPhone); senza, sparisce anche «oppure con la mail».
- Il codice vero ha 26 caratteri: va su due righe a 22 px invece di una a 28. Sotto il codice restano la scadenza, «Puoi revocarlo quando vuoi» (anche dopo averlo mandato), «Verifica accesso» ed «Esci».
- La domanda di oggi sull'invito ha il bottone «Rispondi»; sull'arrivo la scheda «Hai già risposto…» c'è solo se hai risposto mentre aspettavi.
- La forma si salva con `set_my_character_shape`; finché la funzione non è sul server resta sul telefono (`us:character-shape:<id>`).
- La carta della porta è la stessa del resto dell'app: oggi `--us-paper` vale il beige (`ui-foundation.css`, l'alias `--us-paper:var(--us-color-paper)`), quindi la carta è più scura del mockup e i bottoni a icona beige non si staccano dal fondo. Va sistemato nelle fondamenta, per tutta l'app.

## Mockup v4.1 (15/11/2026, sera): scuro, colori, personaggi, Impostazioni, entrata

Il founder: «Sì, e unisci l'attesa». Unito `claude/attesa-dopo-invito` (la domanda di oggi dopo il codice, codice a gruppi di quattro, nota della patch). Impostazioni ed entrata le hanno fatte due agenti in branch separati (`claude/diario-impostazioni`, `claude/diario-entrata`), uniti qui; le loro differenze sono nelle sezioni qui sopra.

**Fatto**
- **Carta di notte:** token scuri in `ui-foundation.css` (fondo #16130F, beige #2A251F, scheda #211D18, inchiostro #F4EEE4 con le trasparenze, matita #F2765E, miele e cielo un filo più tenui, evidenziatori `--us-*-hl` più scuri, testo delle etichette pastello sempre #14120E `--us-on`). Segue il telefono; Impostazioni → App → Aspetto (Automatico, Chiaro, Scuro) vale per questo telefono (`UsAspetto`, `localStorage us:aspetto`, applicato prima del primo disegno). La barra di stato segue il tema (SystemBars dal JS).
- **Un colore, un significato:** tavolozza delle persone con blu, prugna e menta al posto di oro, cielo e rubino (i vecchi nomi si leggono come pesca, blu e prugna finché la migrazione non li sposta); orari e countdown in miele anche in Noi.
- **Personaggi:** cinque forme (tondo, quadrato, triangolo, goccia, nuvola) con la forma dal profilo (`character_shape`) o, prima della migrazione, dal telefono; umore «dorme» con le z; posto tratteggiato. Sulla domanda di oggi accanto a ogni risposta chi l'ha scritta, chi non ha risposto dorme; avviso «<nome> ti ha pensato» col suo personaggio e «Ricambia» (manda un ti penso); in Gioca il personaggio piccolo nell'etichetta del turno («tocca a te» col tuo, «ha giocato» con quello dell'altra persona, «aspetti <nome>» con il suo che dorme); Ricordi vuoto «La prima pagina la scrivete voi»; su Oggi senza rete i due dormono con «Siete senza rete: quello che fate parte appena torna.».
- Corretto un vecchio alias che faceva diventare beige tutta la carta (`--us-paper`).

**Diverso dal mockup**
- I colori delle persone nello scuro non sono schiariti (il colore è per ruolo in un altro file e lo schiarimento lo rendeva diverso tra i due telefoni); evidenziatori e pastelli sì.
- «nuovo» in matita rossa nei giochi non c'è: l'app non sa se un gioco non è mai stato giocato (sa solo «giocato questa settimana»).
- Dopo «Ricambia» compare l'avviso «Ti penso inviato a <nome>», non la scheda «Le hai risposto…» del mockup (che indovinava il genere).
- In Impostazioni resta visibile la barra in basso (nel mockup no).
- Gli screenshot dell'entrata sono dell'app nel browser con dati finti (l'entrata chiede un account nuovo), fatti prima della correzione della carta beige.

**Migrazione** `20261115183900_personaggi_forma_e_colori.sql`: scritta, controllata dalla sessione principale, **non applicata** (solo staging, aspetta il via del founder).
