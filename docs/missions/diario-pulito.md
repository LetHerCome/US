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
