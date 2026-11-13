# Revisione dei testi di US: rapporto

14/11/2026 · branch `claude/revisione-testi`, nato da `claude/ritocchi-visivi`.

**Stato (14/11):** approvato dal founder («Sì, come consigli») e applicato. Non applicati, come deciso: I98 («tutti e due» resta), la sezione X (i doppioni restano attivi), L14 (Apple tra i fornitori: l'app iPhone non è ancora distribuita), N4 e N5 (ora e «domani» nei promemoria: bug di codice, a parte). Fatti verificati per la sezione L: la produzione fa un backup al giorno (lista Supabase, 06–13/11); chi resta dopo l'uscita dell'altra persona tiene lo spazio con i ricordi condivisi (`get_couple_membership`). Migrazione: `20261113232109_revisione_testi.sql`. Nota per la produzione: `docs/store/PROSSIMA_PATCH_PRODUZIONE.md` (1.5.1).

## In breve

- Ho letto circa 4.900 testi: 364 domande del giorno, 296 carte dei giochi, 97 carte di Questo o quello, 13 ricette, 59 sfide e missioni, 32 premi, circa 2.900 testi dell’interfaccia, le notifiche push, la pagina d’invito e le 5 pagine legali.
- Le proposte sono 290: **P1 6 · P2 109 · P3 19 · P4 156**. A parte ci sono 25 coppie di domande del giorno doppie.
- Errori di ortografia quasi nessuno: la passata del 31/10 ha tenuto. I problemi veri sono altri quattro.
  1. **Genere indovinato:** «mandale questo codice», «vi siete messi insieme», «Siete vicini», «in amore».
  2. **Stessa cosa, due nomi:** missioni e sfida, «Da vivere» e «Le vostre idee», XP e punti, tre nomi per «La domanda di oggi» nelle notifiche, vissuto, fatto e completato.
  3. **Testi che dicono il falso:** backup nelle pagine legali, «email e password» detto anche a chi entra con Google, «US 1.0» in Impostazioni, i cuori del Ti penso descritti al contrario.
  4. **Tono da AI, poco:** qualche chiusa a effetto («Dove vi incontrate nasce il Noi», «Il tempo diventa materia»), «vivere un evento», calchi dall’inglese come «Qual è una cosa che…».

**Come leggere le tabelle:** P1 errore · P2 senso o genere · P3 tono da AI · P4 ritocco. Il numero nella colonna «#» serve per approvare o scartare: per esempio «ok tutto tranne G12 e I40».

## Le decisioni che servono da te

1. **Plurali al maschile per la coppia.** Parole come «vicini», «ci siete stati», «messi insieme», «liberi», «pensati», «persi», «divertiti», «tranquilli» sono sbagliate per una coppia di due donne.
   - Consiglio: cambiare tutte quelle con un participio o un aggettivo (circa 30 righe).
   - Lascerei invece «tutti e due» (I98, una ventina di punti), che usa anche La cosa di oggi: cambiarlo ovunque in «voi due» appesantisce le frasi.
2. **Domande doppie (sezione X, 25 coppie).** Toglierle vuol dire metterle `active = false`, cioè cambiare la banca delle domande e non solo il testo. Consiglio di non farlo in questa passata e di scegliere a parte quale tenere.
3. **Tre sfide da fare insieme arrivano anche a chi vive a distanza** (S1–S3: abbraccio, messaggio nascosto, giornata perfetta). Si sistema cambiando `mode` da `any` a `near` nel catalogo: è un update, ma non di testo. Consiglio: sì, nella stessa migrazione.
4. **Pagine legali (sezione L).** Prima di toccarle mi servono due fatti.
   - **Backup:** l’informativa dice «una copia al giorno, tenuta 7 giorni», elimina-account dice «US non usa copie di backup». Quale delle due è vera con il piano Supabase di oggi?
   - **Uscita dalla coppia:** l’informativa dice «nessuno dei due può più entrarci», mentre l’app ed elimina-account dicono che la tua persona resta con i ricordi condivisi. Consiglio di allineare l’informativa all’app.
5. **US Plus** (I84): «Avvisatemi» e «Vi avviseremo» parlano alla coppia, ma l’iscrizione vale per un solo account. Consiglio «Avvisami» e «Ti avviseremo».
6. **Ritocchi leggeri delle carte dei giochi** (sezione G: 18 calchi «Qual è una cosa che…» e 5 «davvero» di troppo). Consiglio di applicarli.

## Dove finiscono le modifiche

- **Testi del database** (domande, carte, sfide, premi): una migrazione con soli `update`. Le carte cambiate prendono `version + 1`. I giorni già mostrati tengono il testo a cui avete risposto, quelli futuri prendono il nuovo.
- **Interfaccia:** le stringhe e le chiavi di `i18n-en.js`, con la traduzione inglese aggiornata.
- **Notifiche** (`notification-core.mjs`, promemoria del calendario): per arrivare in produzione serve il deploy delle funzioni Supabase.
- **Testi nativi Android** (widget «Siete vicini» e «in amore», `UsPushNotices.java`): si vedono solo con un APK nuovo.

## Bug trovati che non sono testi (propongo di farli a parte)

- **Promemoria del calendario:** l’ora nel testo usa l’orologio del server (UTC). Per un evento alle 20:30 si legge «alle 19:30», d’estate due ore prima (`calendar-reminders-worker/index.ts:243`). In più, il promemoria della sera prima non dice «domani».
- **Countdown:** `countdown.js` mette Orbita al livello 9 e Cromo al 12, ma il server li sblocca all’8 e al 10. La tessera bloccata e «Prossimo sblocco» dicono livelli diversi.
- **Codice morto con testi in inglese:** «💬 Today · …» (`app.js:3704`, `#todayStatusPill` non esiste più) e circa 480 chiavi di `i18n-en.js` che nel codice non si trovano più: si possono ripulire a parte.
- **`scripts/i18n-extract.mjs` non parte su Windows:** cerca i file in `F:\F:\…`.

## Q · Domande del giorno (27)


### Genere (plurale riferito alla coppia)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| Q1 | P2 | ricordi-40 | Ricordi una volta in cui ci siamo persi insieme? Dov’eravamo? | Ricordi una volta in cui abbiamo perso la strada? Dov’eravamo? | «Persi» al maschile: sbagliato per due donne |
| Q2 | P2 | gioco-31 | Se diventassimo famosi per una sciocchezza, quale sarebbe? | Se diventassimo celebri per una sciocchezza, quale sarebbe? | «Celebri» vale per ogni coppia, «famosi» no |
| Q3 | P2 | gioco-43 | Con un giorno da miliardari, qual è la prima cosa assurda che compreremmo? | Con un miliardo per un giorno, qual è la prima cosa assurda che compreremmo? | «Miliardari» è maschile plurale riferito alla coppia |

### Senso, giorno di uscita, convivenza

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| Q4 | P2 | desideri-15 | Se potessi farmi un regalo qualsiasi, senza limiti, quale sarebbe? | Senza limiti di spesa, cosa mi regaleresti? | Si legge anche «se io potessi farmi un regalo» |
| Q5 | P2 | noi_adesso-24 | Cosa vorresti che sapessi della tua settimana, prima che cominci? | Cosa vorresti che sapessi della settimana che ti aspetta? | Esce di lunedì: la settimana è già cominciata |
| Q6 | P2 | noi_adesso-52 | Che voto daresti alla tua settimana finora, e cosa la farebbe salire di un punto? | Che voto daresti alla settimana scorsa, e cosa farebbe salire questa di un punto? | Di lunedì «finora» sono poche ore |
| Q7 | P2 | vicinanza-16 | Qual è il tuo abbraccio preferito: al risveglio, al rientro o prima di dormire? | Qual è il tuo abbraccio preferito: all’arrivo, alla partenza o prima di dormire? | «Al risveglio, al rientro» presuppongono la convivenza |

### Tono da AI

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| Q8 | P3 | desideri-06 | Quale concerto, spettacolo o evento vorresti vivere con me? | A quale concerto, spettacolo o evento vorresti andare con me? | «Vivere un evento» è lingua da pubblicità |
| Q9 | P3 | desideri-37 | Quale festa di paese o sagra ti piacerebbe vivere insieme? | A quale festa di paese o sagra ti piacerebbe andare insieme? | A una sagra si va |
| Q10 | P3 | desideri-49 | Quale serata fuori ti piacerebbe vivere vestendoci eleganti? | Quale serata elegante ti piacerebbe passare con me? | «Vivere», e gerundio con soggetto diverso (tu/noi) |
| Q11 | P3 | profonda-21 | Quale promessa silenziosa senti di mantenere ogni giorno con me? | Quale promessa mai detta mantieni ogni giorno con me? | «Promessa silenziosa» + «senti di»: vago, difficile rispondere |

### Ritocchi

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| Q12 | P4 | desideri-25 | Quale desiderio piccolo potremmo realizzare entro un mese? | Quale piccolo desiderio potremmo realizzare entro un mese? | Ordine delle parole innaturale |
| Q13 | P4 | desideri-46 | Quale regalo vorresti fare a noi due tra dieci anni? | Tra dieci anni, quale regalo vorresti farci? | «Fare a noi due» è goffo (vedi anche doppioni) |
| Q14 | P4 | noi_adesso-11 | Quale piccola abitudine vorresti che ci portassimo dietro questa settimana? | Quale piccola abitudine vorresti che prendessimo questa settimana? | «Portarsi dietro» fa pensare a un’abitudine vecchia |
| Q15 | P4 | noi_adesso-22 | Quale pensiero ti porti dietro da questo weekend? | Quale pensiero ti porti dietro dal weekend? | Di lunedì «questo weekend» è il prossimo |
| Q16 | P4 | noi_adesso-38 | C’è una cosa piccola che ti sta pesando un po’ in questi giorni? | C’è qualcosa che ti pesa un po’ in questi giorni? | Doppio ammorbidente: «piccola» e «un po’» |
| Q17 | P4 | noi_adesso-51 | Cosa vorresti fare stasera, se non ci fosse niente da fare? | Cosa vorresti fare stasera, senza nessun impegno? | Ripetizione «fare… da fare» |
| Q18 | P4 | noi_adesso-27, noi_adesso-36, noi_adesso-41 | Cosa ti ha fatto sorridere oggi…? / Quale piccola vittoria di oggi…? / Cosa ti ha fatto pensare a me oggi? | «oggi» → «in questi giorni» | Chi risponde al mattino non ha ancora un «oggi» |
| Q19 | P4 | profonda-30 | Quale sogno della tua infanzia si è avverato in un modo inaspettato? | C’è un sogno d’infanzia che si è avverato, anche in modo inaspettato? | «Quale» dà per certo che uno si sia avverato |
| Q20 | P4 | profonda-36 | Quale tua qualità speri che io abbia preso un po’ da te? | Quale qualità speri che io abbia preso un po’ da te? | «Tua» e «da te» dicono la stessa cosa |
| Q21 | P4 | profonda-44 | Cosa vorresti fare di più, preoccupandoti di meno? | Cosa vorresti fare di più, con meno pensieri? | Il gerundio si legge sia come modo sia come condizione |
| Q22 | P4 | ricordi-33 | Quale insegnante ti è rimasto nel cuore, e per cosa? | Quale insegnante ricordi ancora con affetto, e per cosa? | «Rimasto» dà l’insegnante per maschio; terzo «cuore» |
| Q23 | P4 | ricordi-42 | Quale amicizia d’infanzia vorresti rivedere, anche solo per un caffè? | Quale amicizia d’infanzia vorresti ritrovare, anche solo per un caffè? | Si rivede una persona, non un’amicizia |
| Q24 | P4 | vicinanza-19 | Quale piccola sorpresa ti renderebbe felice questa settimana? | Quale piccola sorpresa ti renderebbe felice questo weekend? | Esce di venerdì: la settimana è quasi finita |
| Q25 | P4 | vicinanza-25 | Cosa c’è di più romantico, secondo te, in un giorno qualsiasi? | Qual è la cosa più romantica, per te, in un giorno qualsiasi? | «Di più» senza termine di paragone |
| Q26 | P4 | vicinanza-38 | Quale parte della mia voce ti piace di più: quando rido, quando sussurro o quando racconto? | Come ti piace di più la mia voce: quando rido, quando sussurro o quando racconto? | Le opzioni sono momenti, non «parti» |
| Q27 | P4 | vicinanza-51 | Qual è il mio modo di salutarti che ti piace di più quando vado via? | Quando vado via, quale mio modo di salutarti ti piace di più? | Si legge «ti piace di più quando vado via» |

## G · Carte dei giochi (60)


### Senso: opzioni che non rispondono, frasi ambigue (P2)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| G1 | P2 | confrontatevi-007 · Q | Se potessimo vivere un anno in un’altra città, cosa cercheresti per prima cosa? | Se potessimo vivere un anno da un’altra parte, cosa cercheresti per prima cosa? | O1, O3 e O4 non parlano di città |
| G2 | P2 | confrontatevi-041 · O1 | A sorpresa, fidati | A sorpresa, mi fido | Chi risponde non organizza: «fidati» lo dice l’altro |
| G3 | P2 | scopritevi-003 · Q | C’è qualcosa su cui hai cambiato idea da quando ci conosciamo, e che forse io continuo ad attribuire alla vecchia versione di te? | C’è qualcosa su cui hai cambiato idea da quando ci conosciamo, e che forse io non so ancora? | Contorta: non si capisce cosa «attribuisco» |

### Genere nelle opzioni, singolare (P2)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| G4 | P2 | quanto_mi_conosci-066 · O1 | Carico, si riparte | A mille, si riparte | Aggettivo maschile, si legge riferito alla persona |
| G5 | P2 | quanto_mi_conosci-066 · O2 | Neutro, è un giorno come un altro | Normale, è un giorno come un altro | Come sopra |
| G6 | P2 | quanto_mi_conosci-066 · O3 | Lento, non parlatemi | A rilento, non parlatemi | Come sopra |
| G7 | P2 | quanto_mi_conosci-069 · O2 | Il DJ ufficiale | Scelgo io la musica | Ruolo al maschile («il DJ») |
| G8 | P2 | quanto_mi_conosci-069 · O3 | Navigatore e snack | Mappa e snack | Ruolo al maschile («navigatore») |

### Genere al plurale riferito alla coppia (P2)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| G9 | P2 | confrontatevi-004 · Q | Dopo una discussione, cosa ti aiuta davvero a tornare vicini? | Dopo una discussione, cosa ti aiuta a fare pace? | «Vicini» è maschile; «davvero» superfluo |
| G10 | P2 | e_se-004 · O4 | Metterla da parte e dormire tranquilli | Metterla da parte e dormire in pace | «Tranquilli» è maschile |
| G11 | P2 | quanto_mi_conosci-074 · O4 | Una volta in cui ci siamo aiutati | Un aiuto nel momento giusto | «Aiutati» è maschile |
| G12 | P2 | rivivete-030 · O3 | Ci siamo scambiati qualcosa insieme | Uno scambio, nello stesso momento | «Scambiati» è maschile; «scambiati insieme» ridondante |
| G13 | P2 | rivivete-032 · O3 | Ci siamo scritti nello stesso momento | Abbiamo scritto nello stesso momento | «Scritti» è maschile |
| G14 | P2 | rivivete-034 · Q | Racconta una nostra serata in cui ci siamo divertiti come non succedeva da tempo. | Racconta una nostra serata in cui abbiamo riso come non succedeva da tempo. | «Divertiti» è maschile |
| G15 | P2 | rivivete-035 · Q | C’è un posto in cui siamo stati che, secondo te, ci ha avvicinati? Cosa è successo lì? | C’è un posto visitato insieme che, secondo te, ci ha avvicinato? Cosa è successo lì? | «Stati», «avvicinati» maschili; con «ci» l’accordo è facoltativo |

### Tono e lunghezza (P3)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| G16 | P3 | confrontatevi-006 · Q | Cosa rende speciale, per te, una giornata normale tra noi? | Cosa rende bella, per te, una giornata normale tra noi? | «Speciale» è parola gonfiata |
| G17 | P3 | e_se-001 · Q | Abbiamo un weekend libero ma possiamo scegliere una sola cosa: fare finalmente qualcosa che rimandiamo da mesi oppure partire senza programmare quasi nulla. Cosa scegli? | Un weekend libero e una sola scelta: la cosa che rimandiamo da mesi o partire senza programma? | 169 caratteri, troppo lunga per il telefono |
| G18 | P3 | confrontatevi-002 · Q | Abbiamo tre giorni completamente liberi: preferiresti scoprire un posto che non conosciamo ancora o tornare in un posto che per noi significa già qualcosa? | Abbiamo tre giorni liberi: preferiresti un posto che non conosciamo ancora o uno che per noi significa già qualcosa? | Lunga; «completamente» non aggiunge niente |

### Ritocchi: confrontatevi ed e_se (P4)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| G19 | P4 | confrontatevi-001 · Q | Se avessimo una domenica completamente libera e nessun impegno, cosa vorresti davvero che facessimo? | Se avessimo una domenica senza impegni, cosa vorresti che facessimo? | «Libera» e «nessun impegno» dicono la stessa cosa |
| G20 | P4 | confrontatevi-015 · O4 | Che restiamo gentili, anche nel pieno | Che restiamo gentili, anche a caldo | «Nel pieno» di cosa? Frase tronca |
| G21 | P4 | confrontatevi-032 · Q | Una persona molto saggia ci offre un solo consiglio sulla nostra coppia. Su cosa lo chiedi? | Una persona molto saggia può darci un solo consiglio sulla nostra coppia. Su cosa lo chiedi? | Un consiglio offerto non si chiede |
| G22 | P4 | confrontatevi-046 · Q | Una sera libera: i soliti amici di sempre o persone nuove da conoscere? | Una sera libera: gli amici di sempre o persone nuove da conoscere? | «Soliti» e «di sempre» si ripetono |

### Ritocchi: quanto_mi_conosci (P4)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| G23 | P4 | quanto_mi_conosci-016 · Q e P | Q: …cosa succede dentro di te? · P: Quando {subject} si ferma e non fa proprio niente, cosa succede dentro di sé? | Q: …cosa succede? · P: Quando {subject} si ferma e non fa proprio niente, cosa succede? | «Sé» non si riferisce al soggetto; O3 e O4 sono azioni |
| G24 | P4 | quanto_mi_conosci-024 · O3 | Canto anche io, per confondermi | Canto anche io, per mimetizzarmi | «Confondermi» sembra «andare in confusione» |
| G25 | P4 | quanto_mi_conosci-036 · Q e P | Q: …Come va? · P: …Come va? | Q: …Come fai? · P: …Come fa? | «Come va?» suona come un saluto |
| G26 | P4 | quanto_mi_conosci-054 · O3 | Quello che prende chi è al tavolo | Quello che prende chi è con me | «Chi è al tavolo» è poco chiaro |
| G27 | P4 | quanto_mi_conosci-055 · P | Quale di questi poteri cambierebbe di più la vita di tutti i giorni di {subject}? | Quale di questi poteri cambierebbe di più la vita quotidiana di {subject}? | Troppi «di» in fila |
| G28 | P4 | quanto_mi_conosci-061 · Q e P | Q: Quale gesto ti fa sentire più amore, in una giornata qualunque? · P: Quale gesto fa sentire più amore a {subject}, in una giornata qualunque? | Q: In quale gesto senti più amore, in una giornata qualunque? · P: In quale gesto {subject} sente più amore, in una giornata qualunque? | «Ti fa sentire più amore» è innaturale e ambiguo |

### Ritocchi: ridete, rivivete, scopritevi (P4)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| G29 | P4 | ridete-001 · Q | Dobbiamo aprire un ristorante insieme. Chi di noi si farebbe licenziare prima, e perché? | Lavoriamo insieme in un ristorante. Chi di noi si farebbe licenziare prima, e perché? | Il ristorante è nostro: nessuno ci licenzia |
| G30 | P4 | ridete-003 · Q | Siamo in una stanza della fuga e mancano due minuti… | Siamo in un’escape room e mancano due minuti… | In Italia si dice «escape room» |
| G31 | P4 | ridete-010 · O3 | Trasformarlo subito in un’avventura | Trasformare tutto in un’avventura | «Lo» non si riferisce a niente |
| G32 | P4 | ridete-053 · Q | Chi di noi due non resiste e svela come va a finire? | Chi di noi due non resiste e svela il finale? | Non si dice di cosa |
| G33 | P4 | ridete-055 · Q | Partecipiamo a una gara di coppie in TV. Come si chiama la nostra squadra, e qual è il nostro grido? | Gara di coppie in TV: come si chiama la nostra squadra, e qual è il grido di battaglia? | «Il nostro grido», senza «di battaglia», resta tronco |
| G34 | P4 | rivivete-007 · Q | Pensando all’inizio di noi, cosa ti manca di più di quel periodo? | Dei nostri primi tempi, cosa ti manca di più? | «L’inizio di noi» suona tradotto |
| G35 | P4 | scopritevi-001 · Q | C’è qualcosa che faccio per te che probabilmente considero insignificante, ma che per te conta molto più di quanto penso? | C’è qualcosa che faccio per te senza darci peso, e che invece ti importa molto? | Lunga e contorta; «per te» ripetuto |
| G36 | P4 | scopritevi-038 · Q | Quando scopri qualcosa che ti piace tantissimo, una canzone, un libro, un posto, cosa ne fai? | Quando scopri qualcosa che ti piace tantissimo (una canzone, un libro, un posto), cosa ne fai? | L’elenco tra virgole si legge male |
| G37 | P4 | scopritevi-047 · O1 | Programma ogni ora | Tutto programmato, ora per ora | Si legge come un ordine («programma!») |

### Calco «Qual è un/una…» (P4)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| G38 | P4 | confrontatevi-033 · Q | Qual è una cosa noiosa che, fatta con me, diventa quasi divertente? | Quale cosa noiosa, fatta con me, diventa quasi divertente? | Calco dall’inglese |
| G39 | P4 | rivivete-001 · Q | Qual è un giorno qualunque tra noi che rivivresti volentieri, proprio perché non aveva niente di speciale? | Quale giorno qualunque tra noi rivivresti volentieri, proprio perché non aveva niente di speciale? | Calco dall’inglese |
| G40 | P4 | rivivete-006 · Q | Qual è una volta in cui ho fatto qualcosa che proprio non ti aspettavi da me? | Ricordi una volta in cui ho fatto qualcosa che proprio non ti aspettavi da me? | Calco dall’inglese |
| G41 | P4 | rivivete-008 · Q | Qual è un luogo che ormai non riesci più a vedere senza pensare a noi? | Quale luogo ormai non riesci più a vedere senza pensare a noi? | Calco dall’inglese |
| G42 | P4 | rivivete-019 · Q | Qual è un piccolo salvataggio tra noi che ricordi bene? Chi ha salvato chi, e da cosa? | Ricordi un piccolo salvataggio tra noi? Chi ha salvato chi, e da cosa? | Calco dall’inglese |
| G43 | P4 | rivivete-023 · Q | Qual è un’attesa tra noi rimasta negli annali, un ritardo o una risposta che non arrivava? Racconta… | Ricordi un’attesa tra noi rimasta negli annali, un ritardo o una risposta che non arrivava? Racconta… | Calco dall’inglese |
| G44 | P4 | scopritevi-002 · Q | Qual è una parte di te che pensi io abbia capito bene solo a metà? | Quale parte di te pensi che io abbia capito solo a metà? | Calco; «bene solo a metà» si contraddice |
| G45 | P4 | scopritevi-004 · Q | Qual è una cosa che ti riesce bene e che secondo te nessuno nota davvero? | C’è una cosa che ti riesce bene e che secondo te nessuno nota? | Calco; «davvero» superfluo |
| G46 | P4 | scopritevi-007 · Q | Qual è un complimento che ti è rimasto in testa per anni, e chi te l’aveva fatto? | Quale complimento ti è rimasto in testa per anni, e chi te l’aveva fatto? | Calco dall’inglese |
| G47 | P4 | scopritevi-008 · Q | Qual è una piccola abitudine che hai quando nessuno ti vede e che non mi hai mai raccontato? | Hai una piccola abitudine, quando nessuno ti vede, che non mi hai mai raccontato? | Calco dall’inglese |
| G48 | P4 | scopritevi-010 · Q | Qual è una domanda che vorresti che ti facessi più spesso? | Quale domanda vorresti che ti facessi più spesso? | Calco dall’inglese |
| G49 | P4 | scopritevi-024 · Q | Qual è una decisione piccola, presa anni fa quasi per caso, senza la quale oggi la tua vita non sarebbe la stessa? | C’è una piccola decisione, presa anni fa quasi per caso, senza cui oggi la tua vita sarebbe diversa? | Calco dall’inglese |
| G50 | P4 | scopritevi-031 · Q | Qual è un pezzo della tua vita prima di noi che vorresti farmi vedere almeno una volta: un posto, una persona, un’abitudine? | Quale pezzo della tua vita prima di noi vorresti farmi vedere almeno una volta: un posto, una persona, un’abitudine? | Calco dall’inglese |
| G51 | P4 | scopritevi-032 · Q | Qual è una cosa di te che ti piace davvero, ma che fai fatica a dire ad alta voce? | Cosa ti piace davvero di te, ma fai fatica a dire ad alta voce? | Calco dall’inglese |
| G52 | P4 | scopritevi-033 · Q | Qual è una tua marachella di anni fa che non hai mai confessato a nessuno? | Quale tua marachella di anni fa non hai mai confessato a nessuno? | Calco dall’inglese |
| G53 | P4 | scopritevi-037 · Q | Qual è un torto piccolissimo che ancora oggi non hai digerito? Tipo… | Quale torto piccolissimo non hai ancora digerito? Tipo… | Calco dall’inglese |
| G54 | P4 | scopritevi-048 · Q | Qual è una cosa che hai imparato a fare da grande e che ancora ti dà soddisfazione? | Cosa hai imparato a fare da grande che ancora ti dà soddisfazione? | Calco dall’inglese |
| G55 | P4 | scopritevi-055 · Q | Qual è una cosa piccola che ti emoziona sempre, anche se non lo dai a vedere? | Quale piccola cosa ti emoziona sempre, anche se non lo dai a vedere? | Calco dall’inglese |

### «Davvero» di riempimento (P4)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| G56 | P4 | confrontatevi-011 · Q | Arriva il tuo compleanno. Cosa speri davvero che succeda? | Arriva il tuo compleanno. Cosa speri che succeda? | Riempitivo |
| G57 | P4 | confrontatevi-023 · Q | Per te, cosa vuol dire davvero passare del tempo insieme? | Per te, cosa vuol dire passare del tempo insieme? | Riempitivo |
| G58 | P4 | quanto_mi_conosci-001 · Q e P | …cosa preferisci davvero da me… · …cosa preferisce davvero da te… | …cosa preferisci da me… · …cosa preferisce da te… | Riempitivo |
| G59 | P4 | quanto_mi_conosci-039 · Q e P | …cosa succede davvero? (Q e P) | …cosa succede? (Q e P) | Ripetuto anche in O1 «Ti ascolto davvero» |
| G60 | P4 | quanto_mi_conosci-057 · Q e P | Che tipo di vacanza ti ricarica davvero? · Che tipo di vacanza ricarica davvero {subject}? | Che tipo di vacanza ti ricarica? · Che tipo di vacanza ricarica {subject}? | Riempitivo |

## S · Sfide della settimana, Questo o quello, ricette, premi (35)


### Sfide della settimana: chi può farle

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| S1 | P2 | any-hug-twenty | Abbracciatevi per almeno venti secondi: vince chi molla per ultimo. | Testo ok; nel catalogo `mode` da `any` a `near` | A distanza non si può, e `any` ci arriva |
| S2 | P2 | any-hidden-note | Nascondete un piccolo messaggio in un posto dove verrà trovato per caso. | Nascondetevi a vicenda un piccolo messaggio, da trovare per caso. (e `mode` → `near`) | Da lontano non si fa; e chi lo trova? |
| S3 | P2 | any-perfect-day-plan | Organizzate a turno metà di una giornata perfetta, senza svelare il programma. | Organizzate ognuno metà di una giornata perfetta, senza svelare il programma. (e `mode` → `near`) | Serve una giornata insieme; «a turno» confonde |

### Sfide della settimana: testi e titoli brevi

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| S4 | P2 | far-window-morning | Appena svegli, fotografate la vista dalla vostra finestra. | Appena vi svegliate, fotografate la vista dalla vostra finestra. | «Svegli» è maschile |
| S5 | P2 | near-tourists-at-home (T e S) | T: Fate i turisti nella vostra città per un pomeriggio, foto ricordo comprese. S: Turisti a casa | T: Andate in gita nella vostra città per un pomeriggio, foto ricordo comprese. S: In gita in città | «I turisti» è maschile; «a casa» sembra dentro casa |
| S6 | P2 | far-same-cup (S) | La stessa colazione | Colazione alla stessa ora | Il titolo lungo dice stessa ora, non stesso cibo |
| S7 | P2 | far-my-street, far-favourite-corner, far-my-spot-today (S) | La mia strada · Il mio angolo preferito · Il mio posto di oggi | Sotto casa · L’angolo preferito · Il posto di oggi | Carta fatta e Ricordo hanno due foto: «mio» di chi? |
| S8 | P2 | any-intentional-memory (T) | Create un ricordo intenzionale: una foto, una nota e qualcosa di nuovo. | Fate insieme una cosa nuova e salvatela con una foto e una nota. | Non si capisce cosa fare; «intenzionale» è un calco |
| S9 | P4 | any-intentional-memory (S) | Un ricordo voluto | Una cosa nuova | «Voluto» stona; così segue il titolo lungo |
| S10 | P4 | far-my-street (T) | Fotografate la strada di casa, come la vedete appena uscite. | Fotografate la strada sotto casa, come la vedete appena uscite. | «La strada di casa» è la via del ritorno |
| S11 | P4 | far-same-sky | Fotografate il vostro cielo stasera, alla stessa ora. | Una sera, fotografate il vostro cielo alla stessa ora. | La sfida dura una settimana, «stasera» no |
| S12 | P4 | far-thought-photo | Mandatevi la foto di qualcosa che oggi vi ha fatto pensare a chi la riceve. | Mandatevi la foto di qualcosa che oggi vi ha fatto pensare all’altra persona. | «A chi la riceve» è contorto |
| S13 | P4 | far-comfort-food | Scegliete lo stesso tipo di comfort food e mangiatelo insieme in call. | Scegliete lo stesso tipo di comfort food e mangiatelo insieme in chiamata. | Le altre sfide dicono «in chiamata» |
| S14 | P4 | any-future-letter (T e S) | T: …e salvatela in un posto sicuro. S: Una lettera per tra un anno | T: …e mettetela in un posto sicuro. S: Lettera da aprire tra un anno | «Per tra» stona; «salvatela» sa di file |
| S15 | P4 | any-week-photo | Fate una foto che rappresenti questa settimana di voi. | Fate una foto che racconti la vostra settimana. | «Questa settimana di voi» è un calco |
| S16 | P4 | near-breakfast (S) | Colazione fuori | Colazione o caffè fuori | Il titolo lungo dice anche merenda e caffè |

### Missioni (in app solo nello storico delle fatte)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| S17 | P2 | any-home-photo | Scegliete insieme una nuova foto Home per US. | Scegliete insieme una nuova foto per Oggi. | La schermata si chiama Oggi, non Home |

### Ricette (domande dal calendario, dai Ricordi, dalle idee)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| S18 | P1 | calendar_upcoming-001 | Di «{title}», il {date}, qual è la parte che aspetti di più? | «{title}», {date}: qual è la parte che aspetti di più? | Con 8 e 11 esce «il 8», «il 11» |

### Questo o quello

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| S19 | P2 | swipe-027 | O: Dirci quasi tutto / Avere spazi propri | O: Dirci tutto / Avere spazi propri | «Quasi tutto» contiene già gli spazi propri |
| S20 | P2 | swipe-075, swipe-085, swipe-097 (seconda opzione) | La lascio a te · Racconti tu · Tu ai fornelli | Lascio scegliere · Ascolto · Io a tagliare | Nel risultato il «tu» delle opzioni cambia persona |
| S21 | P4 | swipe-001 | Una serata perfetta per noi sarebbe più bella fuori casa o sul divano? | La serata perfetta per noi: fuori casa o sul divano? | «Perfetta» e «più bella» insieme non reggono |
| S22 | P4 | swipe-012 | Ti divertirebbe scegliere a turno una serata senza poter dire di no? | Ti divertirebbe scegliere a turno una serata a cui non si può dire di no? | Sembra che chi sceglie non possa dire no |
| S23 | P4 | swipe-026 | O: Dipende troppo | O: Dipende | «Dipende troppo» non si dice |
| S24 | P4 | swipe-028 | Ti piacerebbe avere una canzone nuova che diventa nostra ogni anno? | Ti piacerebbe avere ogni anno una canzone nuova che diventi nostra? | Sembra la stessa canzone ogni anno |
| S25 | P4 | swipe-032 | Se avessimo solo due ore insieme, preferisci fare qualcosa o non fare assolutamente niente? | Se avessimo solo due ore insieme, preferiresti fare qualcosa o non fare assolutamente niente? | «Se avessimo» vuole «preferiresti», come swipe-020 |
| S26 | P4 | swipe-033 | Un mio vocale di cinque minuti: lo ascolti tutto o a velocità doppia? | Un mio vocale di cinque minuti: lo ascolti con calma o a velocità doppia? | «Tutto» e «a velocità doppia» non si escludono |

### Premi di livello

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| S27 | P2 | ti_penso_hearts (D) | Quando mandi un Ti penso, all'altro arriva un'esplosione di cuori nei vostri colori. | Quando ricevi un Ti penso, arriva un’esplosione di cuori nei vostri colori. | Lo sceglie e lo vede chi riceve; «all’altro» è maschile |
| S28 | P2 | sky_ours (D) | Le stelle della sera in cui vi siete messi insieme, sopra la vostra città. | Le stelle della sera in cui è iniziata la vostra storia, sopra la vostra città. | «Messi» è maschile; uguale in oggi-look.js:22 |
| S29 | P2 | oggi_theme_cinematic, oggi_theme_moonlight, oggi_effect_bokeh, oggi_theme_seasonal (T) | Cinematic · Moonlight · Bokeh romantico · Tema delle stagioni | Cinema · Chiaro di luna · Luci sfocate · Stagioni | La galleria di Oggi li chiama già così |
| S30 | P3 | frame_chrome (D) | Uno stile per il countdown di Oggi: il tempo diventa materia. | Uno stile per il countdown di Oggi: cifre lucide come il metallo. | Frase a effetto che non dice com’è |
| S31 | P3 | pet_accessory_gala (D) | Papillon o collana di perle, per le sere speciali del vostro Compagno. | Papillon o collana di perle, per le serate eleganti del vostro Compagno. | «Speciali» non dice niente |
| S32 | P4 | accent_cherry, accent_champagne, accent_ice (D) | I controlli diventano rosso ciliegia: selezioni, progressi, navigazione. · Controlli e progressi in oro chiaro, come una festa a due. · Controlli in azzurro ghiaccio, nitidi e calmi. | Selezioni, progressi e navigazione diventano rosso ciliegia. · Selezioni e progressi in oro chiaro, come una festa a due. · Selezioni in azzurro ghiaccio, nitide e calme. | «Controlli» è gergo da sviluppatori (anche progression.js:36) |
| S33 | P4 | effect_pulse (D) | Il simbolo US respira piano, ogni pochi secondi. | Il simbolo US respira piano. | «Ogni pochi secondi» è un calco dall’inglese |
| S34 | P4 | app_icon_gold, ti_penso_hearts, ti_penso_letter (T) | Icona d'oro · Ti penso animato · Ti penso «lettera» | Icona «Oro» · Ti penso «Cuori» · Ti penso «Lettera» | Stesso schema di Icona «Neon» e Icona «Notte» |

### Tipografia (P4, raggruppato)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| S35 | P4 | oggi_effect_aurora, ti_penso_hearts, theme_blue_hour, oggi_theme_seasonal, app_icon_neon, app_icon_night, app_icon_gold | un'aurora, all'altro, un'esplosione, quarto d'ora, l'anno, d'estate, d'autunno, d'inverno, L'icona (×3), Icona d'oro | Apostrofo tipografico ’ ovunque | Sfide, carte e ricette usano già ’ |

## I · Interfaccia dell’app (121)


### Accesso, registrazione e blocco (index.html, public-auth.js, app.js, app-lock.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I1 | P2 | index.html:292 | Un'email per te. Dopo la verifica potrai creare il vostro spazio o accettare un invito. | Un account a testa. Dopo la verifica potrai creare il vostro spazio o accettare un invito. | Sembra annunciare un’email in arrivo. |
| I2 | P4 | index.html:290 | US · INIZIATE DA QUI | US · INIZIA DA QUI | Il resto della schermata è al tu. |
| I3 | P2 | index.html:326 | Hai scelto il tuo account Google. Conferma una cosa e poi create il vostro spazio o accettate un invito. | Hai scelto il tuo account Google. Conferma una cosa, poi potrai creare il vostro spazio o accettare un invito. | Salto tu/voi nella stessa frase. |
| I4 | P2 | public-auth.js:40 | Se l’indirizzo può ricevere il messaggio, troverai le istruzioni nella tua email. | Se l’indirizzo ha un account, troverai le istruzioni nella tua email. | «Può ricevere il messaggio» non si capisce. |
| I5 | P4 | index.html:316 | Ti invieremo un collegamento se l'indirizzo è associato a un account. | Se l’indirizzo ha un account, ti mandiamo le istruzioni. | Pulsante e conferma dicono «istruzioni»; più semplice. |
| I6 | P2 | public-auth.js:104 | Verifica email non attiva. Registrazione sospesa. | Registrazione non disponibile adesso. Riprova più tardi. | Messaggio tecnico, non dice cosa fare. |
| I7 | P4 | index.html:335 (solo lettore di schermo) | Questa schermata è disponibile soltanto dopo aver aperto un link di recupero valido. | Apri il link di recupero che ti abbiamo mandato per email. | Dice cosa fare ed è più corto. |
| I8 | P2 | app-lock.js:38 | Uscirai da US su questo telefono. Per rientrare userai email e password. | Uscirai da US su questo telefono. Poi dovrai accedere di nuovo. | Falso per chi entra con Google. |
| I9 | P2 | app-lock.js:37 | Accedi con email e password | Accedi di nuovo | Come sopra: esiste anche «Continua con Google». |
| I10 | P2 | app-lock.js:47 | Per sicurezza, accedi di nuovo con email e password. | Per sicurezza, accedi di nuovo. | Come sopra. |
| I11 | P2 | app.js:1170, app.js:1171 | Accedi di nuovo con email e password per continuare. / Accedi con email e password per entrare in US. | Accedi di nuovo per continuare. / Accedi per entrare in US. | Sulla stessa schermata c’è anche Google. |

### Onboarding e invito (index.html, onboarding.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I12 | P4 | index.html:253 | …le risposte si svelano quando avete risposto voi due. E un Ti penso quando vuoi, con un tocco. | …le risposte si svelano quando avete risposto voi due. E un Ti penso quando volete, con un tocco. | Slide tutta al voi, qui salta al tu. |
| I13 | P4 | index.html:258 | Ricordi, calendario e giochi. Più vivete insieme, più cresce la vostra Sintonia e si sbloccano sorprese. | Ricordi, calendario e giochi. Più cose fate insieme, più cresce la vostra Sintonia e si sbloccano sorprese. | «Vivete insieme» si legge «convivete». |
| I14 | P4 | index.html:360, index.html:376 | Crea il nostro US (scheda) / Crea il nostro spazio (pulsante) | Crea il nostro spazio (tutti e due) | Stessa azione, due nomi a una schermata di distanza. |
| I15 | P2 | index.html:401 | Il codice resta qui fino alla scadenza, finché non chiudi US. Un codice nuovo annulla il precedente. Condividilo soltanto con la tua persona. | Il codice resta qui finché non scade o chiudi US. Uno nuovo annulla il precedente. Condividilo solo con la tua persona. | Due limiti di fila: non si capisce quale vale. |
| I16 | P4 | index.html:405, onboarding.js:1514 | Verifica accesso partner | Verifica accesso | «Partner»: altrove è sempre «la tua persona». |
| I17 | P2 | onboarding.js:1352 (fuori lista) | `${ownName}`, invita la tua persona: mandale questo codice. | `${ownName}`, manda questo codice alla tua persona. | «Mandale» si legge al femminile. |
| I18 | P3 | onboarding.js:908 | Scegli il tuo: lo vedete uguale tutti e due, e quello della tua persona resta suo. Dove vi incontrate nasce il Noi. | Scegli il tuo: lo vedete uguale tutti e due, e quello della tua persona resta suo. | Chiusa a effetto che non aggiunge informazioni. |
| I19 | P3 | onboarding.js:1351 | Scegli il tuo: lo vedete uguale tutti e due, e potrai cambiarlo in Impostazioni. Dove vi incontrate nasce il Noi. | Scegli il tuo: lo vedete uguale tutti e due, e potrai cambiarlo in Impostazioni. | Come sopra. |
| I20 | P3 | onboarding.js:907 (fuori lista) | `${partner}` ha accettato l’invito ed è `${…}`, tu `${…}`. Dove vi incontrate nasce il vostro colore. | `${partner}` ha accettato l’invito ed è `${…}`, tu `${…}`. | Come sopra. |
| I21 | P4 | onboarding.js:51 | Controlla nome e data: il nome deve avere da 1 a 40 caratteri e la data deve essere valida. | Controlla il nome (1–40 caratteri) e la data. | Troppo lungo; onboarding.js:171 usa già questa forma. |
| I22 | P4 | onboarding.js:1353 | La sessione è conservata. Puoi riprovare o uscire. | Il tuo accesso resta valido: puoi riprovare o uscire. | «Sessione conservata» è gergo tecnico. |

### Oggi (app.js, cosa-di-oggi.js, index.html)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I23 | P2 | app.js:2612 | Ha lasciato un segnale per te. | Ti ha mandato un Ti penso. | Riguarda il Ti penso ma ricorda «Lasciato per te». |
| I24 | P4 | app.js:244, app.js:5733, app.js:5736 | Ancora nessun segnale / Ultimo segnale da `${partnerName}` | Ancora nessun Ti penso / Ultimo Ti penso da `${partnerName}` | Stessa funzione, due nomi. |
| I25 | P4 | app.js:5754 | L’altro profilo non è ancora collegato | La tua persona non è ancora collegata | «Profilo» è tecnico; il termine c’è già. |
| I26 | P4 | app.js:686 | Le attivo da solo appena la rete risponde. Con il Wi-Fi è subito. | Le attivo appena la rete risponde. Con il Wi-Fi è subito. | Altrove US è femminile («US è bloccata»). |
| I27 | P2 | app.js:3478, app.js:3483 | Mi hai commosso / `${partner}`: mi hai commosso | Mi hai fatto commuovere / `${partner}`: mi hai fatto commuovere | Si legge al maschile; questa forma è neutra. |
| I28 | P2 | index.html:517 | Un momento, sulla vostra foto. | Un conto alla rovescia sulla vostra foto. | «Un momento» si legge «aspetta un attimo». |
| I29 | P4 | index.html:567 | Come vuoi che diciamo le parole di «Come stai»? Vale per te, nell'app e nel widget. | Come vuoi le parole di «Come stai»? Vale per te, nell’app e nel widget. | Giro di parole; apostrofo dritto. |
| I30 | P4 | index.html:1133 | Mettete US sulla schermata Home del telefono. | Metti US sulla schermata Home del telefono. | Il widget è per telefono; cosa-di-oggi.js:22 dice «Metti». |
| I31 | P4 | cosa-di-oggi.js:19 | Salvate il vostro primo Ricordo / il primo Ricordo | Salvate il vostro primo ricordo / il primo ricordo | Maiuscola solo per la scheda Ricordi. |
| I32 | P3 | cosa-di-oggi.js:185 | Continuate così, insieme | Continuate così | Chiusa da coach; «insieme» non aggiunge nulla. |

### Domanda sulla distanza (index.html, distance.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I33 | P2 | index.html:580, index.html:992 | Come vi vedete? (foglio) / Come vi vedete (Impostazioni) | Vi vedete spesso? | «Come vi vedete» vuol dire «come vi giudicate». |
| I34 | P2 | index.html:584, distance.js:18 | Viviamo lontani / Vi vedete spesso o vivete lontani? | Viviamo a distanza / Vi vedete spesso o vivete a distanza? | «Lontani» indovina il genere della coppia. |
| I35 | P4 | index.html:584 | Città diverse, a distanza | Città diverse | Dopo la riga sopra ripeterebbe il titolo. |
| I36 | P4 | index.html:586 | …Se condividete la posizione, decide la distanza vera. | …Se condividete la posizione, conta la distanza vera. | «Decide» suona strano qui. |
| I37 | P4 | index.html:992 | Sceglie la sfida della settimana | Serve per la sfida della settimana | Non si capisce chi sceglie. |
| I38 | P2 | distance.js:66 | Grazie: le missioni ora sono pensate per voi | Grazie: ora la sfida è scelta per voi | Le missioni non esistono più (DECISIONS.md:470). |

### «Missioni» rimaste dopo la sfida della settimana

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I39 | P2 | index.html:493, app.js:686 | Ti penso, risposte e missioni, anche a US chiusa. | Ti penso, risposte e sfide, anche a US chiusa. | Nome vecchio; nelle notifiche c’è «La sfida della settimana». |
| I40 | P2 | index.html:780 | Missioni ed eventi (titolo con pulsante) | Idee ed eventi | Il pulsante apre «Le vostre idee» (progression.js:1542). |
| I41 | P2 | index.html:773, app.js:5002 | Missioni, eventi vissuti e mesiversari: le cose che fate insieme. | Sfide, eventi vissuti e mesiversari: le cose che fate insieme. | Nome vecchio delle missioni. |

### Noi: calendario, bacheca, lavagna (index.html, couple-notes.js, calendar.js, noi-v2.js, lavagna.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I42 | P2 | index.html:737 | Le cose senza data: si scrive qui sopra | Per le cose senza data | «Qui sopra» non indica niente di chiaro. |
| I43 | P2 | couple-notes.js:160, couple-notes.js:162 / index.html:791, index.html:795, app.js:4269 | Da vivere (post-it fisso in Noi) / Le vostre idee (foglio e Ricordi) | Un solo nome per la lista, per esempio «Le vostre idee» | Stessa lista, due nomi tra Noi e Ricordi. |
| I44 | P4 | couple-notes.js:278, couple-notes.js:470 | L’altra persona ha staccato questo post-it. Se continui a scrivere, lo salvo di nuovo. | La tua persona ha staccato questo post-it. Se continui a scrivere, lo salvo di nuovo. | Il termine in uso è «la tua persona». |
| I45 | P2 | calendar.js:977 | È collegato a una vostra idea: resta nel calendario. | Non si può eliminare: è collegato a una vostra idea. | Non dice che l’eliminazione non è avvenuta. |
| I46 | P4 | noi-v2.js:105 | Dove è iniziato tutto | Da qui è iniziato tutto | «Dove» riferito a una data. |
| I47 | P4 | noi-v2.js:187 | Un giorno fa | Ieri | Più naturale. |
| I48 | P4 | lavagna.js:224, lavagna.js:239 | La lavagna è piena: pulitela per continuare | La lavagna è piena: puliscila per continuare | Il pulsante accanto dice «Pulisci», al tu. |

### Eventi (events.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I49 | P2 | events.js:253 (con 252, 254, 282, 292) | Segna come fatto / …potrete segnarlo come vissuto / Gli eventi già completati restano nello storico. / Già completato / Un evento completato resta nello storico | Segna come vissuto / Gli eventi già vissuti restano nello storico. / Già vissuto / Un evento vissuto resta nello storico | Tre parole per lo stesso stato. |
| I50 | P2 | events.js:45 (same_day, before_creation) | Evento vissuto ♡ La Sintonia cresce con gli eventi programmati in anticipo | Evento vissuto ♡ Niente punti: valgono gli eventi creati in anticipo | Non dice che stavolta i punti non arrivano. |

### Sintonia (index.html, app.js, progression.js, companions.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I51 | P3 | index.html:780 | Le cose che completate insieme continuano ad alimentare la Sintonia. | Le cose che completate insieme fanno crescere la Sintonia. | Verbo gonfiato. |
| I52 | P3 | index.html:781 | Una risposta condivisa o una partita completata conta davvero. | Conta ogni risposta condivisa e ogni partita finita. | «Conta davvero»: enfasi vuota. |
| I53 | P3 | index.html:782 | Il primo gesto significativo del giorno dà progresso, uno al giorno. | Conta il primo gesto di ogni giorno. | «Significativo» gonfiato; «del giorno… al giorno» ripete. |
| I54 | P4 | index.html:783 | I vostri traguardi restano parte della Sintonia. | Anche i vostri traguardi fanno crescere la Sintonia. | «Restano parte» è vago. |
| I55 | P4 | index.html:771, index.html:773, app.js:5002, app.js:5039 | Ultime crescite / La prossima crescita apparirà qui / Crescita non disponibile | Ultimi progressi / Il prossimo progresso apparirà qui / Progressi non disponibili | «Crescite» al plurale suona strano. |
| I56 | P4 | companions.js:41 | Un nuovo compagno, in Sintonia | Sbloccato con la Sintonia | Sotto «È arrivato Milo» non si capisce. |
| I57 | P4 | index.html:931, progression.js:41, progression.js:282 / progression.js:796, progression.js:807, companions.js:41 | il vostro Compagno / un compagno | «compagno» minuscolo ovunque; «Compagni» resta il nome della funzione | Maiuscola incoerente. |

### Temi, effetti e countdown (oggi-look.js, countdown.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I58 | P4 | oggi-look.js:277 | Cambia l’atmosfera di Oggi: luce, colori e dettagli. La foto resta vostra. | Cambia il tema di Oggi: luce, colori e dettagli. La vostra foto non cambia. | «Atmosfera» è un’altra funzione; «resta vostra» ambiguo. |
| I59 | P2 | oggi-look.js:22 | Le stelle della sera in cui vi siete messi insieme, sopra la vostra città. | Le stelle della sera in cui è iniziata la vostra storia, sopra la vostra città. | «Messi» indovina il genere. |
| I60 | P2 | oggi-look.js:295 (fuori lista) | A che ora vi siete messi insieme? | A che ora è iniziata la vostra storia? | Come sopra. |
| I61 | P3 | countdown.js:14 | Il tempo diventa materia. | Cifre lucide come il metallo. | Frase a effetto che non descrive lo stile. |

### Ricordi, Lasciato per te, riepilogo dell’anno (index.html, moments-albums.js, left-for-you.js, year-recap.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I62 | P2 | index.html:1302 (con index.html:1152) | Quello che non conservate in Lasciato per te sparisce dopo 30 giorni. | Quello che non conservate in Lasciato per te sparisce 30 giorni dopo l’apertura. | Accanto a «Si apre una volta» sembra contraddirlo. |
| I63 | P4 | moments-albums.js:1450 | Lasciato per voi | Lasciato per te | Nome della funzione scritto in due modi. |
| I64 | P4 | left-for-you.js:283 | Un momento (etichetta del video) | Un video | Nel compositore la scheda si chiama «Video». |
| I65 | P2 | left-for-you.js:1656 | Non so ancora a chi lasciarlo. Riprova. | La tua persona non è ancora collegata. Riprova tra poco. | Non spiega il problema. |
| I66 | P4 | left-for-you.js:1678, left-for-you.js:1685 | Il file è troppo grande (massimo 25 MB). | Il vocale è troppo grande (massimo 25 MB). / La foto è troppo grande (massimo 25 MB). | «File» è generico; il video ha già la sua frase. |
| I67 | P2 | year-recap.js:42 | cosa lasciata per te / cose lasciate per voi | cosa lasciata / cose lasciate | Singolare al tu, plurale al voi. |
| I68 | P3 | year-recap.js:97 | Il prossimo anno comincia oggi / Grazie per tutto quello che vi siete dati. | Per ora è tutto (senza seconda riga) | Chiusa a effetto; stona nel recap dei primi giorni. |
| I69 | P2 | year-recap.js:29 (fuori lista) | Pari: vi siete pensati tanto quanto | Pari: lo stesso numero di Ti penso | «Pensati» indovina il genere. |

### Stories (stories.js, fix4.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I70 | P2 | stories.js:518 | Il partner non ha stories attive (quando manca il nome) | La tua persona non ha Stories attive | «Il partner» è maschile. |
| I71 | P4 | stories.js:47, stories.js:48 | Stories del partner / Foto profilo partner (voci per lettore di schermo) | Stories della tua persona / Foto profilo della tua persona | stories.js:968 dice già «della tua persona». |
| I72 | P4 | stories.js:52, stories.js:316, stories.js:518, fix4.js:178, fix4.js:179 | Aggiungi una story / la story / stories / Chiudi storia / Aggiungi storia | Story e Stories con la maiuscola, ovunque | Nome della funzione scritto in tre modi. |
| I73 | P2 | stories.js:298 | Pubblico… | Carico la Story… | «Pubblico» si legge «aperto a tutti». |
| I74 | P4 | stories.js:316, stories.js:317 | Non riesco a pubblicare la story / Pubblicazione non riuscita. | Non riesco a caricare la Story / Caricamento non riuscito. | US promette «niente pubblico». |
| I75 | P4 | stories.js:501 | Foto non acquisita. | Foto non scattata. Riprova. | Gergo; non dice cosa fare. |

### Gioca (games.js, app.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I76 | P2 | games.js:582 | Userete il gioco di oggi. / Userete 1 dei `${left}` giochi di oggi. | Userete la partita di oggi. / Userete 1 delle `${left}` partite di oggi. | Il contatore conta partite, non giochi. |
| I77 | P4 | games.js:166 | Nuovi giochi domani. | Nuove partite domani. | Come sopra: i giochi restano gli stessi. |
| I78 | P4 | games.js:151 | Per voi: per oggi avete giocato, il prossimo arriva domani | Per voi: per oggi avete giocato, la prossima partita domani | «Il prossimo» non si riferisce a niente. |
| I79 | P4 | games.js:146 | Per voi: una partita preparata per voi | Per voi: una partita preparata apposta | «Per voi» ripetuto. |
| I80 | P2 | games.js:308 | La troverete giocando. | La troverai giocando. | La legge solo chi riceve la domanda. |
| I81 | P2 | games.js:313 | Una domanda scritta da voi, per questa settimana. | Scrivi tu la domanda di questa settimana. | La scrive una persona sola, a turno. |
| I82 | P4 | games.js:951 | Le tue 8 scelte sono dentro. | Le tue 8 scelte sono salvate. | «Sono dentro» è un calco. |
| I83 | P4 | app.js:3686, index.html:253, games.js:1001 | …si sbloccano / si svelano / si scoprono quando avete risposto voi due. | Un solo verbo ovunque, per esempio «si svelano» | Stessa regola detta in tre modi. |

### Impostazioni e US Plus (settings.js, app.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I84 | P2 | settings.js:302, settings.js:314, app.js:3512 | Avvisatemi quando arriva / Vi avviseremo qui su US ♡ / Vi avviseremo quando arriva ♡ / …e con «Avvisatemi» vi diciamo quando arriva. | Avvisami quando arriva / Ti avviseremo qui su US ♡ / Ti avviseremo quando arriva ♡ / …e con «Avvisami» ti diciamo quando arriva. | Vale per un solo account; «Non avvisarmi più» è al tu. |
| I85 | P4 | settings.js:302 | Un abbonamento per la coppia: paga uno, vale per tutti e due. | Un abbonamento per la coppia: se ne paga uno, vale per tutti e due. | «Paga uno» è maschile e sbrigativo. |
| I86 | P2 | settings.js:382 | Quando trovi qualcosa nella busta | Quando la tua persona ti lascia qualcosa | «Busta» non compare altrove: è Lasciato per te. |
| I87 | P4 | settings.js:404 | Prova i feedback | Prova suoni e vibrazione | Inglese; il gruppo si chiama «Suoni e vibrazione». |
| I88 | P4 | settings.js:439 | Impulso richiesto. Se non lo senti, controlla le impostazioni di vibrazione del telefono. | Vibrazione inviata. Se non la senti, controlla le impostazioni del telefono. | «Impulso richiesto» è linguaggio da macchina. |
| I89 | P4 | settings.js:499 | Serve una connessione. Riprova sotto Wi-Fi. | Serve una connessione. Riprova con il Wi-Fi. | «Sotto Wi-Fi» è un calco. |

### Widget e posizione (widget-hub.js, app.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I90 | P1 | widget-hub.js:208 | Il launcher non supporta aggiunta automatica. Usa i widget della Home. | Questo telefono non aggiunge widget da solo. Usa i widget della Home. | Manca l’articolo; «launcher» è gergo. |
| I91 | P4 | widget-hub.js:19, widget-hub.js:24 | …la batteria di chi ami… / Come state tu e chi ami, con un’emoji… | …la batteria della tua persona… / Come state tu e la tua persona, con un’emoji… | Il termine in uso è «la tua persona». |
| I92 | P4 | widget-hub.js:21 | La domanda del giorno e a chi tocca rispondere. Mai le risposte. | La domanda di oggi e a chi tocca rispondere. Mai le risposte. | Il widget stesso si chiama «La domanda di oggi». |
| I93 | P1 | app.js:1523 | Errore sync posizione | Non riesco ad aggiornare la posizione. Riprova. | Inglese rimasto; non dice cosa fare. |
| I94 | P4 | app.js:1504, app.js:1741, app.js:4013 | Connessione non pronta | Connessione non pronta. Riprova tra poco. | Non dice cosa fare. |

### Plurali al maschile per la coppia (più file)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I95 | P2 | app.js:1411, app.js:1419, app.js:1441, app.js:1410, index.html:451, widget-hub.js:67 | Siete vicini / Sotto i 3 km vedete solo «vicini» / vicini | Siete a meno di 3 km / Sotto i 3 km vedete solo «meno di 3 km» / meno di 3 km | Per due donne sarebbe «vicine». Anche nel widget Android. |
| I96 | P2 | progression.js:823, cosa-di-oggi.js:78 | Oggi ci siete stati. / Oggi ci siete stati tutti e due ♡ | Oggi c’eravate. / Oggi c’eravate voi due ♡ | «Stati» e «tutti» indovinano il genere. |
| I97 | P2 | calendar.js:555, calendar.js:556, calendar.js:584 | Liberi insieme · Nessun impegno per oggi. / Liberi tutto il giorno / Liberi insieme `${windowLabel}` | Giornata libera · Nessun impegno per oggi. / Tutto il giorno / Insieme `${windowLabel}` | «Liberi» è maschile; la riga ha già l’etichetta «Insieme». |
| I98 | P4 | index.html:881, index.html:895, settings.js:302, moments-albums.js:603, lavagna.js:271, noi-v2.js:290 e altri (~20) | tutti e due | voi due, dove la frase lo regge | Anche «tutti e due» è maschile; «voi due» è già usato. |

### Fuori lista: parole neutre di «Come stai» (member-status.js)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I99 | P2 | member-status.js:20 (forma neutra) | in amore | col cuore pieno | «Essere in amore» si dice degli animali in calore. Anche nel widget Android: serve un APK nuovo. |
| I100 | P4 | member-status.js:28 | studio | sui libri | Da solo è ambiguo: verbo o stanza. |

### Tipografia (P4, raggruppata)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I101 | P4 | index.html:292, 310, 311, 315, 316, 320, 567, 796, 799, 833; app.js:5253, app.js:5549; events.js:252; calendar.js:1199 (×2); lavagna.js:323 | Un'email, all'accesso, l'email, l'accesso, l'indirizzo, nell'app, un'idea, dell'idea, L'abbiamo, l'abbiamo, L'avete, l'ora, l'ultimo | ’ al posto di ' | Il repo usa l’apostrofo tipografico. |
| I102 | P4 | index.html:427 | Su Safari tocca Condividi, poi “Aggiungi alla schermata Home”. | Su Safari tocca Condividi, poi «Aggiungi alla schermata Home». | Nell’interfaccia si usano le «». |

### Primo avvio e invito

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I103 | P2 | riga 105 · app.js:735, onboarding.js:1100 | La rete non risponde: le attivo da solo appena può | La rete non risponde: le attivo appena torna | «da solo» maschile per US; chi «può»? |

### Oggi, Personalizza, Sintonia

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I104 | P2 | riga 1111 · settings.js:676, index.html:1021 | Tutto aggiornato · US 1.0 | Tutto aggiornato · US 1.5 (la versione vera, non scritta a mano: piccolo cambio di codice) | l’app è alla 1.5, «1.0» è fisso |
| I105 | P2 | righe 1119 (app.js:4908), 1121–1122 e 1253–1259 (progression.js:912, :928), 1129 (progression.js:737), 473 (progression.js:1375) | «… XP», «+{xp} XP ♡», «mancano {n} XP» | «punti», come in riga 872 (app.js:4904, stessa scheda) e righe 1288–1301 (weekly-challenge.js) | stesso conteggio chiamato «XP» e «punti» |
| I106 | P4 | riga 1113 · settings.js:191 | Questa data regola giorni insieme, mesiversario, anniversario e i relativi punti Sintonia. | Da questa data contiamo giorni insieme, mesiversari, anniversari e i loro punti Sintonia. | «regola… relativi» suona da modulo |

### Ti penso, Lasciato per te, Conservati

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I107 | P1 | righe 288–292, 799 · moments-albums.js:1465 (aria-label) | Apri Una foto lasciato da {name} (anche «Una voce», «Musica» … «lasciato») | Apri: {kind}, da {name} | «Una foto lasciato»: accordo sbagliato, maiuscola a metà |

### Noi: calendario, note, giochi

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I108 | P2 | riga 621 · games.js:318 | Questa settimana crea {name} | Questa settimana tocca a {name} | si legge come un ordine: «crea Bea» |
| I109 | P2 | riga 623 · games.js:318 | Cambia {date} | Si cambia {date} | sembra il testo di un pulsante |
| I110 | P4 | righe 865, 867 · games.js:1058–1059 | {name} ti ha letto {n} volte su {m} / Hai letto {name} {n} volte su {m} | {name} ha indovinato {n} volte su {m} / Con {name} hai indovinato {n} volte su {m} | «ti ha letto» non si capisce subito |
| I111 | P4 | riga 1215 · couple-notes.js:443 | {name} dice di sì. Poi resta tra le idee vissute. | {name} dice di sì: se confermi, va tra le idee vissute. | «Poi resta» non dice cosa succede |

### Il vostro anno, Come stai

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I112 | P4 | riga 1276 · member-status.js:28 | studio | sui libri | l’unico senza preposizione accanto a «al lavoro», «in palestra» |

### Impostazioni, eliminazione, segnalazioni

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| I113 | P2 | riga 1135 · settings.js:757 | …Restano senza il tuo nome. Non riceverà una notifica e lo spazio di coppia viene chiuso: nessun altro potrà entrarci. | …Restano senza il tuo nome. La tua persona non riceve notifiche; nello spazio non entrerà nessun altro. | non è chiaro chi «riceverà» |
| I114 | P2 | righe 1135, 1158 · settings.js:757 e :887 (anche pagine legali, sez. 3) | Momenti e foto … desideri, ricordi delle risposte create insieme | Ricordi e foto … idee da vivere, risposte conservate nei Ricordi | nomi che nell’app non esistono (da verificare l’ultimo) |
| I115 | P2 | righe 1134, 1157 · settings.js:756 e :886 | elenco «Cosa viene eliminato» | un solo elenco, uguale a informativa ed elimina-account (vedi sez. 3) | tre elenchi diversi per la stessa cosa |
| I116 | P2 | riga 1172 · account-deletion.js:183 | Hai già inviato diverse segnalazioni oggi. Per altro scrivi a {email}. | Hai già inviato diverse segnalazioni oggi. Per le altre scrivi a {email}. | «Per altro» si legge «peraltro» |
| I117 | P4 | righe 1148, 1162 · account-deletion.js | Eliminazione non ancora disponibile, scrivi a {email}. / Uscita dalla coppia non ancora disponibile, scrivi a {email}. | …disponibile: scrivi a {email}. | virgola tra due frasi |
| I118 | P4 | riga 723 · settings.js:480 (e :499 «Riprova sotto Wi-Fi.») | L'operazione scarica temporaneamente le foto: falla una volta quando sei sotto Wi-Fi. | Serve scaricare le foto: fallo una volta, con il Wi-Fi. | «sotto Wi-Fi», «L’operazione»; apostrofo dritto |
| I119 | P4 | riga 277 (moments-albums.js:81 «Descrizione (opzionale)») contro righe 800, 998–1005, 1058 («facoltativa») | opzionale / facoltativa | sempre «facoltativa» | due parole per la stessa cosa |
| I120 | P4 | righe 414, 487, 723, 808–821 (left-for-you.js:743), 1149 | Il quarto d'ora… / l'avete vissuta / L'operazione… / L'ultima cosa… / Non trovo l'email… | ’ al posto di ' | apostrofo dritto in testi visibili |
| I121 | P4 | righe 138, 140 · countdown.js:94 (aria-label) | {title}, {n} giorni . Modifica countdown | togliere lo spazio quando {label} è vuoto | spazio prima del punto |

## N · Notifiche, invito e altri testi del server (17)


### Notifiche: titoli

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| N1 | P1 | notification-core.mjs:106 | US. · Calendar | US. · Calendario (con la versione inglese a parte) | inglese nel titolo italiano; Android dice «Calendario» |
| N2 | P2 | notification-core.mjs:45 «US. · La domanda di oggi»; :94 e :97 «US. · Domanda del giorno»; UsPushNotices.java:67–77 «US. · Domanda di oggi» (anche righe 108 e 257 delle chiavi i18n) | tre titoli diversi | sempre «US. · La domanda di oggi» | tre nomi per la stessa funzione |

### Notifiche: testi

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| N3 | P2 | calendar-reminders-worker/index.ts:201 | {name} ti ricorda — {title} alle {ora} ♡ | {name} ti ricorda: {title} alle {ora} ♡ | col trattino si legge «si ricorda di te» |
| N4 | P2 | calendar-reminders-worker/index.ts:240–244 | l’ora del promemoria viene da `getHours()` | ora di Roma (correzione nel codice) | il server gira in UTC: 1–2 ore indietro (da verificare) |
| N5 | P2 | calendar-reminders-worker/index.ts:201 (promemoria «1 giorno prima» ed eventi di tutto il giorno, inviati la sera prima alle 18) | Francesco ti ricorda — Cena alle 20:30 ♡ | {name} ti ricorda: {title}, domani alle {ora} ♡ (serve il codice) | non dice che l’evento è domani |
| N6 | P4 | calendar-reminders-worker/index.ts:103 e :199 | Tra un'ora — {title} | Tra un’ora: {title} | apostrofo dritto, trattino lungo |
| N7 | P4 | notification-core.mjs:102 | {name} ha finito {game}: tocca a te | {name} ha giocato a «{game}»: tocca a te | «ha finito Scopritevi»: i nomi sono imperativi |
| N8 | P4 | notification-core.mjs:103 | {game}: le vostre risposte sono pronte ♡ | Risposte pronte per «{game}» ♡ | con «Quanto mi conosci?» esce «?:» |
| N9 | P4 | notification-core.mjs:96 | {name} ha già risposto alla domanda di oggi. Tocca a te ♡ | {name} ha già risposto. Tocca a te ♡ | il titolo dice già «La domanda di oggi» |
| N10 | P4 | notification-core.mjs:105 | Questa settimana la domanda per voi la scegli tu. | Questa settimana la domanda la scegli tu. | più corta; Android dice già così |
| N11 | P4 | notification-core.mjs:62, :70, :76 | Oggi è un anno insieme / Oggi sono {n} anni insieme / Oggi è un mese insieme | Oggi fate un anno insieme / Oggi fate {n} anni insieme / Oggi fate un mese insieme | «è un anno insieme» suona tradotto |
| N12 | P4 | UsPushNotices.java:80 contro notification-core.mjs:99 | {who} ha completato una missione. Ora tocca a te | {who} ha fatto una missione. Ora tocca a te | stesso evento, due frasi diverse |
| N13 | P3 | UsPushNotices.java:101 (mesiversario, anniversario, 100 giorni) | Oggi è un giorno speciale per voi ♡ | Oggi avete qualcosa da festeggiare ♡ | «speciale» è generico |
| N14 | P4 | UsPushNotices.java:77, :104, :110, :113 | C'è / l'invito / l'ultimo | C’è / l’invito / l’ultimo | apostrofo dritto; web e iPhone usano ’ |

### Invito e altri testi

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| N15 | P2 | invito.html (titolo h1) | Ti aspettano su US ♡ | La tua persona ti aspetta su US ♡ | ti invita una persona sola |
| N16 | P2 | invito.html (primo paragrafo; ui-extra riga 42) | La tua persona ha creato il vostro spazio privato e ti ha invitato a entrare. | Ha creato il vostro spazio privato e ti invita a entrare. (con il titolo proposto sopra) | «invitato» suona maschile |
| N17 | P4 | us-widget-state/index.ts:147 e :157 | Partner (nome di ripiego) | La tua persona | ovunque altrove il ripiego è «La tua persona» |

## L · Pagine legali (30)


### Contraddizioni tra pagine e con l’app (le più urgenti)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| L1 | P1 | elimina-account.html:107 contro privacy.html:85 | «Con il piano attuale US non usa copie di backup dei dati. Se questo cambierà, aggiorneremo questa pagina.» / informativa: «Il database viene copiato ogni giorno in un backup gestito da Supabase… 7 giorni» | elimina-account: «Il database viene copiato ogni giorno in un backup gestito da Supabase: un dato eliminato può restarci al massimo 7 giorni, senza essere usato.» | le due pagine dicono il contrario |
| L2 | P2 | privacy.html:92 (§7), anche privacy-en.html:92 | Lo spazio di coppia si chiude subito e nessuno dei due può più entrarci. | Lo spazio di coppia si chiude subito: tu non puoi più entrarci e nessun altro può aggiungersi. | contraddice app ed elimina-account: la tua persona resta |
| L3 | P2 | elimina-account.html:99 | La tua persona non riceve una notifica. Lo spazio di coppia viene chiuso: nessun altro potrà entrarci. La tua persona conserva l’archivio dei ricordi condivisi. | La tua persona non riceve notifiche e conserva i ricordi condivisi. Nello spazio di coppia non potrà entrare nessun altro. | «chiuso» e «conserva l’archivio»: li vede ancora? |
| L4 | P2 | privacy.html:84 contro elimina-account.html:106 | «(identificativo dell’account e della coppia, date, esito)» / «identificativo dell’account, date, canale della richiesta (app o web) ed esito» | in entrambe: «identificativo dell’account e della coppia, date, canale della richiesta (app o web) ed esito» | il database salva tutti e due (private.account_deletions) |
| L5 | P2 | privacy.html:89, elimina-account.html:86–99, settings.js:756–757 | tre elenchi diversi di cosa si cancella e cosa resta | un solo elenco, uguale nei tre punti | batteria/errori solo nell’informativa; lavagna e post-it mancano altrove |
| L6 | P2 | privacy.html:89, elimina-account.html:98, settings.js:757 e :887 | Momenti, desideri, quiz, storie, appuntamenti, «la storia della coppia», «ricordi delle risposte create insieme» | Ricordi, idee da vivere, risposte ai giochi, Stories, impegni; spiegare o togliere «la storia della coppia» | nomi diversi da quelli dell’app |

### Informativa sulla privacy (privacy.html)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| L7 | P2 | :35 | video solo in “Lasciato per te”, fino a 30 secondi o 20 MB | …fino a 30 secondi e 20 MB | valgono entrambi i limiti (left-for-you.js:15–17) |
| L8 | P2 | :42 | il messaggio dell’errore, senza indirizzi web, email o testi che hai scritto, il file e la riga, … | il messaggio dell’errore (senza indirizzi web, email o testi che hai scritto), il file e la riga, … | sembra che anche file e riga siano esclusi |
| L9 | P2 | :43 | che hai chiesto di essere avvisato e quando | la tua richiesta di avviso e la sua data | «avvisato» indovina il genere |
| L10 | P2 | :48 | Gli errori tecnici restano nel nostro database, senza servizi esterni. | Gli errori tecnici restano nel nostro database, senza servizi esterni di monitoraggio. | il database è su Supabase, che è esterno |
| L11 | P2 | :98 (§9) | e puoi revocare il consenso alla posizione in qualsiasi momento | e puoi revocare in qualsiasi momento i consensi dati (posizione, posto dalle foto, «Avvisatemi») | il consenso è la base anche di altri due |
| L12 | P2 | :92 (§7) | confermando con la password | confermando con la password (o con Google) | §5 e l’app prevedono anche Google |
| L13 | P2 | :54 (§3) | vede ciò che pubblichi…, l’ultimo livello della batteria… e… la distanza tra voi | aggiungere «il tuo “Come stai”» | manca un dato che la tabella elenca |
| L14 | P2 | :55–62 | elenco dei fornitori | se l’app iPhone è distribuita, anche in TestFlight, aggiungere Apple (notifiche) | le notifiche iPhone passano da Apple (notification-core.mjs:12) |
| L15 | P4 | :36, :37 | Posizione approssimativa di questo telefono / Livello della batteria di questo telefono | …del tuo telefono | «questo telefono» non regge se leggi dal computer |
| L16 | P4 | :72 | con regole lato database | con regole nel database | gergo tecnico |
| L17 | P4 | :80 | gli errori tecnici dell’app vengono cancellati 30 giorni dopo; | …vengono cancellati dopo 30 giorni; | «30 giorni dopo» cosa? |
| L18 | P4 | :84 | dopo aver confermato la password (o di nuovo con Google, se accedi con Google) | dopo aver confermato con la password (o con Google, se accedi con Google) | «di nuovo con Google» zoppica |
| L19 | P4 | :89, :92 | Se eri l’ultimo membro della coppia | Se sei l’ultima persona rimasta nella coppia | stesso testo di elimina-account; tempo verbale |
| L20 | P4 | :92 | Impostazioni › Voi › Esci dalla coppia | Impostazioni › Voi due › Esci dalla coppia | la sezione si chiama «Voi due» (index.html:966) |
| L21 | P4 | :98 | è un file con i tuoi dati e i link alle tue foto, valido 7 giorni | …e i link alle tue foto; il link resta attivo 7 giorni | è il link che scade, non il file |
| L22 | P4 | tutta la pagina | il tuo partner | la tua persona | elimina-account e l’app dicono «la tua persona» |

### Termini d’uso (termini.html)

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| L23 | P2 | :26 e :27 | La versione 1.0 è una prima versione: alcune funzioni possono cambiare. / In questa prima versione US è gratuita, per entrambi. | US è in una fase iniziale: alcune funzioni possono cambiare. / Oggi US è gratuita, per entrambi. | l’app è alla 1.5 e annuncia US Plus |
| L24 | P2 | :30 | Ci concedi solo il permesso di conservarli e mostrarli al tuo partner per far funzionare l’app. | …per far funzionare l’app e, se esci dalla coppia o elimini l’account, di lasciare al partner quelli condivisi. | «solo» esclude ciò che prevede l’informativa (§6–7) |
| L25 | P2 | :42 | non rispondiamo di perdite di dati o danni indiretti | scegliere il senso: «di perdite di dati né di danni indiretti» oppure «di perdite di dati e altri danni indiretti» | non si capisce se «indiretti» vale per entrambi |
| L26 | P4 | :40 | …› Segnala un problema o un contenuto o scrivendo a | …› Segnala un problema o un contenuto, oppure scrivendo a | due «o» di fila, si perde il filo |
| L27 | P4 | :43 | dopo averlo comunicato quando possibile | avvisandoti prima, quando possibile | non è chiaro a cosa si riferisca «averlo» |
| L28 | P4 | :41 | con i suoi termini | e sono soggetti ai termini di Spotify | «con i suoi termini» è vago |
| L29 | P4 | :46 | è competente il foro di residenza del consumatore | è competente il foro del luogo di residenza o domicilio del consumatore | formula più precisa |

### Versioni inglesi

| # | P | Dove | Ora | Proposta | Perché |
|---|---|---|---|---|---|
| L30 | P2 | privacy-en.html:88, termini-en.html:44 | il link per eliminare l’account porta a /elimina-account | pagina di eliminazione anche in inglese, o un avviso | chi legge in inglese arriva su una pagina italiana |

## Doppioni nelle domande del giorno (da decidere, vedi decisione 2)

| # | Coppia | Proposta |
|---|---|---|
| X1 | vicinanza-15 / vicinanza-31 — Stessa domanda: sentirmi vicino quando sono lontano | Ritirare vicinanza-31 (la 15 è stata riscritta il 14/10) |
| X2 | vicinanza-12 / vicinanza-22 — Cosa dirti in una giornata no, due volte | Ritirare vicinanza-22 |
| X3 | vicinanza-33 / vicinanza-49 — Stessa risposta: la coccola preferita | Tenerne una (vicino c’è anche vicinanza-46, la carezza) |
| X4 | vicinanza-03 / vicinanza-44 — Il mio gesto più bello per te, due volte | Ritirare vicinanza-44 |
| X5 | ricordi-01 / ricordi-52 — Cosa hai notato di me all’inizio | Ritirare ricordi-52. Chi risponde non può sapere «prima di chiunque altro». Con l’ordine attuale del selettore, la 52 e la 01 escono in due mercoledì di fila |
| X6 | ricordi-02 / ricordi-26 — Il nostro momento da rivivere o conservare | Tenerne una |
| X7 | ricordi-10 / ricordi-36 — Una serata qualunque che ricordi bene | Ritirare ricordi-36 (ha anche «indimenticabile», tono da AI) |
| X8 | noi_adesso-05 / noi_adesso-32 / gioco-17 — Tre volte «com’è il tuo umore oggi» | Ritirare noi_adesso-05 (la 05 e la 32 escono entrambe di lunedì) |
| X9 | noi_adesso-02 / noi_adesso-38 — Cosa ti pesa in questi giorni, due volte | Tenerne una (se resta la 38, vedi ritocco sopra) |
| X10 | noi_adesso-40 / noi_adesso-51 — Tempo libero improvviso: cosa facciamo | Tenerne una |
| X11 | noi_adesso-28 / profonda-42 — La canzone del tuo momento, due volte | Ritirare profonda-42 (anche «come stai al mondo» suona strano) |
| X12 | noi_adesso-42 / scoprirsi-06 — Stessa risposta: la colazione ideale | Ritirare noi_adesso-42 («trovare» fa pensare a una casa condivisa) |
| X13 | desideri-23 / desideri-35 — Una prima volta insieme, due volte | Ritirare desideri-35 |
| X14 | desideri-02 / desideri-30 — Stessa risposta: cosa impariamo insieme | Tenerne una |
| X15 | desideri-18 / gioco-25 — Dove ceniamo stasera, senza limiti | Tenerne una |
| X16 | desideri-27 / desideri-46 — Un regalo a noi due, due volte | Ritirare desideri-46 (o ritoccarla, vedi sopra) |
| X17 | gioco-16 / gioco-26 — Il titolo della nostra storia, due volte | Tenerne una |
| X18 | gioco-07 / gioco-20 — Qualcosa che parla e racconta di noi | Tenerne una |
| X19 | gioco-04 / gioco-40 — Il nostro nome di gruppo, due volte | Tenerne una |
| X20 | scoprirsi-03 / scoprirsi-09 — Mania e rito: stessa risposta | Tenerne una |
| X21 | profonda-18 / profonda-23 — La piccola cosa bella di ogni giorno | Tenerne una |
| X22 | gioco-18 / gioco-29 — Risposta probabile identica: una faccenda di casa | Lieve: tenerne una |
| X23 | profonda-01 / profonda-07 — Il momento bello della settimana, sempre di domenica | Lieve: tenerne una |
| X24 | vicinanza-01 / noi_adesso-17 — Il mio piccolo gesto che conta, due volte | Lieve: tenerne una, o togliere «dritto al cuore» dalla 01 |
| X25 | ricordi-47 / vicinanza-27 — Il mio profumo, due volte | Lieve: tenerne una («tra mille» è frase fatta) |
